const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("PrivateGroup 테스트", function () {
  let hhusd, vault, group;
  let admin, owner, users;

  const CONTRIBUTION   = ethers.parseEther("100");
  const TOTAL_CYCLES   = 5n;
  const CYCLE_INTERVAL = 7n * 24n * 3600n;
  const COLLATERAL_BP  = 14000n;
  const MAX_MEMBERS    = 5n;
  const POSITION_MODE_RANDOM = 2; // RandomAssignment

  beforeEach(async () => {
    [admin, owner, ...users] = await ethers.getSigners();

    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
    await hhusd.waitForDeployment();

    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    vault = await upgrades.deployProxy(
      CollateralVault,
      [admin.address, await hhusd.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );
    await vault.waitForDeployment();

    const MINTER = await hhusd.MINTER_ROLE();
    const BURNER = await hhusd.BURNER_ROLE();
    await hhusd.connect(admin).grantRole(MINTER, admin.address);
    await hhusd.connect(admin).grantRole(MINTER, await vault.getAddress());
    await hhusd.connect(admin).grantRole(BURNER, await vault.getAddress());

    // 멤버들에게 HHUSD 지급 (담보용)
    const REQUIRED = CONTRIBUTION * TOTAL_CYCLES * COLLATERAL_BP / 10000n;
    for (const u of users.slice(0, 5)) {
      await hhusd.connect(admin).mint(u.address, REQUIRED * 2n);
    }

    // PrivateGroup 배포
    group = await ethers.deployContract("PrivateGroup", [
      1n,
      owner.address,
      CONTRIBUTION,
      TOTAL_CYCLES,
      CYCLE_INTERVAL,
      COLLATERAL_BP,
      MAX_MEMBERS,
      POSITION_MODE_RANDOM,
      await hhusd.getAddress(),
      await vault.getAddress(),
    ]);

    const GROUP_ROLE = await vault.GROUP_ROLE();
    await vault.connect(admin).grantRole(GROUP_ROLE, await group.getAddress());
  });

  function inviteCode(n) {
    return ethers.keccak256(ethers.toUtf8Bytes(`invite-${n}`));
  }

  describe("초대코드 관리", () => {
    it("오너가 초대코드 생성 → validInviteCodes[code] = true", async () => {
      const code = inviteCode(1);
      await group.connect(owner).generateInviteCode(code);
      expect(await group.validInviteCodes(code)).to.equal(true);
    });

    it("오너가 아니면 초대코드 생성 불가 → NotOwner revert", async () => {
      await expect(
        group.connect(users[0]).generateInviteCode(inviteCode(1))
      ).to.be.revertedWithCustomError(group, "NotOwner");
    });

    it("중복 코드 생성 불가", async () => {
      const code = inviteCode(1);
      await group.connect(owner).generateInviteCode(code);
      await expect(
        group.connect(owner).generateInviteCode(code)
      ).to.be.revertedWith("PrivateGroup: code exists");
    });
  });

  describe("가입 (joinGroup)", () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await group.connect(owner).generateInviteCode(inviteCode(i));
      }
    });

    it("유효한 초대코드로 가입 성공 → 담보 잠금", async () => {
      await group.connect(users[0]).joinGroup(inviteCode(0));
      const m = await group.getMember(users[0].address);
      expect(m.wallet).to.equal(users[0].address);
      expect(await vault.getGroupCollateral(1n, users[0].address)).to.be.gt(0);
    });

    it("잘못된 초대코드 → InvalidInviteCode", async () => {
      await expect(
        group.connect(users[0]).joinGroup(inviteCode(99))
      ).to.be.revertedWithCustomError(group, "InvalidInviteCode");
    });

    it("사용된 초대코드 재사용 불가 → InvalidInviteCode", async () => {
      await group.connect(users[0]).joinGroup(inviteCode(0));
      await expect(
        group.connect(users[1]).joinGroup(inviteCode(0))
      ).to.be.revertedWithCustomError(group, "InvalidInviteCode");
    });

    it("이미 가입한 멤버 재가입 불가 → AlreadyMember", async () => {
      await group.connect(users[0]).joinGroup(inviteCode(0));
      await expect(
        group.connect(users[0]).joinGroup(inviteCode(1))
      ).to.be.revertedWithCustomError(group, "AlreadyMember");
    });
  });

  describe("그룹 시작 (startGroup)", () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await group.connect(owner).generateInviteCode(inviteCode(i));
      }
    });

    it("5명 가입 후 startGroup → ACTIVE + 포지션 배정", async () => {
      for (let i = 0; i < 5; i++) {
        await group.connect(users[i]).joinGroup(inviteCode(i));
      }
      await group.connect(owner).startGroup();
      expect(await group.state()).to.equal(1); // ACTIVE

      const positions = new Set();
      for (let i = 0; i < 5; i++) {
        const m = await group.getMember(users[i].address);
        expect(m.position).to.be.gt(0);
        positions.add(Number(m.position));
      }
      expect(positions.size).to.equal(5);
    });

    it("1명만 가입 후 startGroup → revert (2명 이상 필요)", async () => {
      await group.connect(users[0]).joinGroup(inviteCode(0));
      await expect(
        group.connect(owner).startGroup()
      ).to.be.revertedWith("PrivateGroup: need 2+ members");
    });

    it("오너 아닌 계정이 startGroup → NotOwner", async () => {
      for (let i = 0; i < 5; i++) {
        await group.connect(users[i]).joinGroup(inviteCode(i));
      }
      await expect(
        group.connect(users[0]).startGroup()
      ).to.be.revertedWithCustomError(group, "NotOwner");
    });
  });
});
