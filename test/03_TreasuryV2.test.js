const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("TreasuryV2", function () {
  let treasury, hhusd, usdt;
  let admin, feeReceiver, user, user2, groupContract;

  const DEPOSIT = ethers.parseEther("1000");
  const BUY_FEE_BP = 250n;
  const SELL_FEE_BP = 250n;
  const BP_BASE = 10000n;

  // 그룹 mock: GroupRegistry 역할을 하는 간단한 stub
  let mockRegistry;

  beforeEach(async () => {
    [admin, feeReceiver, user, user2, groupContract] = await ethers.getSigners();

    // MockUSDT 배포
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();

    // HHUSD 배포
    const HHUSD = await ethers.getContractFactory("HHUSD");
    hhusd = await upgrades.deployProxy(HHUSD, [admin.address], { kind: "uups" });
    await hhusd.waitForDeployment();

    // MockRegistry 배포 (inline mock contract)
    const MockRegistry = await ethers.getContractFactory("MockGroupRegistry");
    mockRegistry = await MockRegistry.deploy();

    // TreasuryV2 배포
    const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
    treasury = await upgrades.deployProxy(
      TreasuryV2,
      [
        admin.address,
        await usdt.getAddress(),
        await hhusd.getAddress(),
        feeReceiver.address,
        await mockRegistry.getAddress(),
      ],
      { kind: "uups", unsafeAllow: ["state-variable-immutable", "constructor"] }
    );
    await treasury.waitForDeployment();

    // HHUSD에 Treasury를 MINTER/BURNER로 등록
    const MINTER_ROLE = await hhusd.MINTER_ROLE();
    const BURNER_ROLE = await hhusd.BURNER_ROLE();
    await hhusd.connect(admin).grantRole(MINTER_ROLE, await treasury.getAddress());
    await hhusd.connect(admin).grantRole(BURNER_ROLE, await treasury.getAddress());

    // Treasury에 PAYOUT_EXECUTOR 역할 부여 (groupContract 시뮬레이션)
    const PAYOUT_ROLE = await treasury.PAYOUT_EXECUTOR_ROLE();
    await treasury.connect(admin).grantRole(PAYOUT_ROLE, groupContract.address);

    // 유저에게 USDT 지급 및 approve
    await usdt.mint(user.address, ethers.parseEther("10000"));
    await usdt.mint(user2.address, ethers.parseEther("10000"));
    await usdt.connect(user).approve(await treasury.getAddress(), ethers.MaxUint256);
    await usdt.connect(user2).approve(await treasury.getAddress(), ethers.MaxUint256);
  });

  // ════════════════════════════════════════════════════════════════════════
  //  입금 (depositUSDT)
  // ════════════════════════════════════════════════════════════════════════

  describe("depositUSDT", () => {
    it("입금 시 수수료 차감 후 HHUSD 발행", async () => {
      await treasury.connect(user).depositUSDT(DEPOSIT);

      const fee = (DEPOSIT * BUY_FEE_BP) / BP_BASE;
      const netAmount = DEPOSIT - fee;

      expect(await hhusd.balanceOf(user.address)).to.equal(netAmount);
      expect(await usdt.balanceOf(feeReceiver.address)).to.equal(fee);
    });

    it("추천인 있으면 추천 수수료 지급", async () => {
      await treasury.connect(user).setReferrer(user2.address);
      await treasury.connect(user).depositUSDT(DEPOSIT);

      const refReward = (DEPOSIT * 100n) / BP_BASE; // referralFeeBP = 100
      expect(await usdt.balanceOf(user2.address)).to.equal(
        ethers.parseEther("10000") + refReward
      );
    });

    it("최소 금액 미만이면 revert", async () => {
      await expect(
        treasury.connect(user).depositUSDT(ethers.parseEther("0.5"))
      ).to.be.revertedWithCustomError(treasury, "BelowMin");
    });

    it("최대 금액 초과 시 revert", async () => {
      await usdt.mint(user.address, ethers.parseEther("200000"));
      await expect(
        treasury.connect(user).depositUSDT(ethers.parseEther("200000"))
      ).to.be.revertedWithCustomError(treasury, "AboveMax");
    });

    it("0원 입금 revert", async () => {
      await expect(
        treasury.connect(user).depositUSDT(0)
      ).to.be.revertedWithCustomError(treasury, "ZeroAmount");
    });

    it("일시정지 시 입금 불가", async () => {
      await treasury.connect(admin).pause();
      await expect(
        treasury.connect(user).depositUSDT(DEPOSIT)
      ).to.be.revertedWithCustomError(treasury, "EnforcedPause");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  출금 (redeemHHUSD)
  // ════════════════════════════════════════════════════════════════════════

  describe("redeemHHUSD", () => {
    beforeEach(async () => {
      await treasury.connect(user).depositUSDT(DEPOSIT);
    });

    it("HHUSD 소각 후 USDT 반환 (수수료 차감)", async () => {
      const hhusdBal = await hhusd.balanceOf(user.address);
      await treasury.connect(user).redeemHHUSD(hhusdBal);

      const sellFee = (hhusdBal * SELL_FEE_BP) / BP_BASE;
      const usdtOut = hhusdBal - sellFee;

      expect(await hhusd.balanceOf(user.address)).to.equal(0);
      // user가 받은 USDT = 원래 잔액 - 입금액 + 출금액
      const buyFee = (DEPOSIT * BUY_FEE_BP) / BP_BASE;
      const expectedUSDT = ethers.parseEther("10000") - DEPOSIT + usdtOut;
      expect(await usdt.balanceOf(user.address)).to.equal(expectedUSDT);
    });

    it("잔액 부족 시 revert", async () => {
      const hhusdBal = await hhusd.balanceOf(user.address);
      await expect(
        treasury.connect(user).redeemHHUSD(hhusdBal + 1n)
      ).to.be.revertedWithCustomError(treasury, "InsufficientHHUSD");
    });

    it("0 출금 revert", async () => {
      await expect(
        treasury.connect(user).redeemHHUSD(0)
      ).to.be.revertedWithCustomError(treasury, "ZeroAmount");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  추천인 설정 (setReferrer)
  // ════════════════════════════════════════════════════════════════════════

  describe("setReferrer", () => {
    it("추천인 설정 성공", async () => {
      await treasury.connect(user).setReferrer(user2.address);
      expect(await treasury.referrer(user.address)).to.equal(user2.address);
    });

    it("자기 자신을 추천인으로 설정 불가", async () => {
      await expect(
        treasury.connect(user).setReferrer(user.address)
      ).to.be.revertedWithCustomError(treasury, "SelfReferral");
    });

    it("추천인 중복 설정 불가", async () => {
      await treasury.connect(user).setReferrer(user2.address);
      await expect(
        treasury.connect(user).setReferrer(admin.address)
      ).to.be.revertedWithCustomError(treasury, "ReferrerAlreadySet");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  그룹 기여금 (contributeToGroup)
  // ════════════════════════════════════════════════════════════════════════

  describe("contributeToGroup", () => {
    const GROUP_ID = 1n;
    const CYCLE = 1n;
    const CONTRIBUTION = ethers.parseEther("100");

    beforeEach(async () => {
      // MockRegistry에 그룹 설정
      await mockRegistry.setGroup(GROUP_ID, true, CONTRIBUTION, CYCLE);
      // user에게 USDT approve
      await usdt.connect(user).approve(await treasury.getAddress(), ethers.MaxUint256);
    });

    it("기여금 납부 성공 - pool 적립", async () => {
      await treasury.connect(user).contributeToGroup(GROUP_ID, CYCLE);
      expect(await treasury.groupPool(GROUP_ID)).to.equal(CONTRIBUTION);
      expect(await treasury.hasMemberPaid(GROUP_ID, CYCLE, user.address)).to.be.true;
    });

    it("같은 사이클 중복 납부 불가", async () => {
      await treasury.connect(user).contributeToGroup(GROUP_ID, CYCLE);
      await expect(
        treasury.connect(user).contributeToGroup(GROUP_ID, CYCLE)
      ).to.be.revertedWithCustomError(treasury, "AlreadyPaidThisCycle");
    });

    it("잘못된 그룹ID revert", async () => {
      await expect(
        treasury.connect(user).contributeToGroup(999n, CYCLE)
      ).to.be.revertedWithCustomError(treasury, "InvalidGroup");
    });

    it("잘못된 사이클 번호 revert", async () => {
      await expect(
        treasury.connect(user).contributeToGroup(GROUP_ID, 99n)
      ).to.be.revertedWith("Treasury: wrong cycle");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  그룹 지급 (executeGroupPayout)
  // ════════════════════════════════════════════════════════════════════════

  describe("executeGroupPayout", () => {
    const GROUP_ID = 1n;
    const CYCLE = 1n;
    const CONTRIBUTION = ethers.parseEther("100");

    beforeEach(async () => {
      await mockRegistry.setGroup(GROUP_ID, true, CONTRIBUTION, CYCLE);
      // user, user2 둘 다 납부
      await treasury.connect(user).contributeToGroup(GROUP_ID, CYCLE);
      await treasury.connect(user2).contributeToGroup(GROUP_ID, CYCLE);
    });

    it("지급 실행 - pool 전액 recipient에게 전송", async () => {
      const pool = await treasury.groupPool(GROUP_ID);
      const before = await usdt.balanceOf(user.address);

      await treasury.connect(groupContract).executeGroupPayout(GROUP_ID, CYCLE, user.address);

      expect(await usdt.balanceOf(user.address)).to.equal(before + pool);
      expect(await treasury.groupPool(GROUP_ID)).to.equal(0);
    });

    it("같은 사이클 중복 지급 불가", async () => {
      await treasury.connect(groupContract).executeGroupPayout(GROUP_ID, CYCLE, user.address);
      await expect(
        treasury.connect(groupContract).executeGroupPayout(GROUP_ID, CYCLE, user.address)
      ).to.be.revertedWithCustomError(treasury, "CycleAlreadyPaidOut");
    });

    it("PAYOUT_EXECUTOR 권한 없으면 revert", async () => {
      await expect(
        treasury.connect(user).executeGroupPayout(GROUP_ID, CYCLE, user.address)
      ).to.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  그룹 환불 (refundGroupPool)
  // ════════════════════════════════════════════════════════════════════════

  describe("refundGroupPool", () => {
    const GROUP_ID = 1n;
    const CYCLE = 1n;
    const CONTRIBUTION = ethers.parseEther("100");

    beforeEach(async () => {
      await mockRegistry.setGroup(GROUP_ID, true, CONTRIBUTION, CYCLE);
      await treasury.connect(user).contributeToGroup(GROUP_ID, CYCLE);
      await treasury.connect(user2).contributeToGroup(GROUP_ID, CYCLE);
    });

    it("그룹 취소 시 납부한 멤버에게 환불", async () => {
      const beforeUser  = await usdt.balanceOf(user.address);
      const beforeUser2 = await usdt.balanceOf(user2.address);

      await treasury
        .connect(groupContract)
        .refundGroupPool(GROUP_ID, [user.address, user2.address], CYCLE);

      expect(await usdt.balanceOf(user.address)).to.equal(beforeUser + CONTRIBUTION);
      expect(await usdt.balanceOf(user2.address)).to.equal(beforeUser2 + CONTRIBUTION);
      expect(await treasury.groupPool(GROUP_ID)).to.equal(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  관리자 기능
  // ════════════════════════════════════════════════════════════════════════

  describe("Admin", () => {
    it("수수료 변경", async () => {
      await treasury.connect(admin).setFees(500, 300, 50);
      expect(await treasury.buyFeeBP()).to.equal(500);
      expect(await treasury.sellFeeBP()).to.equal(300);
      expect(await treasury.referralFeeBP()).to.equal(50);
    });

    it("최대 수수료 초과 시 revert", async () => {
      await expect(
        treasury.connect(admin).setFees(1001, 300, 50)
      ).to.be.revertedWith("Fee too high");
    });

    it("입금 한도 변경", async () => {
      await treasury.connect(admin).setDepositLimits(
        ethers.parseEther("10"),
        ethers.parseEther("50000")
      );
      expect(await treasury.minDepositAmount()).to.equal(ethers.parseEther("10"));
    });
  });
});
