const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("UUPS 업그레이드 권한 테스트", function () {
  let admin, attacker;

  beforeEach(async () => {
    [admin, attacker] = await ethers.getSigners();
  });

  // ── HHUSD ─────────────────────────────────────────────────────────────────
  describe("HHUSD", () => {
    let hhusd;
    beforeEach(async () => {
      const HHUSD = await ethers.getContractFactory("HHUSD");
      hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
      await hhusd.waitForDeployment();
    });

    it("UPGRADER_ROLE 있으면 업그레이드 성공", async () => {
      const HHUSD2 = await ethers.getContractFactory("HHUSD");
      await expect(upgrades.upgradeProxy(await hhusd.getAddress(), HHUSD2)).to.not.be.rejected;
    });

    it("UPGRADER_ROLE 없으면 업그레이드 실패", async () => {
      const HHUSD2 = await ethers.getContractFactory("HHUSD", attacker);
      await expect(
        upgrades.upgradeProxy(await hhusd.getAddress(), HHUSD2)
      ).to.be.rejected;
    });
  });

  // ── GroupRegistry ─────────────────────────────────────────────────────────
  describe("GroupRegistry", () => {
    let registry;
    beforeEach(async () => {
      const GroupRegistry = await ethers.getContractFactory("GroupRegistry");
      registry = await upgrades.deployProxy(GroupRegistry, [admin.address], { kind: "uups" });
      await registry.waitForDeployment();
    });

    it("UPGRADER_ROLE 있으면 업그레이드 성공", async () => {
      const GR2 = await ethers.getContractFactory("GroupRegistry");
      await expect(upgrades.upgradeProxy(await registry.getAddress(), GR2)).to.not.be.rejected;
    });

    it("UPGRADER_ROLE 없으면 업그레이드 실패", async () => {
      const GR2 = await ethers.getContractFactory("GroupRegistry", attacker);
      await expect(
        upgrades.upgradeProxy(await registry.getAddress(), GR2)
      ).to.be.rejected;
    });
  });

  // ── CollateralVault ───────────────────────────────────────────────────────
  describe("CollateralVault", () => {
    let vault, hhusd;
    beforeEach(async () => {
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
    });

    it("UPGRADER_ROLE 있으면 업그레이드 성공", async () => {
      const CV2 = await ethers.getContractFactory("CollateralVault");
      await expect(
        upgrades.upgradeProxy(await vault.getAddress(), CV2, { unsafeAllow: ["constructor"] })
      ).to.not.be.rejected;
    });

    it("UPGRADER_ROLE 없으면 업그레이드 실패", async () => {
      const CV2 = await ethers.getContractFactory("CollateralVault", attacker);
      await expect(
        upgrades.upgradeProxy(await vault.getAddress(), CV2, { unsafeAllow: ["constructor"] })
      ).to.be.rejected;
    });
  });

  // ── TreasuryV2 ────────────────────────────────────────────────────────────
  describe("TreasuryV2", () => {
    let treasury, hhusd, usdt, registry;
    beforeEach(async () => {
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
          admin.address, await registry.getAddress()],
        { kind: "uups", unsafeAllow: ["constructor"] }
      );
      await treasury.waitForDeployment();
    });

    it("UPGRADER_ROLE 있으면 업그레이드 성공", async () => {
      const TV3 = await ethers.getContractFactory("TreasuryV2");
      await expect(
        upgrades.upgradeProxy(await treasury.getAddress(), TV3, { unsafeAllow: ["constructor"] })
      ).to.not.be.rejected;
    });

    it("UPGRADER_ROLE 없으면 업그레이드 실패", async () => {
      const TV3 = await ethers.getContractFactory("TreasuryV2", attacker);
      await expect(
        upgrades.upgradeProxy(await treasury.getAddress(), TV3, { unsafeAllow: ["constructor"] })
      ).to.be.rejected;
    });
  });
});
