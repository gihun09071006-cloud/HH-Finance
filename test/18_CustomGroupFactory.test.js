const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CustomGroupFactory 테스트", function () {
  let hhusd, vault, factory;
  let admin, devWallet, eventWallet, users;

  const CONTRIBUTION     = ethers.parseEther("50");
  const MAX_MEMBERS      = 5n;
  const CYCLE_INTERVAL   = 7n * 24n * 3600n;
  const ENROLL_DURATION  = 48n * 3600n;
  const COLLATERAL_BP    = 14000n;

  // 5명 기준 담보
  const REQUIRED = CONTRIBUTION * MAX_MEMBERS * COLLATERAL_BP / 10000n;

  async function deployAll() {
    [admin, devWallet, eventWallet, ...users] = await ethers.getSigners();

    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });

    const CV = await ethers.getContractFactory("CollateralVault");
    vault = await upgrades.deployProxy(CV,
      [admin.address, await hhusd.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );

    factory = await ethers.deployContract("CustomGroupFactory", [
      await vault.getAddress(),
      devWallet.address,
      eventWallet.address,
      admin.address,
    ]);

    // Factory가 vault의 GROUP_ROLE을 그룹에 부여할 수 있게 ADMIN_ROLE 부여
    await vault.grantRole(await vault.DEFAULT_ADMIN_ROLE(), await factory.getAddress());

    await hhusd.grantRole(await hhusd.MINTER_ROLE(), admin.address);
    await hhusd.grantRole(await hhusd.MINTER_ROLE(), await vault.getAddress());
    await hhusd.grantRole(await hhusd.BURNER_ROLE(), await vault.getAddress());

    // 유저에게 HHUSD 지급
    for (const u of users.slice(0, 10)) {
      await hhusd.mint(u.address, REQUIRED * 3n);
    }
  }

  // ── 방 생성 ──────────────────────────────────────────────────────────────

  describe("방 생성 (createGroup)", () => {
    let groupAddr;

    before(async () => { await deployAll(); });

    it("계장이 createGroup → 방 생성 + 계장 자동 참가", async () => {
      const tx = await factory.connect(users[0]).createGroup(
        CONTRIBUTION, MAX_MEMBERS, CYCLE_INTERVAL, ENROLL_DURATION
      );
      const receipt = await tx.wait();

      const log = receipt.logs.find(l => {
        try { factory.interface.parseLog(l); return true; } catch { return false; }
      });

      groupAddr = await factory.allGroups(0);
      expect(groupAddr).to.not.equal(ethers.ZeroAddress);

      const g = await ethers.getContractAt("CustomGroup", groupAddr);

      // 계장(users[0])이 1번 멤버로 자동 참가
      expect(await g.getMemberCount()).to.equal(1n);
      const m = await g.getMember(users[0].address);
      expect(m.wallet).to.equal(users[0].address);
      expect(m.joinOrder).to.equal(1n);
    });

    it("계장 담보가 잠김 (담보 선 디파짓)", async () => {
      const locked = await vault.getGroupCollateral(1n, users[0].address);
      expect(locked).to.equal(REQUIRED);
    });

    it("getGroupCount() === 1", async () => {
      expect(await factory.getGroupCount()).to.equal(1n);
    });

    it("파라미터 검증 — maxMembers 1 → revert", async () => {
      await expect(
        factory.connect(users[0]).createGroup(CONTRIBUTION, 1n, CYCLE_INTERVAL, ENROLL_DURATION)
      ).to.be.revertedWith("maxMembers: 2~29");
    });

    it("파라미터 검증 — maxMembers 30 → revert", async () => {
      await expect(
        factory.connect(users[0]).createGroup(CONTRIBUTION, 30n, CYCLE_INTERVAL, ENROLL_DURATION)
      ).to.be.revertedWith("maxMembers: 2~29");
    });
  });

  // ── 방 참가 ──────────────────────────────────────────────────────────────

  describe("방 참가 (joinGroup)", () => {
    let groupAddr;

    before(async () => {
      await deployAll();
      await factory.connect(users[0]).createGroup(
        CONTRIBUTION, MAX_MEMBERS, CYCLE_INTERVAL, ENROLL_DURATION
      );
      groupAddr = await factory.allGroups(0);
    });

    it("유저가 joinGroup 성공", async () => {
      await factory.connect(users[1]).joinGroup(groupAddr);
      const g = await ethers.getContractAt("CustomGroup", groupAddr);
      expect(await g.getMemberCount()).to.equal(2n);
    });

    it("중복 참가 → AlreadyInGroup revert", async () => {
      await expect(factory.connect(users[1]).joinGroup(groupAddr))
        .to.be.revertedWithCustomError(factory, "AlreadyInGroup");
    });

    it("알 수 없는 방 주소 → UnknownGroup revert", async () => {
      await expect(factory.connect(users[2]).joinGroup(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "UnknownGroup");
    });

    it("5명 가득 참 후 추가 참가 → EnrollmentFull revert", async () => {
      await factory.connect(users[2]).joinGroup(groupAddr);
      await factory.connect(users[3]).joinGroup(groupAddr);
      await factory.connect(users[4]).joinGroup(groupAddr);
      // users[0]이 이미 계장으로 참가 = 1명, users[1..4] = 4명 → 총 5명 → 가득 참
      await expect(factory.connect(users[5]).joinGroup(groupAddr))
        .to.be.revertedWithCustomError(
          await ethers.getContractAt("CustomGroup", groupAddr),
          "EnrollmentFull"
        );
    });
  });

  // ── getAllGroups / getOpenGroups ──────────────────────────────────────────

  describe("방 목록 조회", () => {
    let addr1, addr2;

    before(async () => {
      await deployAll();

      // 방 1 생성 (users[0] = 계장)
      await factory.connect(users[0]).createGroup(
        CONTRIBUTION, MAX_MEMBERS, CYCLE_INTERVAL, ENROLL_DURATION
      );
      addr1 = await factory.allGroups(0);

      // 방 2 생성 (users[1] = 계장)
      await factory.connect(users[1]).createGroup(
        ethers.parseEther("100"), 3n, CYCLE_INTERVAL, ENROLL_DURATION
      );
      addr2 = await factory.allGroups(1);

      // 방 1에 한 명 더 참가 후 마감 → POSITION_SELECTION
      await factory.connect(users[2]).joinGroup(addr1);
      const g1 = await ethers.getContractAt("CustomGroup", addr1);
      await g1.connect(users[0]).closeEnrollment(); // 계장 조기 마감
    });

    it("getAllGroups() → 2개 반환", async () => {
      const all = await factory.getAllGroups();
      expect(all.length).to.equal(2);
      expect(all[0]).to.equal(addr1);
      expect(all[1]).to.equal(addr2);
    });

    it("getOpenGroups() → ENROLLING 상태인 방만 반환", async () => {
      const open = await factory.getOpenGroups();
      expect(open.length).to.equal(1);
      expect(open[0]).to.equal(addr2); // addr1은 POSITION_SELECTION
    });

    it("getAllGroupInfos() → 상태 포함 전체 반환", async () => {
      const infos = await factory.getAllGroupInfos();
      expect(infos.length).to.equal(2);
      expect(infos[0].state).to.equal(1n); // POSITION_SELECTION
      expect(infos[1].state).to.equal(0n); // ENROLLING
      expect(infos[0].organizer).to.equal(users[0].address);
      expect(infos[1].organizer).to.equal(users[1].address);
    });

    it("getGroupInfo(addr) → 특정 방 상세 정보", async () => {
      const info = await factory.getGroupInfo(addr2);
      expect(info.groupAddr).to.equal(addr2);
      expect(info.contributionAmount).to.equal(ethers.parseEther("100"));
      expect(info.maxMembers).to.equal(3n);
      expect(info.memberCount).to.equal(1n); // 계장만 참가
      expect(info.state).to.equal(0n); // ENROLLING
    });

    it("getGroupInfo(알 수 없는 주소) → UnknownGroup revert", async () => {
      await expect(factory.getGroupInfo(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "UnknownGroup");
    });
  });

  // ── 전체 플로우 ───────────────────────────────────────────────────────────

  describe("전체 플로우 — 팩토리 통해 3명 커스텀 그룹 완료", () => {
    let groupAddr;
    const SMALL_MAX  = 3n;
    const SMALL_CONT = ethers.parseEther("30");
    const SMALL_REQ  = SMALL_CONT * SMALL_MAX * COLLATERAL_BP / 10000n;

    before(async () => {
      await deployAll();

      // 유저에게 충분한 HHUSD 지급
      for (const u of users.slice(0, 5)) {
        await hhusd.mint(u.address, SMALL_REQ * 2n);
      }

      // users[0] = 계장, 방 생성 + 자동 참가
      await factory.connect(users[0]).createGroup(
        SMALL_CONT, SMALL_MAX, CYCLE_INTERVAL, ENROLL_DURATION
      );
      groupAddr = await factory.allGroups(0);
    });

    it("계장 담보 선 디파짓 확인", async () => {
      const locked = await vault.getGroupCollateral(1n, users[0].address);
      expect(locked).to.equal(SMALL_REQ);
    });

    it("2명 추가 참가 → 3명 가득 참", async () => {
      await factory.connect(users[1]).joinGroup(groupAddr);
      await factory.connect(users[2]).joinGroup(groupAddr);

      const g = await ethers.getContractAt("CustomGroup", groupAddr);
      expect(await g.getMemberCount()).to.equal(3n);
    });

    it("계장이 closeEnrollment → POSITION_SELECTION", async () => {
      const g = await ethers.getContractAt("CustomGroup", groupAddr);
      await g.connect(users[0]).closeEnrollment();
      expect((await g.getGroupInfo())._state).to.equal(1n);
    });

    it("순번 선택 후 finalizePositions → ACTIVE", async () => {
      const g = await ethers.getContractAt("CustomGroup", groupAddr);
      await g.connect(users[0]).selectPosition(2);

      const selDeadline = await g.positionSelectionDeadline();
      await time.increaseTo(selDeadline + 1n);
      await g.finalizePositions();

      expect((await g.getGroupInfo())._state).to.equal(2n); // ACTIVE
    });

    it("3사이클 완료 → COMPLETED", async () => {
      const g = await ethers.getContractAt("CustomGroup", groupAddr);
      for (let c = 0; c < 3; c++) {
        await time.increase(Number(CYCLE_INTERVAL) + 1);
        await g.distributePayout();
      }
      expect((await g.getGroupInfo())._state).to.equal(3n); // COMPLETED
    });
  });
});
