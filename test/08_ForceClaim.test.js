/**
 * @file 08_ForceClaim.test.js
 * @notice forceClaimPenaltyCollateral 기능 테스트
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("forceClaimPenaltyCollateral 테스트", function () {
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

    // 유저 10명에게 HHUSD 충분히 발행 (담보 + 여유)
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

  describe("80% 미납 후 개발자가 강제 처리 → 30/70 분배", () => {
    before(async () => {
      await deployAll();
      await setupActive();
    });

    it("8회 warningMissedPayment 후 forceClaimPenaltyCollateral 호출 → devWallet/eventWallet 잔액 30/70 확인", async () => {
      const badUser = users[0];

      // 8회 미납 (80% 임계치 = 10사이클 × 80% = 8회)
      // 각 미납마다 담보에서 CONTRIBUTION(100)씩 차감
      // REQUIRED_COL = 1400, 8회 미납 후 남은 담보 = 1400 - 800 = 600
      for (let i = 0; i < 8; i++) {
        await group.warningMissedPayment(badUser.address);
      }

      const m = await group.getMember(badUser.address);
      expect(m.missedPayments).to.equal(8);
      // 아직 REMOVED가 아님 (담보 충분: 1400-800=600 > 100)
      expect(m.status).to.not.equal(3n); // not REMOVED

      const remaining = await vault.getGroupCollateral(GROUP_ID, badUser.address);
      expect(remaining).to.equal(REQUIRED_COL - CONTRIBUTION * 8n);

      const devBefore   = await hhusd.balanceOf(devWallet.address);
      const eventBefore = await hhusd.balanceOf(eventWallet.address);

      // forceClaimPenaltyCollateral 호출
      await expect(group.connect(devWallet).forceClaimPenaltyCollateral(badUser.address))
        .to.emit(group, "PenaltyDistributed")
        .withArgs(
          badUser.address,
          remaining * 3000n / 10000n,
          remaining - remaining * 3000n / 10000n
        );

      const devAmount   = remaining * 3000n / 10000n;
      const eventAmount = remaining - devAmount;

      expect(await hhusd.balanceOf(devWallet.address)).to.equal(devBefore + devAmount);
      expect(await hhusd.balanceOf(eventWallet.address)).to.equal(eventBefore + eventAmount);

      // 유저는 REMOVED 상태
      const mAfter = await group.getMember(badUser.address);
      expect(mAfter.status).to.equal(3n); // REMOVED
    });
  });

  describe("80% 미달 시 revert", () => {
    before(async () => {
      await deployAll();
      await setupActive();
    });

    it("7회 미납 → forceClaimPenaltyCollateral → 'Threshold not reached' revert", async () => {
      const badUser = users[0];

      // 7회 미납 (80% 미달)
      for (let i = 0; i < 7; i++) {
        await group.warningMissedPayment(badUser.address);
      }

      const m = await group.getMember(badUser.address);
      expect(m.missedPayments).to.equal(7);

      await expect(
        group.connect(devWallet).forceClaimPenaltyCollateral(badUser.address)
      ).to.be.revertedWith("Threshold not reached");
    });
  });

  describe("devWallet 외 호출 시 revert", () => {
    before(async () => {
      await deployAll();
      await setupActive();
    });

    it("users[0]가 호출 → 'Only devWallet' revert", async () => {
      const badUser = users[1];

      // 8회 미납
      for (let i = 0; i < 8; i++) {
        await group.warningMissedPayment(badUser.address);
      }

      // users[0]가 호출 시도
      await expect(
        group.connect(users[0]).forceClaimPenaltyCollateral(badUser.address)
      ).to.be.revertedWith("Only devWallet");
    });
  });

  describe("이미 REMOVED된 유저 처리 시 revert", () => {
    before(async () => {
      await deployAll();
      await setupActive();
    });

    it("담보 소진으로 REMOVED된 유저에 대해 forceClaimPenaltyCollateral → NotMember revert", async () => {
      const badUser = users[0];

      // 담보 소진까지 미납 반복 → REMOVED
      while (true) {
        await group.warningMissedPayment(badUser.address);
        const m = await group.getMember(badUser.address);
        if (m.status === 3n) break; // REMOVED
      }

      await expect(
        group.connect(devWallet).forceClaimPenaltyCollateral(badUser.address)
      ).to.be.revertedWithCustomError(group, "NotMember");
    });
  });
});
