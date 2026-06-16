const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PublicGroupVRF", function () {
  let group, vault, hhusd, mockVRF;
  let admin, devWallet, eventWallet, users;

  const GROUP_ID        = 1n;
  const CONTRIBUTION    = ethers.parseEther("100");
  const TOTAL_CYCLES    = 10n;
  const CYCLE_INTERVAL  = 7n * 24n * 3600n; // 7 days
  const COLLATERAL_BP   = 14000n;            // 140%
  const REQUIRED_COLLATERAL = (CONTRIBUTION * TOTAL_CYCLES * COLLATERAL_BP) / 10000n; // 1400 HHUSD

  // 그룹 컨트랙트 배포 헬퍼
  async function deployGroup() {
    return await ethers.deployContract("PublicGroupVRF", [
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
  }

  beforeEach(async () => {
    [admin, devWallet, eventWallet, ...users] = await ethers.getSigners();

    // HHUSD 배포
    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
    await hhusd.waitForDeployment();

    // CollateralVault 배포
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    vault = await upgrades.deployProxy(
      CollateralVault,
      [admin.address, await hhusd.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );
    await vault.waitForDeployment();

    // MockVRFCoordinator 대신 MockVRFAssigner 사용
    mockVRF = await ethers.deployContract("MockVRFAssigner");

    // HHUSD 역할 설정
    const MINTER = await hhusd.MINTER_ROLE();
    const BURNER = await hhusd.BURNER_ROLE();
    await hhusd.connect(admin).grantRole(MINTER, admin.address);
    await hhusd.connect(admin).grantRole(MINTER, await vault.getAddress());
    await hhusd.connect(admin).grantRole(BURNER, await vault.getAddress());

    // GROUP_ROLE은 그룹 컨트랙트 배포 후 부여

    // 유저 20명에게 HHUSD 지급
    for (const u of users.slice(0, 20)) {
      await hhusd.connect(admin).mint(u.address, ethers.parseEther("10000"));
    }
  });

  // 헬퍼: N명 가입
  async function joinMembers(group, count) {
    const GROUP_ROLE = await vault.GROUP_ROLE();
    await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());
    for (let i = 0; i < count; i++) {
      await group.connect(users[i]).joinGroup();
    }
  }

  // 헬퍼: 등록 마감
  async function closeEnrollment(group) {
    await time.increase(24 * 3600 + 1); // 24h 초과
    await group.closeEnrollment();
  }

  // 헬퍼: 포지션 선택 기간 종료 후 VRF 요청
  async function finalizeAfterSelection(group) {
    await time.increase(12 * 3600 + 1); // 12h 초과
    await group.finalizePositions();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 1: 가입 (ENROLLING)
  // ════════════════════════════════════════════════════════════════════════

  describe("joinGroup", () => {
    let group;
    beforeEach(async () => { group = await deployGroup(); });

    it("가입 성공 - 담보 잠금 확인", async () => {
      const GROUP_ROLE = await vault.GROUP_ROLE();
      await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());

      await group.connect(users[0]).joinGroup();

      expect(await group.getMemberCount()).to.equal(1);
      const m = await group.getMember(users[0].address);
      expect(m.wallet).to.equal(users[0].address);
      expect(m.collateral).to.equal(REQUIRED_COLLATERAL);
      expect(await vault.getGroupCollateral(GROUP_ID, users[0].address))
        .to.equal(REQUIRED_COLLATERAL);
    });

    it("중복 가입 불가", async () => {
      const GROUP_ROLE = await vault.GROUP_ROLE();
      await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());
      await group.connect(users[0]).joinGroup();
      await expect(group.connect(users[0]).joinGroup())
        .to.be.revertedWithCustomError(group, "AlreadyMember");
    });

    it("최대 20명 초과 불가", async () => {
      const GROUP_ROLE = await vault.GROUP_ROLE();
      await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());
      // users[0]~[19] 20명 가입 (각자 별도 wallet 생성)
      const wallets = [];
      for (let i = 0; i < 20; i++) {
        const w = ethers.Wallet.createRandom().connect(ethers.provider);
        // 가스비 지원
        await admin.sendTransaction({ to: w.address, value: ethers.parseEther("1") });
        await hhusd.connect(admin).mint(w.address, ethers.parseEther("10000"));
        wallets.push(w);
        await group.connect(w).joinGroup();
      }
      // 21번째
      const extra = ethers.Wallet.createRandom().connect(ethers.provider);
      await admin.sendTransaction({ to: extra.address, value: ethers.parseEther("1") });
      await hhusd.connect(admin).mint(extra.address, ethers.parseEther("10000"));
      await expect(group.connect(extra).joinGroup())
        .to.be.revertedWithCustomError(group, "EnrollmentFull");
    });

    it("ENROLLING 상태 아니면 가입 불가", async () => {
      await joinMembers(group, 10);
      await closeEnrollment(group);
      await expect(group.connect(users[10]).joinGroup())
        .to.be.revertedWithCustomError(group, "NotInState");
    });

    it("MemberJoined 이벤트 발생", async () => {
      const GROUP_ROLE = await vault.GROUP_ROLE();
      await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());
      await expect(group.connect(users[0]).joinGroup())
        .to.emit(group, "MemberJoined")
        .withArgs(users[0].address, await time.latest() + 1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 1: 등록 마감 (closeEnrollment)
  // ════════════════════════════════════════════════════════════════════════

  describe("closeEnrollment", () => {
    let group;
    beforeEach(async () => { group = await deployGroup(); });

    it("10명 이상 + 기간 종료 → POSITION_SELECTION 전환", async () => {
      await joinMembers(group, 10);
      await closeEnrollment(group);
      expect(await group.state()).to.equal(1); // POSITION_SELECTION
    });

    it("10명 미만이면 CANCELLED", async () => {
      await joinMembers(group, 5);
      await closeEnrollment(group);
      expect(await group.state()).to.equal(5); // CANCELLED
    });

    it("20명 가득 차면 마감 전에도 closeEnrollment 가능", async () => {
      const GROUP_ROLE = await vault.GROUP_ROLE();
      await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());
      for (let i = 0; i < 20; i++) {
        const w = ethers.Wallet.createRandom().connect(ethers.provider);
        await admin.sendTransaction({ to: w.address, value: ethers.parseEther("1") });
        await hhusd.connect(admin).mint(w.address, ethers.parseEther("10000"));
        await group.connect(w).joinGroup();
      }
      await group.closeEnrollment(); // 기간 전이지만 full
      expect(await group.state()).to.equal(1); // POSITION_SELECTION
    });

    it("기간 미종료 + 미만원 시 revert", async () => {
      await joinMembers(group, 5);
      await expect(group.closeEnrollment()).to.be.revertedWith("Enrollment still open");
    });

    it("취소 시 담보 전액 환불", async () => {
      await joinMembers(group, 5);
      const before = await vault.getGroupCollateral(GROUP_ID, users[0].address);
      await closeEnrollment(group);
      expect(await vault.getGroupCollateral(GROUP_ID, users[0].address)).to.equal(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 2: 포지션 선택 (selectPosition)
  // ════════════════════════════════════════════════════════════════════════

  describe("selectPosition", () => {
    let group;
    beforeEach(async () => {
      group = await deployGroup();
      await joinMembers(group, 10);
      await closeEnrollment(group);
    });

    it("포지션 선택 성공", async () => {
      await group.connect(users[0]).selectPosition(1);
      const m = await group.getMember(users[0].address);
      expect(m.position).to.equal(1);
      expect(await group.positionToMember(1)).to.equal(users[0].address);
    });

    it("이미 선택된 포지션 중복 선택 불가", async () => {
      await group.connect(users[0]).selectPosition(1);
      await expect(group.connect(users[1]).selectPosition(1))
        .to.be.revertedWithCustomError(group, "PositionTaken");
    });

    it("같은 멤버 포지션 중복 선택 불가", async () => {
      await group.connect(users[0]).selectPosition(1);
      await expect(group.connect(users[0]).selectPosition(2))
        .to.be.revertedWithCustomError(group, "AlreadySelectedPosition");
    });

    it("범위 초과 포지션 불가 (0, memberCount+1)", async () => {
      await expect(group.connect(users[0]).selectPosition(0))
        .to.be.revertedWithCustomError(group, "PositionOutOfRange");
      await expect(group.connect(users[0]).selectPosition(11))
        .to.be.revertedWithCustomError(group, "PositionOutOfRange");
    });

    it("비멤버는 선택 불가", async () => {
      await expect(group.connect(users[15]).selectPosition(1))
        .to.be.revertedWithCustomError(group, "NotMember");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 3: VRF 요청 (finalizePositions)
  // ════════════════════════════════════════════════════════════════════════

  describe("finalizePositions", () => {
    let group;
    beforeEach(async () => {
      group = await deployGroup();
      await joinMembers(group, 10);
      await closeEnrollment(group);
    });

    it("선택기간 전 호출 시 revert", async () => {
      await expect(group.finalizePositions())
        .to.be.revertedWithCustomError(group, "DeadlineNotReached");
    });

    it("미선택 있으면 PENDING_VRF + VRF 요청", async () => {
      await finalizeAfterSelection(group);
      expect(await group.state()).to.equal(2); // PENDING_VRF
      expect(await group.pendingVrfRequestId()).to.equal(1);
    });

    it("전원 포지션 선택 시 VRF 없이 바로 ACTIVE", async () => {
      for (let i = 0; i < 10; i++) {
        await group.connect(users[i]).selectPosition(i + 1);
      }
      await finalizeAfterSelection(group);
      expect(await group.state()).to.equal(3); // ACTIVE
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 4: VRF 콜백 (receiveRandomPositions)
  // ════════════════════════════════════════════════════════════════════════

  describe("receiveRandomPositions", () => {
    let group;
    beforeEach(async () => {
      group = await deployGroup();
      await joinMembers(group, 10);
      await closeEnrollment(group);
      await finalizeAfterSelection(group);
      // 이 시점에 PENDING_VRF 상태
    });

    it("VRF 콜백 후 모든 멤버에 포지션 배정 + ACTIVE 전환", async () => {
      await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0xdeadbeef")]);

      expect(await group.state()).to.equal(3); // ACTIVE
      // 모든 멤버에 포지션 배정 확인
      for (let i = 0; i < 10; i++) {
        const m = await group.getMember(users[i].address);
        expect(m.position).to.be.greaterThan(0);
      }
    });

    it("VRF Assigner 외 호출 불가", async () => {
      await expect(
        group.connect(users[0]).receiveRandomPositions([12345n])
      ).to.be.revertedWithCustomError(group, "OnlyVRFAssigner");
    });

    it("포지션 중복 없음 (Fisher-Yates 검증)", async () => {
      await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0xcafebabe")]);

      const positions = new Set();
      for (let i = 0; i < 10; i++) {
        const m = await group.getMember(users[i].address);
        expect(positions.has(Number(m.position))).to.be.false;
        positions.add(Number(m.position));
      }
      expect(positions.size).to.equal(10);
    });

    it("VRF 타임아웃 후 재시도 가능", async () => {
      await time.increase(3601); // 1h 초과
      await expect(group.retryVRFRequest()).to.emit(group, "VRFRequested");
    });

    it("타임아웃 전 재시도 불가", async () => {
      await expect(group.retryVRFRequest())
        .to.be.revertedWithCustomError(group, "VRFNotTimedOut");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 5: 사이클 기여 + 지급 (ACTIVE)
  // ════════════════════════════════════════════════════════════════════════

  describe("contribute & distributePayout", () => {
    let group;
    beforeEach(async () => {
      group = await deployGroup();
      await joinMembers(group, 10);
      await closeEnrollment(group);
      await finalizeAfterSelection(group);
      await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0x1234")]);
      // 현재 ACTIVE, cycle = 1
    });

    it("contribute 이벤트 발생", async () => {
      await expect(group.connect(users[0]).contribute())
        .to.emit(group, "ContributionMade")
        .withArgs(users[0].address, 1, CONTRIBUTION);
    });

    it("제거된 멤버는 contribute 불가", async () => {
      // 담보 소진될 때까지 미납 처리
      let m = await group.getMember(users[0].address);
      while (m.status !== 3n) {
        await group.connect(devWallet).warningMissedPayment(users[0].address);
        m = await group.getMember(users[0].address);
      }
      await expect(group.connect(users[0]).contribute())
        .to.be.revertedWithCustomError(group, "NotMember");
    });

    it("사이클 종료 전 distributePayout revert", async () => {
      await expect(group.distributePayout())
        .to.be.revertedWith("Cycle not ended");
    });

    it("사이클 종료 후 distributePayout 성공", async () => {
      await time.increase(Number(CYCLE_INTERVAL) + 1);
      await expect(group.distributePayout())
        .to.emit(group, "PayoutDistributed");
      expect(await group.currentCycle()).to.equal(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 5: 미납 처리 (warningMissedPayment)
  // ════════════════════════════════════════════════════════════════════════

  describe("warningMissedPayment", () => {
    let group;
    beforeEach(async () => {
      group = await deployGroup();
      await joinMembers(group, 10);
      await closeEnrollment(group);
      await finalizeAfterSelection(group);
      await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0x5678")]);
    });

    it("1차 경고 → WARNED 상태", async () => {
      await group.connect(devWallet).warningMissedPayment(users[0].address);
      const m = await group.getMember(users[0].address);
      expect(m.status).to.equal(1); // WARNED
      expect(m.missedPayments).to.equal(1);
    });

    it("2차 경고 → PENALIZED + 담보 슬래시", async () => {
      await group.connect(devWallet).warningMissedPayment(users[0].address);
      const collateralBefore = await vault.getGroupCollateral(GROUP_ID, users[0].address);
      await group.connect(devWallet).warningMissedPayment(users[0].address);

      const m = await group.getMember(users[0].address);
      expect(m.status).to.equal(2); // PENALIZED
      expect(await vault.getGroupCollateral(GROUP_ID, users[0].address))
        .to.be.lt(collateralBefore);
    });

    it("담보 소진 → REMOVED + 잔여 담보 devWallet으로 귀속", async () => {
      // 담보 1400 HHUSD / 기여금 100 → 14번 차감하면 0 or REMOVED
      let m = await group.getMember(users[0].address);
      while (m.status !== 3n) {
        await group.connect(devWallet).warningMissedPayment(users[0].address);
        m = await group.getMember(users[0].address);
      }
      expect(m.status).to.equal(3); // REMOVED
      expect(await vault.getGroupCollateral(GROUP_ID, users[0].address)).to.equal(0);
    });

    it("비멤버 경고 시 revert (권한 없는 계정 → Unauthorized)", async () => {
      // 권한 없는 계정이 호출하면 onlyKeeperOrDev가 먼저 revert
      await expect(group.warningMissedPayment(users[15].address))
        .to.be.revertedWithCustomError(group, "Unauthorized");
      // devWallet이 비멤버 호출하면 NotMember revert
      await expect(group.connect(devWallet).warningMissedPayment(users[15].address))
        .to.be.revertedWithCustomError(group, "NotMember");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  getRequiredCollateral 140% 검증
  // ════════════════════════════════════════════════════════════════════════

  describe("140% 담보 검증", () => {
    it("100 USDT × 10사이클 → 1400 HHUSD 필요", async () => {
      const required = await vault.getRequiredCollateral(CONTRIBUTION, TOTAL_CYCLES, COLLATERAL_BP);
      expect(required).to.equal(ethers.parseEther("1400"));
    });
  });
});
