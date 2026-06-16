const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Pause / Unpause 테스트", function () {
  let treasury, hhusd, usdt, registry;
  let admin, pauser, feeReceiver, user;

  beforeEach(async () => {
    [admin, pauser, feeReceiver, user] = await ethers.getSigners();

    usdt = await ethers.deployContract("MockUSDT");

    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
    await hhusd.waitForDeployment();

    const GroupRegistry = await ethers.getContractFactory("GroupRegistry");
    registry = await upgrades.deployProxy(GroupRegistry, [admin.address], { kind: "uups" });
    await registry.waitForDeployment();

    const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
    treasury = await upgrades.deployProxy(
      TreasuryV2,
      [admin.address, await usdt.getAddress(), await hhusd.getAddress(),
        feeReceiver.address, await registry.getAddress()],
      { kind: "uups", unsafeAllow: ["constructor"] }
    );
    await treasury.waitForDeployment();

    const MINTER = await hhusd.MINTER_ROLE();
    const BURNER = await hhusd.BURNER_ROLE();
    await hhusd.connect(admin).grantRole(MINTER, await treasury.getAddress());
    await hhusd.connect(admin).grantRole(BURNER, await treasury.getAddress());

    // user에게 USDT + HHUSD 지급
    await usdt.mint(user.address, ethers.parseEther("10000"));
    await usdt.connect(user).approve(await treasury.getAddress(), ethers.MaxUint256);

    // PAUSER_ROLE을 별도 계정에도 부여
    const PAUSER = await treasury.PAUSER_ROLE();
    await treasury.connect(admin).grantRole(PAUSER, pauser.address);
  });

  describe("pause 권한", () => {
    it("PAUSER_ROLE 없으면 pause 불가 → revert", async () => {
      await expect(treasury.connect(user).pause())
        .to.be.revertedWithCustomError(treasury, "AccessControlUnauthorizedAccount");
    });

    it("PAUSER_ROLE 있으면 pause 성공", async () => {
      await expect(treasury.connect(pauser).pause()).to.not.be.rejected;
      expect(await treasury.paused()).to.equal(true);
    });
  });

  describe("pause 후 기능 제한", () => {
    beforeEach(async () => {
      await treasury.connect(admin).pause();
    });

    it("pause 후 depositUSDT → EnforcedPause revert", async () => {
      await expect(
        treasury.connect(user).depositUSDT(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(treasury, "EnforcedPause");
    });

    it("pause 후 redeemHHUSD는 제한 없음 (whenNotPaused 미적용 확인)", async () => {
      // TreasuryV2.redeemHHUSD는 whenNotPaused 미적용 → pause 중에도 호출 가능
      // (잔액 부족으로 다른 이유로 revert됨 - InsufficientHHUSD)
      await expect(
        treasury.connect(user).redeemHHUSD(ethers.parseEther("100"))
      ).to.not.be.revertedWithCustomError(treasury, "EnforcedPause");
    });
  });

  describe("unpause 후 정상 동작", () => {
    it("unpause 후 depositUSDT 성공", async () => {
      await treasury.connect(admin).pause();
      await treasury.connect(admin).unpause();

      await expect(
        treasury.connect(user).depositUSDT(ethers.parseEther("1000"))
      ).to.not.be.rejected;
    });

    it("PAUSER_ROLE 없으면 unpause 불가", async () => {
      await treasury.connect(admin).pause();
      await expect(treasury.connect(user).unpause())
        .to.be.revertedWithCustomError(treasury, "AccessControlUnauthorizedAccount");
    });
  });
});
