/**
 * @file 09_CompletionPenalty.test.js
 * @notice 그룹 완료 시 30/70 분배 E2E 테스트
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("그룹 완료 시 30/70 분배 E2E", function () {
  let usdt, hhusd, vault, treasury, registry, group, mockVRF;

  let admin, feeReceiver, devWallet, eventWallet, users;

  const GROUP_ID       = 1n;
  const CONTRIBUTION   = ethers.parseEther("100");
  const TOTAL_CYCLES   = 10n;
  const CYCLE_INTERVAL = 7n * 24n * 3600n;
  const COLLATERAL_BP  = 14000n;
  const REQUIRED_COL   = CONTRIBUTION * TOTAL_CYCLES * COLLATERAL_BP / 10000n; // 1400 HHUSD
  const DEPOSIT_AMOUNT = ethers.parseEther("5000");
  const BUY_FEE_BP     = 250n;
  const BP_BASE        = 10000n;
  const NET_HHUSD      = DEPOSIT_AMOUNT - (DEPOSIT_AMOUNT * BUY_FEE_BP / BP_BASE);

  async function deployAll() {
    [admin, feeReceiver, devWallet, eventWallet, ...users] = await ethers.getSigners();

    // MockUSDT
    usdt = await ethers.deployContract("MockUSDT");

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

    // GroupRegistry
    const GroupRegistry = await ethers.getContractFactory("GroupRegistry");
    registry = await upgrades.deployProxy(GroupRegistry, [admin.address], { kind: "uups" });
    await registry.waitForDeployment();

    // TreasuryV2
    const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
    treasury = await upgrades.deployProxy(
      TreasuryV2,
      [
        admin.address,
        await usdt.getAddress(),
        await hhusd.getAddress(),
        feeReceiver.address,
        await registry.getAddress(),
      ],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );
    await treasury.waitForDeployment();

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
    const MINTER      = await hhusd.MINTER_ROLE();
    const BURNER      = await hhusd.BURNER_ROLE();
    const GROUP_ROLE  = await vault.GROUP_ROLE();
    const REGISTRAR   = await registry.REGISTRAR_ROLE();
    const PAYOUT_ROLE = await treasury.PAYOUT_EXECUTOR_ROLE();

    await hhusd.connect(admin).grantRole(MINTER, await treasury.getAddress());
    await hhusd.connect(admin).grantRole(MINTER, admin.address);
    await hhusd.connect(admin).grantRole(MINTER, await vault.getAddress());
    await hhusd.connect(admin).grantRole(BURNER, await treasury.getAddress());
    await hhusd.connect(admin).grantRole(BURNER, await vault.getAddress());
    await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());
    await registry.connect(admin).grantRole(REGISTRAR, admin.address);
    await treasury.connect(admin).grantRole(PAYOUT_ROLE, await group.getAddress());

    // GroupRegistry에 그룹 등록
    await registry.connect(admin).registerGroup(
      GROUP_ID,
      await group.getAddress(),
      CONTRIBUTION,
      TOTAL_CYCLES
    );

    // 유저 10명에게 USDT 지급 + approve
    for (const u of users.slice(0, 10)) {
      await usdt.mint(u.address, ethers.parseEther("10000"));
      await usdt.connect(u).approve(await treasury.getAddress(), ethers.MaxUint256);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  시나리오: 일부 미납 후 그룹 완료 → 잔여 담보 30/70 분배
  // ════════════════════════════════════════════════════════════════════════

  describe("일부 미납 후 그룹 완료 → 잔여 담보 30/70 분배", () => {
    let badUser;
    let devBalBefore, eventBalBefore;
    // badUser의 담보 중 미납으로 슬래시된 금액 추적
    let totalSlashedFromBadUser = 0n;

    before(async () => {
      await deployAll();

      badUser = users[0];

      // Step 1: 유저 10명 USDT 입금 → HHUSD 발행
      for (const u of users.slice(0, 10)) {
        await treasury.connect(u).depositUSDT(DEPOSIT_AMOUNT);
      }

      // Step 2: 10명 그룹 가입
      for (const u of users.slice(0, 10)) {
        await group.connect(u).joinGroup();
      }

      // Step 3: 등록 마감 → VRF → ACTIVE
      await time.increase(24 * 3600 + 1);
      await group.closeEnrollment();
      await time.increase(12 * 3600 + 1);
      await group.finalizePositions();
      await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0xabcdef1234")]);
      expect(await group.state()).to.equal(3); // ACTIVE

      // devWallet/eventWallet 초기 잔액 기록
      devBalBefore   = await hhusd.balanceOf(devWallet.address);
      eventBalBefore = await hhusd.balanceOf(eventWallet.address);

      // Step 4: 10사이클 진행
      // 앞 5사이클: badUser 미납(warningMissedPayment), 나머지 9명 정상 기여
      // 뒤 5사이클: 전원 정상 기여
      for (let cycle = 1; cycle <= 10; cycle++) {
        if (cycle <= 5) {
          // badUser는 미납 처리
          await group.connect(devWallet).warningMissedPayment(badUser.address);
          // 나머지 9명은 정상 기여
          for (const u of users.slice(1, 10)) {
            await group.connect(u).contribute();
          }
        } else {
          // 전원 (badUser 포함) 정상 기여
          for (const u of users.slice(0, 10)) {
            const m = await group.getMember(u.address);
            if (m.status !== 3n) { // REMOVED가 아니면
              await group.connect(u).contribute();
            }
          }
        }
        await time.increase(Number(CYCLE_INTERVAL) + 1);
        await group.distributePayout();
      }

      expect(await group.state()).to.equal(4); // COMPLETED
    });

    it("그룹 완료 후 devWallet/eventWallet 잔액 → 잔여담보의 30/70 분배 확인", async () => {
      // badUser는 5회 미납 → 담보에서 5 × 100 = 500 HHUSD 슬래시됨 (사이클 수령인에게)
      // 그룹 완료 시점 badUser 잔여 담보 = 1400 - 500 = 900
      // 단, 완료 시 missedPayments > 0이므로 잔여 담보 전체 패널티 분배
      const expectedRemaining = REQUIRED_COL - CONTRIBUTION * 5n; // 900 HHUSD

      const devExpected   = expectedRemaining * 3000n / 10000n;
      const eventExpected = expectedRemaining - devExpected;

      const devBalAfter   = await hhusd.balanceOf(devWallet.address);
      const eventBalAfter = await hhusd.balanceOf(eventWallet.address);

      expect(devBalAfter - devBalBefore).to.equal(devExpected);
      expect(eventBalAfter - eventBalBefore).to.equal(eventExpected);
    });

    it("성실 유저 담보 전액 환불 → groupCollateral = 0", async () => {
      // 미납 없는 유저(users[1]~users[9])의 담보는 전액 환불
      for (const u of users.slice(1, 10)) {
        expect(await vault.getGroupCollateral(GROUP_ID, u.address)).to.equal(0);
      }
    });
  });
});
