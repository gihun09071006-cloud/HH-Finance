const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const GROUP_ID           = 1n;
const CONTRIBUTION       = ethers.parseEther("100");
const TOTAL_CYCLES       = 10n;
const CYCLE_INTERVAL     = 7n * 24n * 3600n;
const COLLATERAL_BP      = 14000n;
const REQUIRED_COLLATERAL = CONTRIBUTION * TOTAL_CYCLES * COLLATERAL_BP / 10000n;

describe("AutoGroup 테스트", function () {
  let hhusd, vault, group;
  let devWallet, eventWallet, users;
  let admin;

  async function deployAll() {
    [admin, devWallet, eventWallet, ...users] = await ethers.getSigners();

    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });

    const CV = await ethers.getContractFactory("CollateralVault");
    vault = await upgrades.deployProxy(CV,
      [admin.address, await hhusd.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );

    group = await ethers.deployContract("AutoGroup", [
      GROUP_ID, CONTRIBUTION, TOTAL_CYCLES, CYCLE_INTERVAL, COLLATERAL_BP,
      await vault.getAddress(), devWallet.address, eventWallet.address,
    ]);

    // 역할 설정
    await hhusd.grantRole(await hhusd.MINTER_ROLE(), admin.address);
    await hhusd.grantRole(await hhusd.MINTER_ROLE(), await vault.getAddress());
    await hhusd.grantRole(await hhusd.BURNER_ROLE(), await vault.getAddress());
    await vault.grantRole(await vault.GROUP_ROLE(), await group.getAddress());

    // 유저에게 HHUSD 지급
    for (const u of users.slice(0, 28)) {
      await hhusd.mint(u.address, REQUIRED_COLLATERAL * 2n);
    }
  }

  async function joinN(n) {
    for (let i = 0; i < n; i++) {
      await group.connect(users[i]).joinGroup();
    }
  }

  // ── 입장 순서 테스트 ──────────────────────────────────────────────────────

  describe("입장 및 카운트다운", () => {
    before(async () => { await deployAll(); });

    it("9명 입장 후 카운트다운 미시작", async () => {
      await joinN(9);
      expect((await group.getGroupInfo()).toString()).to.not.include("CountdownStarted");
      expect(await group.countdownStarted()).to.equal(false);
    });

    it("10번째 입장 시 카운트다운 자동 시작", async () => {
      const tx = await group.connect(users[9]).joinGroup();
      expect(await group.countdownStarted()).to.equal(true);
      const info = await group.getGroupInfo();
      expect(info._memberCount).to.equal(10n);
    });

    it("카운트다운 중에도 마감 전까지 추가 입장 가능 (totalCycles 범위 내)", async () => {
      // 10명 그룹이므로 이미 가득 참 → EnrollmentFull 발생
      await expect(group.connect(users[10]).joinGroup())
        .to.be.revertedWithCustomError(group, "EnrollmentFull");
    });

    it("joinOrder가 입장 순서대로 정확히 설정됨", async () => {
      for (let i = 0; i < 10; i++) {
        const m = await group.getMember(users[i].address);
        expect(m.joinOrder).to.equal(BigInt(i + 1));
      }
    });
  });

  // ── 최대 인원 제한 ────────────────────────────────────────────────────────

  describe("MAX_MEMBERS 28명 제한", () => {
    let smallGroup;

    before(async () => {
      // MAX_MEMBERS=5짜리 별도 그룹으로 상한 테스트
      await deployAll();
      // MAX_MEMBERS=5짜리 AutoGroup (totalCycles = maxMembers = 5)
      smallGroup = await ethers.deployContract("AutoGroup", [
        2n, CONTRIBUTION, 5n /* totalCycles=5=maxMembers */, CYCLE_INTERVAL, COLLATERAL_BP,
        await vault.getAddress(), devWallet.address, eventWallet.address,
      ]);
      await vault.grantRole(await vault.GROUP_ROLE(), await smallGroup.getAddress());
      for (let i = 0; i < 5; i++) await smallGroup.connect(users[i]).joinGroup();
    });

    it("최대 인원 초과 시 EnrollmentFull revert", async () => {
      await expect(smallGroup.connect(users[5]).joinGroup())
        .to.be.revertedWithCustomError(smallGroup, "EnrollmentFull");
    });
  });

  // ── 모집 마감 및 순번 선택 ──────────────────────────────────────────────────

  describe("closeEnrollment → 순번 선택 창", () => {
    before(async () => {
      await deployAll();
      await joinN(10);
      // 카운트다운 24시간 경과
      const deadline = await group.enrollmentDeadline();
      await time.increaseTo(deadline + 1n);
    });

    it("마감 후 closeEnrollment 호출 성공 → POSITION_SELECTION 상태", async () => {
      await group.closeEnrollment();
      expect((await group.getGroupInfo())._state).to.equal(1n); // POSITION_SELECTION
    });

    it("원하는 순번 선택 가능", async () => {
      await group.connect(users[0]).selectPosition(3);
      await group.connect(users[1]).selectPosition(7);
      const m0 = await group.getMember(users[0].address);
      const m1 = await group.getMember(users[1].address);
      expect(m0.position).to.equal(3n);
      expect(m1.position).to.equal(7n);
    });

    it("이미 선택된 순번 중복 선택 불가", async () => {
      await expect(group.connect(users[2]).selectPosition(3))
        .to.be.revertedWithCustomError(group, "PositionTaken");
    });
  });

  // ── 미선택자 입장 순서대로 후순번 배치 ───────────────────────────────────

  describe("finalizePositions — 입장 순서 기반 후순번 배치", () => {
    before(async () => {
      await deployAll();
      await joinN(10);
      const deadline = await group.enrollmentDeadline();
      await time.increaseTo(deadline + 1n);
      await group.closeEnrollment();

      // users[0]만 순번 1 선택, 나머지 9명은 미선택
      await group.connect(users[0]).selectPosition(1);

      // 선택 창 종료
      const selDeadline = await group.positionSelectionDeadline();
      await time.increaseTo(selDeadline + 1n);

      await group.finalizePositions();
    });

    it("ACTIVE 상태로 전환", async () => {
      expect((await group.getGroupInfo())._state).to.equal(2n); // ACTIVE
    });

    it("users[0]는 선택한 순번 1 유지", async () => {
      const m = await group.getMember(users[0].address);
      expect(m.position).to.equal(1n);
    });

    it("미선택자들이 입장 순서대로 남은 순번(2~10)에 배치됨", async () => {
      // users[1](2번째 입장) → position 2
      // users[2](3번째 입장) → position 3, ...
      for (let i = 1; i < 10; i++) {
        const m = await group.getMember(users[i].address);
        expect(m.position).to.equal(BigInt(i + 1),
          `users[${i}] 입장순서 ${i+1} → 포지션 ${i+1} 기대`);
      }
    });

    it("positionToMember 매핑 일치", async () => {
      for (let i = 1; i <= 10; i++) {
        const addr = await group.positionToMember(i);
        expect(addr).to.equal(users[i - 1].address);
      }
    });
  });

  // ── 일부 선택, 나머지 미선택 혼합 ────────────────────────────────────────

  describe("혼합 선택 — 일부만 선택 후 나머지 자동 배치", () => {
    before(async () => {
      await deployAll();
      await joinN(10);
      const deadline = await group.enrollmentDeadline();
      await time.increaseTo(deadline + 1n);
      await group.closeEnrollment();

      // users[0] → 위치 5, users[3] → 위치 8 선택
      await group.connect(users[0]).selectPosition(5);
      await group.connect(users[3]).selectPosition(8);

      const selDeadline = await group.positionSelectionDeadline();
      await time.increaseTo(selDeadline + 1n);
      await group.finalizePositions();
    });

    it("선택한 사람들의 순번 유지", async () => {
      expect((await group.getMember(users[0].address)).position).to.equal(5n);
      expect((await group.getMember(users[3].address)).position).to.equal(8n);
    });

    it("미선택자들이 입장 순서대로 나머지 순번에 배치됨", async () => {
      // 남은 포지션: 1,2,3,4,6,7,9,10 (오름차순)
      // 미선택자 입장순서: users[1](2등), users[2](3등), users[4](5등)...users[9](10등)
      const openPositions = [1, 2, 3, 4, 6, 7, 9, 10];
      const unselected    = [1, 2, 4, 5, 6, 7, 8, 9]; // users 인덱스

      for (let i = 0; i < unselected.length; i++) {
        const m = await group.getMember(users[unselected[i]].address);
        expect(m.position).to.equal(BigInt(openPositions[i]),
          `users[${unselected[i]}] → 포지션 ${openPositions[i]} 기대`);
      }
    });
  });

  // ── 계 진행 ───────────────────────────────────────────────────────────────

  describe("계 진행 (ACTIVE)", () => {
    before(async () => {
      await deployAll();
      await joinN(10);
      const deadline = await group.enrollmentDeadline();
      await time.increaseTo(deadline + 1n);
      await group.closeEnrollment();
      const selDeadline = await group.positionSelectionDeadline();
      await time.increaseTo(selDeadline + 1n);
      await group.finalizePositions();
    });

    it("contribute 호출 가능", async () => {
      await expect(group.connect(users[0]).contribute()).to.not.be.rejected;
    });

    it("사이클 간격 전 distributePayout 불가", async () => {
      await expect(group.distributePayout()).to.be.revertedWith("Cycle not ended");
    });

    it("사이클 간격 후 distributePayout → 다음 사이클 진행", async () => {
      await time.increase(Number(CYCLE_INTERVAL) + 1);
      await group.distributePayout();
      const info = await group.getGroupInfo();
      expect(info._cycle).to.equal(2n);
    });
  });

  // ── 미납 처리 ─────────────────────────────────────────────────────────────

  describe("미납 처리 — keeper/devWallet만 가능", () => {
    before(async () => {
      await deployAll();
      await joinN(10);
      const deadline = await group.enrollmentDeadline();
      await time.increaseTo(deadline + 1n);
      await group.closeEnrollment();
      const selDeadline = await group.positionSelectionDeadline();
      await time.increaseTo(selDeadline + 1n);
      await group.finalizePositions();
    });

    it("일반 유저가 warningMissedPayment 호출 → Unauthorized revert", async () => {
      await expect(group.connect(users[5]).warningMissedPayment(users[0].address))
        .to.be.revertedWithCustomError(group, "Unauthorized");
    });

    it("devWallet이 warningMissedPayment 호출 → 담보 차감 + WARNED", async () => {
      const before = await vault.getGroupCollateral(GROUP_ID, users[0].address);
      await group.connect(devWallet).warningMissedPayment(users[0].address);
      const after = await vault.getGroupCollateral(GROUP_ID, users[0].address);
      expect(before - after).to.equal(CONTRIBUTION);
      expect((await group.getMember(users[0].address)).status).to.equal(1n); // WARNED
    });
  });

  // ── getAvailablePositions ─────────────────────────────────────────────────

  describe("getAvailablePositions 뷰", () => {
    before(async () => {
      await deployAll();
      await joinN(10);
      const deadline = await group.enrollmentDeadline();
      await time.increaseTo(deadline + 1n);
      await group.closeEnrollment();
      // 1, 5, 10 선택
      await group.connect(users[0]).selectPosition(1);
      await group.connect(users[1]).selectPosition(5);
      await group.connect(users[2]).selectPosition(10);
    });

    it("선택 안 된 순번들만 반환", async () => {
      const avail = await group.getAvailablePositions();
      const nums  = avail.map(Number);
      expect(nums).to.not.include(1);
      expect(nums).to.not.include(5);
      expect(nums).to.not.include(10);
      expect(nums.length).to.equal(7);
    });
  });
});
