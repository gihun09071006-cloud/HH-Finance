const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const GROUP_ID       = 99n;
const CONTRIBUTION   = ethers.parseEther("50");
const MAX_MEMBERS    = 5n;           // 커스텀: 5명
const CYCLE_INTERVAL = 3n * 24n * 3600n;  // 3일
const COLLATERAL_BP  = 14000n;
const ENROLL_DURATION = 48n * 3600n; // 48시간 모집

const REQUIRED = CONTRIBUTION * MAX_MEMBERS * COLLATERAL_BP / 10000n;

describe("CustomGroup 테스트", function () {
  let hhusd, vault, group;
  let admin, organizer, devWallet, eventWallet, users;

  async function deployAll() {
    [admin, organizer, devWallet, eventWallet, ...users] = await ethers.getSigners();

    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });

    const CV = await ethers.getContractFactory("CollateralVault");
    vault = await upgrades.deployProxy(CV,
      [admin.address, await hhusd.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );

    group = await ethers.deployContract("CustomGroup", [
      GROUP_ID,
      CONTRIBUTION,
      MAX_MEMBERS,
      CYCLE_INTERVAL,
      COLLATERAL_BP,
      ENROLL_DURATION,
      await vault.getAddress(),
      organizer.address,
      devWallet.address,
      eventWallet.address,
    ]);

    await hhusd.grantRole(await hhusd.MINTER_ROLE(), admin.address);
    await hhusd.grantRole(await hhusd.MINTER_ROLE(), await vault.getAddress());
    await hhusd.grantRole(await hhusd.BURNER_ROLE(), await vault.getAddress());
    await vault.grantRole(await vault.GROUP_ROLE(), await group.getAddress());

    for (const u of users.slice(0, 10)) {
      await hhusd.mint(u.address, REQUIRED * 2n);
    }
    // 계장도 참가 가능
    await hhusd.mint(organizer.address, REQUIRED * 2n);
  }

  // ── 기본 참가 ─────────────────────────────────────────────────────────────

  describe("모집 및 참가", () => {
    before(async () => { await deployAll(); });

    it("유저가 joinGroup 성공", async () => {
      await group.connect(users[0]).joinGroup();
      expect(await group.getMemberCount()).to.equal(1n);
    });

    it("계장도 joinGroup 참가 가능", async () => {
      await group.connect(organizer).joinGroup();
      expect(await group.getMemberCount()).to.equal(2n);
    });

    it("최대 인원(5명) 초과 시 EnrollmentFull", async () => {
      await group.connect(users[1]).joinGroup();
      await group.connect(users[2]).joinGroup();
      await group.connect(users[3]).joinGroup();
      await expect(group.connect(users[4]).joinGroup())
        .to.be.revertedWithCustomError(group, "EnrollmentFull");
    });
  });

  // ── 계장 권한 ─────────────────────────────────────────────────────────────

  describe("계장 권한", () => {
    before(async () => {
      await deployAll();
      await group.connect(users[0]).joinGroup();
      await group.connect(users[1]).joinGroup();
      await group.connect(users[2]).joinGroup();
    });

    it("계장이 멤버 강퇴 → 담보 환불 + memberList에서 제거", async () => {
      const balBefore = await vault.getGroupCollateral(GROUP_ID, users[2].address);
      expect(balBefore).to.equal(REQUIRED);

      await group.connect(organizer).kickMember(users[2].address);

      expect(await group.getMemberCount()).to.equal(2n);
      const m = await group.getMember(users[2].address);
      expect(m.wallet).to.equal(ethers.ZeroAddress);
    });

    it("강퇴 후 joinOrder 재계산됨", async () => {
      // users[0] → order 1, users[1] → order 2 (users[2] 강퇴됨)
      const m0 = await group.getMember(users[0].address);
      const m1 = await group.getMember(users[1].address);
      expect(m0.joinOrder).to.equal(1n);
      expect(m1.joinOrder).to.equal(2n);
    });

    it("일반 유저가 kickMember → NotOrganizer revert", async () => {
      await group.connect(users[0]).joinGroup() .catch(() => {}); // 재참가 무시
      await expect(group.connect(users[0]).kickMember(users[1].address))
        .to.be.revertedWithCustomError(group, "NotOrganizer");
    });

    it("계장이 cancelGroup → CANCELLED + 담보 환불", async () => {
      await group.connect(organizer).cancelGroup("테스트 취소");
      const info = await group.getGroupInfo();
      expect(info._state).to.equal(4n); // CANCELLED
    });
  });

  // ── 조기 마감 ─────────────────────────────────────────────────────────────

  describe("계장 조기 마감", () => {
    before(async () => {
      await deployAll();
      await group.connect(users[0]).joinGroup();
      await group.connect(users[1]).joinGroup();
    });

    it("2명뿐이어도 계장은 조기 closeEnrollment 가능", async () => {
      await group.connect(organizer).closeEnrollment();
      const info = await group.getGroupInfo();
      expect(info._state).to.equal(1n); // POSITION_SELECTION
    });
  });

  // ── 전체 플로우 ───────────────────────────────────────────────────────────

  describe("전체 플로우 — 5명 커스텀 그룹 완료", () => {
    before(async () => {
      await deployAll();
      // 5명 참가
      for (let i = 0; i < 4; i++) await group.connect(users[i]).joinGroup();
      await group.connect(organizer).joinGroup();

      // 계장 조기 마감
      await group.connect(organizer).closeEnrollment();

      // users[0] → 위치 3, users[1] → 위치 5 선택
      await group.connect(users[0]).selectPosition(3);
      await group.connect(users[1]).selectPosition(5);

      // 선택 창 종료
      const selDeadline = await group.positionSelectionDeadline();
      await time.increaseTo(selDeadline + 1n);
      await group.finalizePositions();
    });

    it("ACTIVE 상태", async () => {
      const info = await group.getGroupInfo();
      expect(info._state).to.equal(2n);
    });

    it("미선택자(3명)가 입장 순서대로 남은 순번에 배치", async () => {
      // 선택된 포지션: 3, 5
      // 남은 포지션 오름차순: 1, 2, 4
      // 미선택 입장순서: users[2](3번째), users[3](4번째), organizer(5번째)
      const m2 = await group.getMember(users[2].address);
      const m3 = await group.getMember(users[3].address);
      const mo = await group.getMember(organizer.address);
      expect(m2.position).to.equal(1n);
      expect(m3.position).to.equal(2n);
      expect(mo.position).to.equal(4n);
    });

    it("5사이클 진행 후 COMPLETED", async () => {
      for (let c = 0; c < 5; c++) {
        await time.increase(Number(CYCLE_INTERVAL) + 1);
        await group.distributePayout();
      }
      const info = await group.getGroupInfo();
      expect(info._state).to.equal(3n); // COMPLETED
    });
  });

  // ── 파라미터 검증 ─────────────────────────────────────────────────────────

  describe("파라미터 검증", () => {
    it("maxMembers 0 → revert", async () => {
      [admin, organizer, devWallet, eventWallet] = await ethers.getSigners();
      const HHUSD = await ethers.getContractFactory("HHUSD");
      hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
      const CV = await ethers.getContractFactory("CollateralVault");
      vault = await upgrades.deployProxy(CV,
        [admin.address, await hhusd.getAddress()],
        { kind: "uups", unsafeAllow: ["constructor"] }
      );

      await expect(ethers.deployContract("CustomGroup", [
        1n, CONTRIBUTION,
        1n, // maxMembers 1 < MIN_MEMBERS 2
        CYCLE_INTERVAL, COLLATERAL_BP, ENROLL_DURATION,
        await vault.getAddress(),
        organizer.address, devWallet.address, eventWallet.address,
      ])).to.be.revertedWith("maxMembers: 2~29");
    });

    it("maxMembers 30 → revert", async () => {
      await expect(ethers.deployContract("CustomGroup", [
        1n, CONTRIBUTION,
        30n, // maxMembers > 29
        CYCLE_INTERVAL, COLLATERAL_BP, ENROLL_DURATION,
        await vault.getAddress(),
        organizer.address, devWallet.address, eventWallet.address,
      ])).to.be.revertedWith("maxMembers: 2~29");
    });
  });
});
