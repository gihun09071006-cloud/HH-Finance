/**
 * @file 07_TopUp.test.js
 * @notice topUpCollateral 기능 테스트
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("topUpCollateral 테스트", function () {
  let hhusd, vault, mockVRF, group;

  let admin, devWallet, eventWallet, users;

  const GROUP_ID       = 1n;
  const CONTRIBUTION   = ethers.parseEther("100");
  const TOTAL_CYCLES   = 10n;
  const CYCLE_INTERVAL = 7n * 24n * 3600n;
  const COLLATERAL_BP  = 14000n;
  const REQUIRED_COL   = CONTRIBUTION * TOTAL_CYCLES * COLLATERAL_BP / 10000n; // 1400 HHUSD

  async function deployAll() {
    [admin, devWallet, eventWallet, ...users] = await ethers.getSigners();

    // HHUSD
    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
    await hhusd.waitForDeployment();

    // CollateralVault
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    vault = await upgrades.deployProxy(
      CollateralVault,
      [admin.address, await hhusd.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );
    await vault.waitForDeployment();

    // MockVRFAssigner
    mockVRF = await ethers.deployContract("MockVRFAssigner");

    // PublicGroupVRF
    group = await ethers.deployContract("PublicGroupVRF", [
      GROUP_ID,
      CONTRIBUTION,
      TOTAL_CYCLES,
      CYCLE_INTERVAL,
      COLLATERAL_BP,
      await vault.getAddress(),
      await mockVRF.getAddress(),
      devWallet.address,
      eventWallet.address,
    ]);

    // 역할 설정
    const MINTER     = await hhusd.MINTER_ROLE();
    const BURNER     = await hhusd.BURNER_ROLE();
    const GROUP_ROLE = await vault.GROUP_ROLE();

    await hhusd.connect(admin).grantRole(MINTER, admin.address);
    await hhusd.connect(admin).grantRole(MINTER, await vault.getAddress());
    await hhusd.connect(admin).grantRole(BURNER, await vault.getAddress());
    await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());

    // 유저 10명에게 HHUSD 충분히 발행 (담보 1400 + 여유 500)
    for (const u of users.slice(0, 10)) {
      await hhusd.connect(admin).mint(u.address, REQUIRED_COL + ethers.parseEther("2000"));
    }
  }

  async function setupActive() {
    // 10명 가입
    for (const u of users.slice(0, 10)) {
      await group.connect(u).joinGroup();
    }
    // 등록 마감 → VRF → ACTIVE
    await time.increase(24 * 3600 + 1);
    await group.closeEnrollment();
    await time.increase(12 * 3600 + 1);
    await group.finalizePositions();
    await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0xabcdef1234")]);
    expect(await group.state()).to.equal(3); // ACTIVE
  }

  // ════════════════════════════════════════════════════════════════════════
  //  테스트 케이스
  // ════════════════════════════════════════════════════════════════════════

  describe("미납 후 담보 재충전 → 잔여 담보 증가 확인", () => {
    before(async () => {
      await deployAll();
      await setupActive();
    });

    it("1회 미납 후 topUpCollateral(500 HHUSD) 호출 → vault.getGroupCollateral 증가 확인", async () => {
      const badUser = users[0];

      // 1회 미납
      await group.warningMissedPayment(badUser.address);
      const colAfterMiss = await vault.getGroupCollateral(GROUP_ID, badUser.address);
      // 담보가 CONTRIBUTION만큼 차감됐어야 함
      expect(colAfterMiss).to.equal(REQUIRED_COL - CONTRIBUTION);

      // 충전
      const topUpAmount = ethers.parseEther("500");
      await expect(group.connect(badUser).topUpCollateral(topUpAmount))
        .to.emit(group, "CollateralToppedUp")
        .withArgs(badUser.address, topUpAmount, colAfterMiss + topUpAmount);

      const colAfterTopUp = await vault.getGroupCollateral(GROUP_ID, badUser.address);
      expect(colAfterTopUp).to.equal(colAfterMiss + topUpAmount);
    });
  });

  describe("충전 후 그룹 완료 시 환불", () => {
    before(async () => {
      await deployAll();
      await setupActive();
    });

    it("80% 임계치 미달인 경우 그룹 완료 시 담보가 패널티 분배됨 (missedPayments 있어도)", async () => {
      const badUser = users[0];

      // 1회 미납 (80% 미달)
      await group.warningMissedPayment(badUser.address);

      // topUp으로 담보 복원
      const topUpAmount = ethers.parseEther("500");
      await group.connect(badUser).topUpCollateral(topUpAmount);

      // 10사이클 진행 → 그룹 완료
      for (let cycle = 1; cycle <= 10; cycle++) {
        // 미납 유저 제외한 9명 기여 (REMOVED가 아니므로 badUser도 기여 가능)
        for (const u of users.slice(0, 10)) {
          const m = await group.getMember(u.address);
          if (m.status !== 3n) { // REMOVED가 아니면
            await group.connect(u).contribute();
          }
        }
        await time.increase(Number(CYCLE_INTERVAL) + 1);
        await group.distributePayout();
      }

      expect(await group.state()).to.equal(4); // COMPLETED

      // badUser는 missedPayments=1이 있으므로 잔여 담보는 패널티 분배됨 (0이어야 함)
      const colAfter = await vault.getGroupCollateral(GROUP_ID, badUser.address);
      expect(colAfter).to.equal(0);
    });
  });

  describe("REMOVED 유저는 충전 불가", () => {
    before(async () => {
      await deployAll();
      await setupActive();
    });

    it("REMOVED 상태에서 topUpCollateral → NotMember revert", async () => {
      const badUser = users[0];

      // 담보 소진까지 미납 반복 → REMOVED
      while (true) {
        await group.warningMissedPayment(badUser.address);
        const m = await group.getMember(badUser.address);
        if (m.status === 3n) break; // REMOVED
      }

      await expect(
        group.connect(badUser).topUpCollateral(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(group, "NotMember");
    });
  });

  describe("0 금액 충전 불가", () => {
    before(async () => {
      await deployAll();
      await setupActive();
    });

    it("amount=0 → 'Amount must be > 0' revert", async () => {
      const user = users[0];
      await expect(
        group.connect(user).topUpCollateral(0)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });
});
