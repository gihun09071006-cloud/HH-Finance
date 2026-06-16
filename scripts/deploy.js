/**
 * @file deploy.js
 * @notice HH Finance 전체 컨트랙트 로컬/테스트넷 배포 스크립트
 *
 * 사용법:
 *   로컬:    npx hardhat run scripts/deploy.js --network localhost
 *   Sepolia: npx hardhat run scripts/deploy.js --network sepolia
 */

const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, devWallet, eventWallet, feeReceiver] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("HH Finance 배포 시작");
  console.log("=".repeat(60));
  console.log("배포 계정    :", deployer.address);
  console.log("devWallet    :", devWallet.address);
  console.log("eventWallet  :", eventWallet.address);
  console.log("feeReceiver  :", feeReceiver.address);
  console.log("-".repeat(60));

  // ── 1. MockUSDT (로컬 전용) ────────────────────────────────────────────────
  console.log("\n[1/7] MockUSDT 배포...");
  const usdt = await ethers.deployContract("MockUSDT");
  await usdt.waitForDeployment();
  console.log("  MockUSDT :", await usdt.getAddress());

  // ── 2. HHUSD ──────────────────────────────────────────────────────────────
  console.log("[2/7] HHUSD 배포...");
  const HHUSD = await ethers.getContractFactory("HHUSD");
  const hhusd = await upgrades.deployProxy(HHUSD, [deployer.address], { kind: "uups" });
  await hhusd.waitForDeployment();
  console.log("  HHUSD    :", await hhusd.getAddress());

  // ── 3. CollateralVault ────────────────────────────────────────────────────
  console.log("[3/7] CollateralVault 배포...");
  const CollateralVault = await ethers.getContractFactory("CollateralVault");
  const vault = await upgrades.deployProxy(
    CollateralVault,
    [deployer.address, await hhusd.getAddress()],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await vault.waitForDeployment();
  console.log("  Vault    :", await vault.getAddress());

  // ── 4. GroupRegistry ──────────────────────────────────────────────────────
  console.log("[4/7] GroupRegistry 배포...");
  const GroupRegistry = await ethers.getContractFactory("GroupRegistry");
  const registry = await upgrades.deployProxy(GroupRegistry, [deployer.address], { kind: "uups" });
  await registry.waitForDeployment();
  console.log("  Registry :", await registry.getAddress());

  // ── 5. TreasuryV2 ─────────────────────────────────────────────────────────
  console.log("[5/7] TreasuryV2 배포...");
  const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
  const treasury = await upgrades.deployProxy(
    TreasuryV2,
    [
      deployer.address,
      await usdt.getAddress(),
      await hhusd.getAddress(),
      feeReceiver.address,
      await registry.getAddress(),
    ],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await treasury.waitForDeployment();
  console.log("  Treasury :", await treasury.getAddress());

  // ── 6. MockVRFAssigner (로컬 전용) ───────────────────────────────────────
  console.log("[6/7] MockVRFAssigner 배포...");
  const mockVRF = await ethers.deployContract("MockVRFAssigner");
  await mockVRF.waitForDeployment();
  console.log("  MockVRF  :", await mockVRF.getAddress());

  // ── 7. PublicGroupVRF (샘플 그룹) ────────────────────────────────────────
  console.log("[7/7] PublicGroupVRF (샘플 그룹 #1) 배포...");
  const group = await ethers.deployContract("PublicGroupVRF", [
    1n,                           // groupId
    ethers.parseEther("100"),     // contributionAmount: 100 HHUSD
    10n,                          // totalCycles: 10사이클
    7n * 24n * 3600n,             // cycleInterval: 7일
    14000n,                       // collateralBP: 140%
    await vault.getAddress(),
    await mockVRF.getAddress(),
    devWallet.address,
    eventWallet.address,
  ]);
  await group.waitForDeployment();
  console.log("  Group #1 :", await group.getAddress());

  // ── 8. AutoGroupFactory ───────────────────────────────────────────────────
  console.log("[8] AutoGroupFactory 배포...");
  const autoFactory = await ethers.deployContract("AutoGroupFactory", [
    await vault.getAddress(),
    devWallet.address,
    eventWallet.address,
    deployer.address,
  ]);
  await autoFactory.waitForDeployment();
  console.log("  AutoFactory:", await autoFactory.getAddress());

  // ── 9. CustomGroupFactory ─────────────────────────────────────────────────
  console.log("[9] CustomGroupFactory 배포...");
  const customFactory = await ethers.deployContract("CustomGroupFactory", [
    await vault.getAddress(),
    devWallet.address,
    eventWallet.address,
    deployer.address,
  ]);
  await customFactory.waitForDeployment();
  console.log("  CustomFactory:", await customFactory.getAddress());

  // ── 역할 설정 ─────────────────────────────────────────────────────────────
  console.log("\n역할(Role) 설정 중...");
  const MINTER      = await hhusd.MINTER_ROLE();
  const BURNER      = await hhusd.BURNER_ROLE();
  const GROUP_ROLE  = await vault.GROUP_ROLE();
  const REGISTRAR   = await registry.REGISTRAR_ROLE();
  const PAYOUT_ROLE = await treasury.PAYOUT_EXECUTOR_ROLE();

  await hhusd.grantRole(MINTER, await treasury.getAddress());
  await hhusd.grantRole(MINTER, await vault.getAddress());
  await hhusd.grantRole(BURNER, await treasury.getAddress());
  await hhusd.grantRole(BURNER, await vault.getAddress());
  await vault.grantRole(GROUP_ROLE, await group.getAddress());

  // Factory가 GROUP_ROLE을 그룹에 부여할 수 있게 ADMIN_ROLE 부여
  const DEFAULT_ADMIN = await vault.DEFAULT_ADMIN_ROLE();
  await vault.grantRole(DEFAULT_ADMIN, await autoFactory.getAddress());
  await vault.grantRole(DEFAULT_ADMIN, await customFactory.getAddress());
  await registry.grantRole(REGISTRAR, deployer.address);
  await treasury.grantRole(PAYOUT_ROLE, await group.getAddress());

  // GroupRegistry에 그룹 등록
  await registry.registerGroup(
    1n,
    await group.getAddress(),
    ethers.parseEther("100"),
    10n
  );
  console.log("  역할 설정 완료");

  // ── 테스트용 USDT 배포 (로컬만) ──────────────────────────────────────────
  const signers = await ethers.getSigners();
  console.log("\n테스트 계정에 MockUSDT 지급 (10명)...");
  for (const s of signers.slice(4, 14)) {
    await usdt.mint(s.address, ethers.parseEther("10000"));
  }
  console.log("  완료");

  // ── 주소 저장 ─────────────────────────────────────────────────────────────
  const addresses = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    devWallet: devWallet.address,
    eventWallet: eventWallet.address,
    feeReceiver: feeReceiver.address,
    contracts: {
      MockUSDT:           await usdt.getAddress(),
      HHUSD:              await hhusd.getAddress(),
      CollateralVault:    await vault.getAddress(),
      GroupRegistry:      await registry.getAddress(),
      TreasuryV2:         await treasury.getAddress(),
      MockVRFAssigner:    await mockVRF.getAddress(),
      PublicGroupVRF:     await group.getAddress(),
      AutoGroupFactory:   await autoFactory.getAddress(),
      CustomGroupFactory: await customFactory.getAddress(),
    },
  };

  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outFile = path.join(outDir, "localhost.json");
  fs.writeFileSync(outFile, JSON.stringify(addresses, null, 2));

  // 프론트엔드 src에도 복사
  const frontendDir = path.join(__dirname, "../frontend/src");
  if (fs.existsSync(frontendDir)) {
    fs.writeFileSync(
      path.join(frontendDir, "deployedAddresses.json"),
      JSON.stringify(addresses, null, 2)
    );
    console.log("\n프론트엔드 주소 파일 업데이트: frontend/src/deployedAddresses.json");
  }

  console.log("\n" + "=".repeat(60));
  console.log("배포 완료! 주소 저장:", outFile);
  console.log("=".repeat(60));
  console.log(JSON.stringify(addresses.contracts, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
