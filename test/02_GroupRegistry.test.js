const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("GroupRegistry", function () {
  let registry, admin, registrar, user;

  beforeEach(async () => {
    [admin, registrar, user] = await ethers.getSigners();
    const GroupRegistry = await ethers.getContractFactory("GroupRegistry");
    registry = await upgrades.deployProxy(GroupRegistry, [admin.address], { kind: "uups" });
    await registry.waitForDeployment();

    const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
    await registry.connect(admin).grantRole(REGISTRAR_ROLE, registrar.address);
  });

  it("그룹 등록 및 조회", async () => {
    await registry.connect(registrar).registerGroup(
      1,
      user.address, // 테스트용으로 임의 주소 사용
      ethers.parseEther("100"),
      10
    );

    expect(await registry.isRegistered(1)).to.equal(true);
    expect(await registry.totalGroups()).to.equal(1);

    const info = await registry.getGroupInfo(1);
    expect(info.contributionAmount).to.equal(ethers.parseEther("100"));
    expect(info.totalCycles).to.equal(10);
  });

  it("중복 등록 불가", async () => {
    await registry.connect(registrar).registerGroup(1, user.address, ethers.parseEther("100"), 10);
    await expect(
      registry.connect(registrar).registerGroup(1, user.address, ethers.parseEther("100"), 10)
    ).to.be.revertedWithCustomError(registry, "GroupAlreadyRegistered");
  });

  it("권한 없으면 등록 불가", async () => {
    await expect(
      registry.connect(user).registerGroup(1, user.address, ethers.parseEther("100"), 10)
    ).to.be.reverted;
  });

  it("등록 해제", async () => {
    await registry.connect(registrar).registerGroup(1, user.address, ethers.parseEther("100"), 10);
    await registry.connect(admin).unregisterGroup(1);
    expect(await registry.isRegistered(1)).to.equal(false);
  });
});
