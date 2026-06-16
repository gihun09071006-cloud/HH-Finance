const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("PublicGroupFactory 테스트", function () {
  let factory, hhusd, vault;
  let admin, user;

  beforeEach(async () => {
    [admin, user] = await ethers.getSigners();

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

    const PublicGroupFactory = await ethers.getContractFactory("PublicGroupFactory");
    factory = await upgrades.deployProxy(
      PublicGroupFactory,
      [admin.address, await hhusd.getAddress(), await vault.getAddress()],
      { kind: "uups" }
    );
    await factory.waitForDeployment();
  });

  describe("그룹 생성 (createGroup)", () => {
    it("templateId=0으로 그룹 생성 → GroupCreated 이벤트 발생", async () => {
      await expect(factory.connect(user).createGroup(0))
        .to.emit(factory, "GroupCreated");
    });

    it("templateId=3 (100 HHUSD 템플릿)으로 그룹 생성 성공", async () => {
      const tx = await factory.connect(user).createGroup(3);
      const receipt = await tx.wait();
      expect(await factory.getGroupCount()).to.equal(1);
    });

    it("생성된 그룹 주소가 allGroups에 추가됨", async () => {
      await factory.connect(user).createGroup(0);
      await factory.connect(user).createGroup(1);
      expect(await factory.getGroupCount()).to.equal(2);
      const all = await factory.getAllGroups();
      expect(all.length).to.equal(2);
      expect(all[0]).to.not.equal(ethers.ZeroAddress);
    });

    it("잘못된 templateId → revert", async () => {
      await expect(factory.connect(user).createGroup(99))
        .to.be.revertedWith("Factory: invalid template");
    });
  });

  describe("템플릿 관리 (addTemplate)", () => {
    it("DEFAULT_ADMIN이 addTemplate 성공 → TemplateAdded 이벤트", async () => {
      await expect(
        factory.connect(admin).addTemplate(
          ethers.parseEther("200"), 12, 7 * 24 * 3600, 14000
        )
      ).to.emit(factory, "TemplateAdded");
    });

    it("addTemplate 후 새 템플릿으로 그룹 생성 가능", async () => {
      await factory.connect(admin).addTemplate(
        ethers.parseEther("200"), 12, 7 * 24 * 3600, 14000
      );
      // 기본 4개 + 1개 = 5개, templateId=4
      await expect(factory.connect(user).createGroup(4)).to.not.be.rejected;
    });

    it("ADMIN 아니면 addTemplate 불가 → revert", async () => {
      await expect(
        factory.connect(user).addTemplate(
          ethers.parseEther("200"), 12, 7 * 24 * 3600, 14000
        )
      ).to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pause", () => {
    it("pause 후 createGroup → EnforcedPause revert", async () => {
      await factory.connect(admin).pause();
      await expect(factory.connect(user).createGroup(0))
        .to.be.revertedWithCustomError(factory, "EnforcedPause");
    });

    it("unpause 후 createGroup 정상 동작", async () => {
      await factory.connect(admin).pause();
      await factory.connect(admin).unpause();
      await expect(factory.connect(user).createGroup(0)).to.not.be.rejected;
    });
  });
});
