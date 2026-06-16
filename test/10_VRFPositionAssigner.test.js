const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VRFPositionAssigner (MockVRFAssigner 기반)", function () {
  let mockVRF, group, vault, hhusd;
  let admin, devWallet, eventWallet, users;

  const GROUP_ID       = 1n;
  const CONTRIBUTION   = ethers.parseEther("100");
  const TOTAL_CYCLES   = 10n;
  const CYCLE_INTERVAL = 7n * 24n * 3600n;
  const COLLATERAL_BP  = 14000n;

  beforeEach(async () => {
    [admin, devWallet, eventWallet, ...users] = await ethers.getSigners();

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

    mockVRF = await ethers.deployContract("MockVRFAssigner");

    const MINTER = await hhusd.MINTER_ROLE();
    const BURNER = await hhusd.BURNER_ROLE();
    await hhusd.connect(admin).grantRole(MINTER, admin.address);
    await hhusd.connect(admin).grantRole(MINTER, await vault.getAddress());
    await hhusd.connect(admin).grantRole(BURNER, await vault.getAddress());

    for (const u of users.slice(0, 10)) {
      await hhusd.connect(admin).mint(u.address, ethers.parseEther("5000"));
    }
  });

  async function deployGroup() {
    const g = await ethers.deployContract("PublicGroupVRF", [
      GROUP_ID, CONTRIBUTION, TOTAL_CYCLES, CYCLE_INTERVAL, COLLATERAL_BP,
      await vault.getAddress(), await mockVRF.getAddress(),
      devWallet.address, eventWallet.address,
    ]);
    const GROUP_ROLE = await vault.GROUP_ROLE();
    await vault.connect(admin).grantRole(GROUP_ROLE, await g.getAddress());
    return g;
  }

  async function joinAndActivate(g) {
    for (const u of users.slice(0, 10)) {
      await g.connect(u).joinGroup();
    }
    await time.increase(24 * 3600 + 1);
    await g.closeEnrollment();
    await time.increase(12 * 3600 + 1);
    await g.finalizePositions(); // → PENDING_VRF
  }

  describe("requestRandomness", () => {
    it("연속 호출 시 requestId가 1씩 증가", async () => {
      group = await deployGroup();
      await joinAndActivate(group);
      // 이미 1회 요청됨 (finalizePositions에서) → nextRequestId = 2
      // 두 번째 그룹으로 재요청
      const group2 = await deployGroup();
      for (const u of users.slice(0, 10)) {
        await group2.connect(u).joinGroup();
      }
      await time.increase(24 * 3600 + 1);
      await group2.closeEnrollment();
      await time.increase(12 * 3600 + 1);
      const tx = await group2.finalizePositions();
      const receipt = await tx.wait();
      // pendingVrfRequestId가 2여야 함
      expect(await group2.pendingVrfRequestId()).to.equal(2n);
    });
  });

  describe("fulfill → receiveRandomPositions 콜백", () => {
    it("VRF fulfill 후 ACTIVE 전환 + 포지션 배정", async () => {
      group = await deployGroup();
      await joinAndActivate(group);
      expect(await group.state()).to.equal(2); // PENDING_VRF

      await mockVRF.fulfill(await group.getAddress(), [ethers.toBigInt("0xdeadbeef")]);
      expect(await group.state()).to.equal(3); // ACTIVE

      const positions = new Set();
      for (const u of users.slice(0, 10)) {
        const m = await group.getMember(u.address);
        expect(m.position).to.be.gt(0);
        positions.add(Number(m.position));
      }
      expect(positions.size).to.equal(10); // 중복 없음
    });

    it("그룹 컨트랙트가 아닌 주소로 receiveRandomPositions 호출 → OnlyVRFAssigner revert", async () => {
      group = await deployGroup();
      await joinAndActivate(group);
      await expect(
        group.connect(admin).receiveRandomPositions([123n])
      ).to.be.revertedWithCustomError(group, "OnlyVRFAssigner");
    });
  });

  describe("Fisher-Yates 셔플 검증", () => {
    it("다양한 randomWords 값으로 항상 포지션 1~10 중복 없이 배정", async () => {
      const seeds = [
        "0x1111111111",
        "0xabcdef1234",
        "0x9999999999",
      ];

      for (const seed of seeds) {
        // 각 반복마다 유저 HHUSD 잔액 재충전 (잠긴 담보 누적 방지)
        const REQUIRED = CONTRIBUTION * TOTAL_CYCLES * COLLATERAL_BP / 10000n;
        for (const u of users.slice(0, 10)) {
          const bal = await hhusd.balanceOf(u.address);
          if (bal < REQUIRED) {
            await hhusd.connect(admin).mint(u.address, REQUIRED * 2n);
          }
        }

        const g = await deployGroup();
        for (const u of users.slice(0, 10)) {
          await g.connect(u).joinGroup();
        }
        await time.increase(24 * 3600 + 1);
        await g.closeEnrollment();
        await time.increase(12 * 3600 + 1);
        await g.finalizePositions();
        await mockVRF.fulfill(await g.getAddress(), [ethers.toBigInt(seed)]);

        const positions = new Set();
        for (const u of users.slice(0, 10)) {
          const m = await g.getMember(u.address);
          expect(m.position).to.be.gte(1);
          expect(m.position).to.be.lte(10);
          positions.add(Number(m.position));
        }
        expect(positions.size).to.equal(10);
      }
    });
  });
});
