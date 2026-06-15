const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("CollateralVault", function () {
  let vault, hhusd;
  let admin, groupContract, user, user2, slashRecipient;

  const COLLATERAL = ethers.parseEther("1000");

  beforeEach(async () => {
    [admin, groupContract, user, user2, slashRecipient] = await ethers.getSigners();

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

    // HHUSD 역할 부여
    const MINTER_ROLE = await hhusd.MINTER_ROLE();
    const BURNER_ROLE = await hhusd.BURNER_ROLE();
    await hhusd.connect(admin).grantRole(MINTER_ROLE, admin.address);
    await hhusd.connect(admin).grantRole(BURNER_ROLE, await vault.getAddress());

    // vault에 GROUP_ROLE 부여
    const GROUP_ROLE = await vault.GROUP_ROLE();
    await vault.connect(admin).grantRole(GROUP_ROLE, groupContract.address);

    // user, user2에게 HHUSD 지급
    await hhusd.connect(admin).mint(user.address, ethers.parseEther("5000"));
    await hhusd.connect(admin).mint(user2.address, ethers.parseEther("5000"));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  lockCollateral
  // ════════════════════════════════════════════════════════════════════════

  describe("lockCollateral", () => {
    it("담보 잠금 성공 - 상태 업데이트 확인", async () => {
      await vault.connect(groupContract).lockCollateral(user.address, 1, COLLATERAL);

      expect(await vault.lockedCollateral(user.address)).to.equal(COLLATERAL);
      expect(await vault.getGroupCollateral(1, user.address)).to.equal(COLLATERAL);
      expect(await vault.groupTotalCollateral(1)).to.equal(COLLATERAL);
    });

    it("여러 유저 담보 누적", async () => {
      await vault.connect(groupContract).lockCollateral(user.address, 1, COLLATERAL);
      await vault.connect(groupContract).lockCollateral(user2.address, 1, COLLATERAL);

      expect(await vault.groupTotalCollateral(1)).to.equal(COLLATERAL * 2n);
    });

    it("HHUSD 잔액 부족 시 revert", async () => {
      const tooMuch = ethers.parseEther("9999");
      await expect(
        vault.connect(groupContract).lockCollateral(user.address, 1, tooMuch)
      ).to.be.revertedWithCustomError(vault, "InsufficientHHUSD");
    });

    it("이미 잠긴 금액 + 추가 요청이 잔액 초과 시 revert", async () => {
      await vault.connect(groupContract).lockCollateral(user.address, 1, ethers.parseEther("4000"));
      await expect(
        vault.connect(groupContract).lockCollateral(user.address, 2, ethers.parseEther("2000"))
      ).to.be.revertedWithCustomError(vault, "InsufficientHHUSD");
    });

    it("0 금액 revert", async () => {
      await expect(
        vault.connect(groupContract).lockCollateral(user.address, 1, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("GROUP_ROLE 없으면 revert", async () => {
      await expect(
        vault.connect(user).lockCollateral(user.address, 1, COLLATERAL)
      ).to.be.reverted;
    });

    it("CollateralLocked 이벤트 발생", async () => {
      await expect(
        vault.connect(groupContract).lockCollateral(user.address, 1, COLLATERAL)
      )
        .to.emit(vault, "CollateralLocked")
        .withArgs(user.address, 1, COLLATERAL);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  unlockCollateral
  // ════════════════════════════════════════════════════════════════════════

  describe("unlockCollateral", () => {
    beforeEach(async () => {
      await vault.connect(groupContract).lockCollateral(user.address, 1, COLLATERAL);
    });

    it("담보 해제 성공 - 상태 초기화 확인", async () => {
      await vault.connect(groupContract).unlockCollateral(user.address, 1, COLLATERAL);

      expect(await vault.lockedCollateral(user.address)).to.equal(0);
      expect(await vault.getGroupCollateral(1, user.address)).to.equal(0);
      expect(await vault.groupTotalCollateral(1)).to.equal(0);
    });

    it("부분 해제 가능", async () => {
      const half = COLLATERAL / 2n;
      await vault.connect(groupContract).unlockCollateral(user.address, 1, half);

      expect(await vault.lockedCollateral(user.address)).to.equal(half);
    });

    it("잠긴 금액 초과 해제 시 revert", async () => {
      await expect(
        vault.connect(groupContract).unlockCollateral(user.address, 1, COLLATERAL + 1n)
      ).to.be.revertedWithCustomError(vault, "InsufficientLockedCollateral");
    });

    it("0 금액 revert", async () => {
      await expect(
        vault.connect(groupContract).unlockCollateral(user.address, 1, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("CollateralUnlocked 이벤트 발생", async () => {
      await expect(
        vault.connect(groupContract).unlockCollateral(user.address, 1, COLLATERAL)
      )
        .to.emit(vault, "CollateralUnlocked")
        .withArgs(user.address, 1, COLLATERAL);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  slashCollateral
  // ════════════════════════════════════════════════════════════════════════

  describe("slashCollateral", () => {
    beforeEach(async () => {
      await vault.connect(groupContract).lockCollateral(user.address, 1, COLLATERAL);
    });

    it("recipient=address(0) → HHUSD 소각", async () => {
      const totalSupplyBefore = await hhusd.totalSupply();
      await vault
        .connect(groupContract)
        .slashCollateral(user.address, 1, COLLATERAL, ethers.ZeroAddress);

      expect(await hhusd.totalSupply()).to.equal(totalSupplyBefore - COLLATERAL);
      expect(await vault.lockedCollateral(user.address)).to.equal(0);
    });

    it("recipient 있으면 담보만 해제 (소각 없음)", async () => {
      const totalSupplyBefore = await hhusd.totalSupply();
      await vault
        .connect(groupContract)
        .slashCollateral(user.address, 1, COLLATERAL, slashRecipient.address);

      // 소각 없음 - totalSupply 유지
      expect(await hhusd.totalSupply()).to.equal(totalSupplyBefore);
      expect(await vault.lockedCollateral(user.address)).to.equal(0);
    });

    it("잠긴 금액 초과 슬래시 시 revert", async () => {
      await expect(
        vault
          .connect(groupContract)
          .slashCollateral(user.address, 1, COLLATERAL + 1n, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "InsufficientLockedCollateral");
    });

    it("0 금액 revert", async () => {
      await expect(
        vault.connect(groupContract).slashCollateral(user.address, 1, 0, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("CollateralSlashed 이벤트 발생", async () => {
      await expect(
        vault
          .connect(groupContract)
          .slashCollateral(user.address, 1, COLLATERAL, ethers.ZeroAddress)
      )
        .to.emit(vault, "CollateralSlashed")
        .withArgs(user.address, 1, COLLATERAL, ethers.ZeroAddress);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  View 함수
  // ════════════════════════════════════════════════════════════════════════

  describe("View 함수", () => {
    it("getRequiredCollateral 계산 (100% ratio)", async () => {
      // 100 USDT * 10 cycles * 10000 / 10000 = 1000
      const result = await vault.getRequiredCollateral(
        ethers.parseEther("100"),
        10,
        10000
      );
      expect(result).to.equal(ethers.parseEther("1000"));
    });

    it("getRequiredCollateral 계산 (50% ratio)", async () => {
      // 100 * 10 * 5000 / 10000 = 500
      const result = await vault.getRequiredCollateral(
        ethers.parseEther("100"),
        10,
        5000
      );
      expect(result).to.equal(ethers.parseEther("500"));
    });

    it("isCollateralSufficient - 충분한 잔액", async () => {
      expect(
        await vault.isCollateralSufficient(user.address, ethers.parseEther("3000"))
      ).to.be.true;
    });

    it("isCollateralSufficient - 잠긴 후 가용 잔액 부족", async () => {
      await vault.connect(groupContract).lockCollateral(user.address, 1, ethers.parseEther("4000"));
      expect(
        await vault.isCollateralSufficient(user.address, ethers.parseEther("2000"))
      ).to.be.false;
    });
  });
});
