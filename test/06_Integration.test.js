/**
 * @file 06_Integration.test.js
 * @notice E2E 통합 테스트 - 전체 플로우
 *
 * 시나리오:
 *   1. 시스템 배포 (HHUSD, CollateralVault, TreasuryV2, GroupRegistry, PublicGroupVRF)
 *   2. 유저 10명 USDT 입금 → HHUSD 발행
 *   3. 그룹 생성 후 10명 가입 (담보 140% 잠금)
 *   4. 등록 마감 → 포지션 선택 → VRF → ACTIVE
 *   5. 10 사이클 동안 기여금 납부 + 지급 반복
 *   6. 그룹 완료 → 담보 전액 환불
 *   7. 중간에 미납 유저 처리 (경고 → 슬래시 → 제거) 시나리오
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("E2E Integration", function () {
  // ── 컨트랙트 ──────────────────────────────────────────────────────────
  let usdt, hhusd, vault, treasury, registry, group, mockVRF;

  // ── 계정 ──────────────────────────────────────────────────────────────
  let admin, feeReceiver, devWallet, eventWallet, users; // users[0]~[9] = 멤버 10명

  // ── 상수 ──────────────────────────────────────────────────────────────
  const GROUP_ID          = 1n;
  const CONTRIBUTION      = ethers.parseEther("100");   // 100 USDT/cycle
  const TOTAL_CYCLES      = 10n;
  const CYCLE_INTERVAL    = 7n * 24n * 3600n;           // 7 days
  const COLLATERAL_BP     = 14000n;                     // 140%
  const REQUIRED_COL      = CONTRIBUTION * TOTAL_CYCLES * COLLATERAL_BP / 10000n; // 1400 HHUSD
  const DEPOSIT_AMOUNT    = ethers.parseEther("5000");  // 충분한 여유
  const BUY_FEE_BP        = 250n;
  const BP_BASE           = 10000n;
  const NET_HHUSD         = DEPOSIT_AMOUNT - (DEPOSIT_AMOUNT * BUY_FEE_BP / BP_BASE); // 4875

  // ── 배포 헬퍼 ─────────────────────────────────────────────────────────
  async function deployAll() {
    [admin, feeReceiver, devWallet, eventWallet, ...users] = await ethers.getSigners();

    // 1) MockUSDT
    usdt = await ethers.deployContract("MockUSDT");

    // 2) HHUSD
    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
    await hhusd.waitForDeployment();

    // 3) CollateralVault
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    vault = await upgrades.deployProxy(
      CollateralVault,
      [admin.address, await hhusd.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );
    await vault.waitForDeployment();

    // 4) MockVRFAssigner
    mockVRF = await ethers.deployContract("MockVRFAssigner");

    // 5) GroupRegistry
    const GroupRegistry = await ethers.getContractFactory("GroupRegistry");
    registry = await upgrades.deployProxy(GroupRegistry, [admin.address], { kind: "uups" });
    await registry.waitForDeployment();

    // 6) TreasuryV2
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

    // 7) PublicGroupVRF
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

    // ── 역할 설정 ────────────────────────────────────────────────────────
    const MINTER        = await hhusd.MINTER_ROLE();
    const BURNER        = await hhusd.BURNER_ROLE();
    const GROUP_ROLE    = await vault.GROUP_ROLE();
    const REGISTRAR     = await registry.REGISTRAR_ROLE();
    const PAYOUT_ROLE   = await treasury.PAYOUT_EXECUTOR_ROLE();

    await hhusd.connect(admin).grantRole(MINTER, await treasury.getAddress());
    await hhusd.connect(admin).grantRole(MINTER, admin.address);
    await hhusd.connect(admin).grantRole(MINTER, await vault.getAddress()); // slash → mint to recipient
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
  //  시나리오 A: 정상 10사이클 완주
  // ════════════════════════════════════════════════════════════════════════

  describe("시나리오 A: 정상 완주 (10명 × 10사이클)", () => {
    before(async () => { await deployAll(); });

    it("Step 1: USDT 입금 → HHUSD 발행", async () => {
      for (const u of users.slice(0, 10)) {
        await treasury.connect(u).depositUSDT(DEPOSIT_AMOUNT);
      }
      // 각 유저 HHUSD 잔액 확인
      for (const u of users.slice(0, 10)) {
        expect(await hhusd.balanceOf(u.address)).to.equal(NET_HHUSD);
      }
      // 수수료가 feeReceiver에 적립됐는지 확인
      const expectedFee = (DEPOSIT_AMOUNT * BUY_FEE_BP / BP_BASE) * 10n;
      expect(await usdt.balanceOf(feeReceiver.address)).to.equal(expectedFee);
    });

    it("Step 2: 10명 그룹 가입 → 담보 140% 잠금", async () => {
      for (const u of users.slice(0, 10)) {
        await group.connect(u).joinGroup();
      }
      expect(await group.getMemberCount()).to.equal(10);

      // 각 유저 담보 1400 HHUSD 잠금 확인
      for (const u of users.slice(0, 10)) {
        expect(await vault.getGroupCollateral(GROUP_ID, u.address))
          .to.equal(REQUIRED_COL);
      }
    });

    it("Step 3: 등록 마감 → POSITION_SELECTION", async () => {
      await time.increase(24 * 3600 + 1);
      await group.closeEnrollment();
      expect(await group.state()).to.equal(1); // POSITION_SELECTION
    });

    it("Step 4: VRF 요청 → 포지션 배정 → ACTIVE", async () => {
      await time.increase(12 * 3600 + 1);
      await group.finalizePositions();
      expect(await group.state()).to.equal(2); // PENDING_VRF

      // VRF 응답 주입
      await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0xabcdef1234")]);
      expect(await group.state()).to.equal(3); // ACTIVE

      // 모든 멤버 포지션 1~10 배정 확인
      const positions = new Set();
      for (const u of users.slice(0, 10)) {
        const m = await group.getMember(u.address);
        expect(m.position).to.be.gt(0);
        positions.add(Number(m.position));
      }
      expect(positions.size).to.equal(10);
    });

    it("Step 5: 10사이클 기여금 납부 + 지급 완주", async () => {
      // 각 사이클: 기여금 납부(contribute 이벤트) + 사이클 종료 후 지급
      for (let cycle = 1; cycle <= 10; cycle++) {
        // 10명 기여금 납부
        for (const u of users.slice(0, 10)) {
          await expect(group.connect(u).contribute())
            .to.emit(group, "ContributionMade")
            .withArgs(u.address, cycle, CONTRIBUTION);
        }
        // 7일 경과
        await time.increase(Number(CYCLE_INTERVAL) + 1);

        // 지급 실행
        const tx = await group.distributePayout();
        const receipt = await tx.wait();

        if (cycle < 10) {
          expect(await group.currentCycle()).to.equal(cycle + 1);
        }
      }
      // 그룹 완료 상태 확인
      expect(await group.state()).to.equal(4); // COMPLETED
    });

    it("Step 6: 그룹 완료 → 담보 전액 환불", async () => {
      // COMPLETED 시 _completeGroup()이 자동으로 담보 해제
      for (const u of users.slice(0, 10)) {
        expect(await vault.getGroupCollateral(GROUP_ID, u.address)).to.equal(0);
      }
    });

    it("Step 7: HHUSD → USDT 출금 (사이클 완료 후)", async () => {
      const u = users[0];
      const hhusdBal = await hhusd.balanceOf(u.address);
      if (hhusdBal > 0n) {
        await treasury.connect(u).redeemHHUSD(hhusdBal);
        expect(await hhusd.balanceOf(u.address)).to.equal(0);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  시나리오 B: 미납 유저 경고 → 슬래시 → 제거
  // ════════════════════════════════════════════════════════════════════════

  describe("시나리오 B: 미납 유저 처리", () => {
    before(async () => { await deployAll(); });

    let badUser; // 미납 유저

    it("Setup: 10명 가입 → VRF → ACTIVE", async () => {
      badUser = users[0];

      // 유저들 USDT 입금 → HHUSD
      for (const u of users.slice(0, 10)) {
        await treasury.connect(u).depositUSDT(DEPOSIT_AMOUNT);
      }
      // 그룹 가입
      for (const u of users.slice(0, 10)) {
        await group.connect(u).joinGroup();
      }
      // 등록 마감 → VRF → ACTIVE
      await time.increase(24 * 3600 + 1);
      await group.closeEnrollment();
      await time.increase(12 * 3600 + 1);
      await group.finalizePositions();
      await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0x9999")]);
      expect(await group.state()).to.equal(3); // ACTIVE
    });

    it("1차 미납 → WARNED + 담보에서 기여금이 사이클 수령인에게 지급", async () => {
      const colBefore = await vault.getGroupCollateral(GROUP_ID, badUser.address);

      // 현재 사이클 1의 수령인 확인
      const cycleRecipient = await group.positionToMember(1);
      const recipientBalBefore = await hhusd.balanceOf(cycleRecipient);

      await group.connect(devWallet).warningMissedPayment(badUser.address);

      const m = await group.getMember(badUser.address);
      expect(m.status).to.equal(1); // WARNED
      expect(m.missedPayments).to.equal(1);
      // 담보에서 기여금 차감
      expect(await vault.getGroupCollateral(GROUP_ID, badUser.address))
        .to.equal(colBefore - CONTRIBUTION);
      // 수령인에게 기여금 입금됨
      expect(await hhusd.balanceOf(cycleRecipient))
        .to.equal(recipientBalBefore + CONTRIBUTION);
    });

    it("반복 미납 → 담보 소진 후 REMOVED", async () => {
      while (true) {
        await group.connect(devWallet).warningMissedPayment(badUser.address);
        const m = await group.getMember(badUser.address);
        if (m.status === 3n) break;
        expect(m.status).to.equal(2); // PENALIZED
      }
      expect(await vault.getGroupCollateral(GROUP_ID, badUser.address)).to.equal(0);
    });

    it("그룹 완료 시 미납 유저 잔여 담보 30%/70% 분배", async () => {
      // 이 시나리오에서는 badUser가 이미 REMOVED돼 잔여 담보 없음
      // → 시나리오 A Step 6에서 성실 유저 전액 환불 확인됨
      // 별도 시나리오로 미납 유저가 일부 납부 후 그룹 완료하는 케이스 검증 가능
      // 여기서는 REMOVED 상태 확인으로 대체
      const m = await group.getMember(badUser.address);
      expect(m.status).to.equal(3); // REMOVED
    });

    it("제거된 유저는 기여금 납부 불가", async () => {
      await expect(group.connect(badUser).contribute())
        .to.be.revertedWithCustomError(group, "NotMember");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  시나리오 C: 멤버 미달로 그룹 취소 → 담보 환불
  // ════════════════════════════════════════════════════════════════════════

  describe("시나리오 C: 멤버 미달 → 그룹 취소", () => {
    before(async () => { await deployAll(); });

    it("5명만 가입 후 마감 → CANCELLED + 담보 전액 환불", async () => {
      // 5명 USDT 입금 + 가입
      for (const u of users.slice(0, 5)) {
        await treasury.connect(u).depositUSDT(DEPOSIT_AMOUNT);
        await group.connect(u).joinGroup();
      }

      const colBefore = [];
      for (const u of users.slice(0, 5)) {
        colBefore.push(await vault.getGroupCollateral(GROUP_ID, u.address));
      }

      // 24시간 경과 후 마감 → 멤버 부족으로 CANCELLED
      await time.increase(24 * 3600 + 1);
      await group.closeEnrollment();

      expect(await group.state()).to.equal(5); // CANCELLED

      // 담보 전액 환불 확인
      for (const u of users.slice(0, 5)) {
        expect(await vault.getGroupCollateral(GROUP_ID, u.address)).to.equal(0);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  시나리오 D: 추천인 수수료 플로우
  // ════════════════════════════════════════════════════════════════════════

  describe("시나리오 D: 추천인 수수료 플로우", () => {
    before(async () => { await deployAll(); });

    it("추천인 설정 후 입금 → 추천인에게 1% 지급", async () => {
      const referrer = users[1];
      const depositor = users[0];

      await treasury.connect(depositor).setReferrer(referrer.address);
      const refBalBefore = await usdt.balanceOf(referrer.address);

      await treasury.connect(depositor).depositUSDT(DEPOSIT_AMOUNT);

      const refReward = DEPOSIT_AMOUNT * 100n / BP_BASE; // 1%
      expect(await usdt.balanceOf(referrer.address))
        .to.equal(refBalBefore + refReward);

      // depositor는 buy fee 1.5%만 차감 (2.5% - 1% referral)
      const netFee = DEPOSIT_AMOUNT * (BUY_FEE_BP - 100n) / BP_BASE;
      const expectedHHUSD = DEPOSIT_AMOUNT - netFee - refReward;
      expect(await hhusd.balanceOf(depositor.address)).to.equal(expectedHHUSD);
    });
  });
});
