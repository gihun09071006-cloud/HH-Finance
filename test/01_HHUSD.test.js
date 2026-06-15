const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("HHUSD", function () {
  let hhusd, admin, minter, user;

  beforeEach(async () => {
    [admin, minter, user] = await ethers.getSigners();
    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
    await hhusd.waitForDeployment();

    const MINTER_ROLE = await hhusd.MINTER_ROLE();
    const BURNER_ROLE = await hhusd.BURNER_ROLE();
    await hhusd.connect(admin).grantRole(MINTER_ROLE, minter.address);
    await hhusd.connect(admin).grantRole(BURNER_ROLE, minter.address);
  });

  it("mint/burn 정상 동작", async () => {
    await hhusd.connect(minter).mint(user.address, ethers.parseEther("100"));
    expect(await hhusd.balanceOf(user.address)).to.equal(ethers.parseEther("100"));

    await hhusd.connect(minter).burn(user.address, ethers.parseEther("40"));
    expect(await hhusd.balanceOf(user.address)).to.equal(ethers.parseEther("60"));
  });

  it("일반 유저는 전송 불가", async () => {
    await hhusd.connect(minter).mint(user.address, ethers.parseEther("100"));
    await expect(
      hhusd.connect(user).transfer(minter.address, ethers.parseEther("10"))
    ).to.be.revertedWithCustomError(hhusd, "HHUSDNotTransferable");
  });

  it("권한 없으면 mint 불가", async () => {
    await expect(
      hhusd.connect(user).mint(user.address, ethers.parseEther("100"))
    ).to.be.reverted;
  });
});
