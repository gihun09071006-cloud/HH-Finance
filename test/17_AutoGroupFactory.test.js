const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AutoGroupFactory 테스트", function () {
  let hhusd, vault, factory;
  let admin, devWallet, eventWallet, users;

  // 티어별 기여금
  const TIERS = [10n, 20n, 50n, 100n, 200n].map(n => ethers.parseEther(String(n)));
  // 10 HHUSD 티어: 담보 = 10 × 28 × 140% = 3920 HHUSD
  const REQUIRED_T0 = ethers.parseEther("10") * 28n * 14000n / 10000n;

  async function deployAll() {
    [admin, devWallet, eventWallet, ...users] = await ethers.getSigners();

    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });

    const CV = await ethers.getContractFactory("CollateralVault");
    vault = await upgrades.deployProxy(CV,
      [admin.address, await hhusd.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );

    factory = await ethers.deployContract("AutoGroupFactory", [
      await vault.getAddress(),
      devWallet.address,
      eventWallet.address,
      admin.address,
    ]);

    // Factory가 vault의 GROUP_ROLE을 그룹에 부여할 수 있게 ADMIN_ROLE 부여
    await vault.grantRole(await vault.DEFAULT_ADMIN_ROLE(), await factory.getAddress());

    // HHUSD 역할
    await hhusd.grantRole(await hhusd.MINTER_ROLE(), admin.address);
    await hhusd.grantRole(await hhusd.MINTER_ROLE(), await vault.getAddress());
    await hhusd.grantRole(await hhusd.BURNER_ROLE(), await vault.getAddress());

    // 유저에게 HHUSD 지급 (가장 큰 담보 기준으로 여유있게)
    const ENOUGH = ethers.parseEther("10000");
    for (const u of users.slice(0, 15)) {
      await hhusd.mint(u.address, ENOUGH);
    }
  }

  // ── 첫 참가 시 방 자동 생성 ──────────────────────────────────────────────

  describe("첫 참가 → 방 자동 생성", () => {
    before(async () => { await deployAll(); });

    it("처음에 활성 방 없음", async () => {
      expect(await factory.getActiveGroup(0)).to.equal(ethers.ZeroAddress);
    });

    it("첫 번째 유저가 tier 0(10 HHUSD) 참가 → 방 자동 생성", async () => {
      await factory.connect(users[0]).join(0);

      const groupAddr = await factory.getActiveGroup(0);
      expect(groupAddr).to.not.equal(ethers.ZeroAddress);

      const g = await ethers.getContractAt("AutoGroup", groupAddr);
      expect(await g.getMemberCount()).to.equal(1n);
      expect(await g.contributionAmount()).to.equal(TIERS[0]);
    });

    it("두 번째 유저 참가 → 같은 방에 입장", async () => {
      const groupBefore = await factory.getActiveGroup(0);
      await factory.connect(users[1]).join(0);
      const groupAfter  = await factory.getActiveGroup(0);

      expect(groupBefore).to.equal(groupAfter);
      const g = await ethers.getContractAt("AutoGroup", groupAfter);
      expect(await g.getMemberCount()).to.equal(2n);
    });

    it("tier 1(20 HHUSD) 첫 참가 → 별도 방 생성", async () => {
      await factory.connect(users[0]).join(1);
      const g0Addr = await factory.getActiveGroup(0);
      const g1Addr = await factory.getActiveGroup(1);
      expect(g0Addr).to.not.equal(g1Addr);
      const g1 = await ethers.getContractAt("AutoGroup", g1Addr);
      expect(await g1.contributionAmount()).to.equal(TIERS[1]);
    });

    it("잘못된 tierIndex → InvalidTier revert", async () => {
      await expect(factory.connect(users[0]).join(5))
        .to.be.revertedWithCustomError(factory, "InvalidTier");
    });
  });

  // ── 10명 카운트다운 ───────────────────────────────────────────────────────

  describe("10명 입장 시 카운트다운 자동 시작", () => {
    before(async () => { await deployAll(); });

    it("9명 입장 → 카운트다운 미시작", async () => {
      for (let i = 0; i < 9; i++) await factory.connect(users[i]).join(0);
      const gAddr = await factory.getActiveGroup(0);
      const g = await ethers.getContractAt("AutoGroup", gAddr);
      expect(await g.countdownStarted()).to.equal(false);
    });

    it("10번째 입장 → 카운트다운 시작", async () => {
      await factory.connect(users[9]).join(0);
      const gAddr = await factory.getActiveGroup(0);
      const g = await ethers.getContractAt("AutoGroup", gAddr);
      expect(await g.countdownStarted()).to.equal(true);
    });
  });

  // ── 방 가득 참 → 새 방 자동 생성 ─────────────────────────────────────────

  describe("방 마감 후 다음 join → 새 방 자동 생성", () => {
    let firstGroupAddr;

    before(async () => {
      await deployAll();

      // 10명 입장 → 카운트다운 시작
      for (let i = 0; i < 10; i++) await factory.connect(users[i]).join(0);
      firstGroupAddr = await factory.getActiveGroup(0);

      // 카운트다운 + 선택 창 종료 → 방 마감
      const g = await ethers.getContractAt("AutoGroup", firstGroupAddr);
      const deadline = await g.enrollmentDeadline();
      await time.increaseTo(deadline + 1n);
      await g.closeEnrollment();

      const selDeadline = await g.positionSelectionDeadline();
      await time.increaseTo(selDeadline + 1n);
      await g.finalizePositions();
      // 이제 ACTIVE 상태 → 새 참가자는 새 방으로 이동해야 함
    });

    it("기존 방은 ACTIVE 상태 (ENROLLING 아님)", async () => {
      const g = await ethers.getContractAt("AutoGroup", firstGroupAddr);
      expect(await g.state()).to.equal(2n); // ACTIVE
    });

    it("새 유저 join → 새 방 자동 생성", async () => {
      // users[10]은 아직 어느 방에도 없음
      await factory.connect(users[10]).join(0);

      const newGroupAddr = await factory.getActiveGroup(0);
      expect(newGroupAddr).to.not.equal(firstGroupAddr);

      const newG = await ethers.getContractAt("AutoGroup", newGroupAddr);
      expect(await newG.getMemberCount()).to.equal(1n);
      expect(await newG.state()).to.equal(0n); // ENROLLING
    });

    it("tier 0에 방이 2개 생성됨", async () => {
      expect(await factory.getGroupCount(0)).to.equal(2n);
    });

    it("getAllGroups(0) 배열에 두 방 주소 모두 포함", async () => {
      const all = await factory.getAllGroups(0);
      expect(all.length).to.equal(2);
      expect(all[0]).to.equal(firstGroupAddr);
      expect(all[1]).to.equal(await factory.getActiveGroup(0));
    });
  });

  // ── 동일 방 중복 참가 방지 ────────────────────────────────────────────────

  describe("중복 참가 방지", () => {
    before(async () => { await deployAll(); });

    it("같은 방에 두 번 join → AlreadyInGroup revert", async () => {
      await factory.connect(users[0]).join(0);
      await expect(factory.connect(users[0]).join(0))
        .to.be.revertedWithCustomError(factory, "AlreadyInGroup");
    });
  });

  // ── getAllTierStatus 뷰 ───────────────────────────────────────────────────

  describe("getAllTierStatus", () => {
    before(async () => {
      await deployAll();
      await factory.connect(users[0]).join(0); // tier 0
      await factory.connect(users[1]).join(2); // tier 2 (50 HHUSD)
    });

    it("활성 방이 있는 티어만 주소가 채워짐", async () => {
      const [groups, counts, totals] = await factory.getAllTierStatus();
      expect(groups[0]).to.not.equal(ethers.ZeroAddress);
      expect(groups[1]).to.equal(ethers.ZeroAddress);
      expect(groups[2]).to.not.equal(ethers.ZeroAddress);
      expect(groups[3]).to.equal(ethers.ZeroAddress);
      expect(groups[4]).to.equal(ethers.ZeroAddress);
      expect(counts[0]).to.equal(1n);
      expect(counts[2]).to.equal(1n);
      expect(totals[0]).to.equal(1n);
      expect(totals[2]).to.equal(1n);
    });
  });

  // ── getActiveGroupInfo ────────────────────────────────────────────────────

  describe("getActiveGroupInfo", () => {
    before(async () => {
      await deployAll();
      for (let i = 0; i < 10; i++) await factory.connect(users[i]).join(0);
    });

    it("10명 입장 후 카운트다운 시작 정보 반환", async () => {
      const info = await factory.getActiveGroupInfo(0);
      expect(info.memberCount).to.equal(10n);
      expect(info.countdownStarted).to.equal(true);
      expect(info.enrollmentDeadline).to.be.gt(0n);
      expect(info.state).to.equal(0n); // ENROLLING
    });

    it("존재하지 않는 티어 방 → 빈 정보 반환", async () => {
      const info = await factory.getActiveGroupInfo(4);
      expect(info.groupAddr).to.equal(ethers.ZeroAddress);
      expect(info.memberCount).to.equal(0n);
    });
  });
});
