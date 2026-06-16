/**
 * @file deployBSCTestnet.js
 * @notice HH Finance BSC 테스트넷 배포 스크립트
 *
 * 사용법:
 *   npx hardhat run scripts/deployBSCTestnet.js --network bscTestnet
 *
 * 필요 환경변수 (.env):
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   DEV_WALLET=0x...        (없으면 deployer 주소 사용)
 *   EVENT_WALLET=0x...      (없으면 deployer 주소 사용)
 *   FEE_RECEIVER=0x...      (없으면 deployer 주소 사용)
 *   BSCSCAN_API_KEY=...     (컨트랙트 검증용)
 */

const { ethers, upgrades, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  // BSC 테스트넷에서는 signer 1개 → 환경변수에서 지갑 주소 읽기
  const devWalletAddr    = process.env.DEV_WALLET    || deployer.address;
  const eventWalletAddr  = process.env.EVENT_WALLET  || deployer.address;
  const feeReceiverAddr  = process.env.FEE_RECEIVER  || deployer.address;

  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log("HH Finance BSC 테스트넷 배포");
  console.log("=".repeat(60));
  console.log("네트워크     :", network.name);
  console.log("배포 계정    :", deployer.address);
  console.log("잔액         :", ethers.formatEther(balance), "BNB");
  console.log("devWallet    :", devWalletAddr);
  console.log("eventWallet  :", eventWalletAddr);
  console.log("feeReceiver  :", feeReceiverAddr);
  console.log("-".repeat(60));

  if (balance < ethers.parseEther("0.1")) {
    console.warn("⚠  BNB 잔액 부족! BSC 테스트넷 Faucet에서 충전하세요.");
    console.warn("   https://testnet.binance.org/faucet-smart");
    process.exit(1);
  }

  // ── 1. MockUSDT ───────────────────────────────────────────────────────────
  console.log("\n[1/9] MockUSDT 배포...");
  const usdt = await ethers.deployContract("MockUSDT");
  await usdt.waitForDeployment();
  console.log("  ✓ MockUSDT :", await usdt.getAddress());

  // ── 2. HHUSD (UUPS proxy) ─────────────────────────────────────────────────
  console.log("[2/9] HHUSD 배포...");
  const HHUSD = await ethers.getContractFactory("HHUSD");
  const hhusd = await upgrades.deployProxy(HHUSD, [deployer.address], { kind: "uups" });
  await hhusd.waitForDeployment();
  console.log("  ✓ HHUSD    :", await hhusd.getAddress());

  // ── 3. CollateralVault (UUPS proxy) ──────────────────────────────────────
  console.log("[3/9] CollateralVault 배포...");
  const CollateralVault = await ethers.getContractFactory("CollateralVault");
  const vault = await upgrades.deployProxy(
    CollateralVault,
    [deployer.address, await hhusd.getAddress()],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await vault.waitForDeployment();
  console.log("  ✓ Vault    :", await vault.getAddress());

  // ── 4. GroupRegistry (UUPS proxy) ────────────────────────────────────────
  console.log("[4/9] GroupRegistry 배포...");
  const GroupRegistry = await ethers.getContractFactory("GroupRegistry");
  const registry = await upgrades.deployProxy(GroupRegistry, [deployer.address], { kind: "uups" });
  await registry.waitForDeployment();
  console.log("  ✓ Registry :", await registry.getAddress());

  // ── 5. TreasuryV2 (UUPS proxy) ───────────────────────────────────────────
  console.log("[5/9] TreasuryV2 배포...");
  const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
  const treasury = await upgrades.deployProxy(
    TreasuryV2,
    [
      deployer.address,
      await usdt.getAddress(),
      await hhusd.getAddress(),
      feeReceiverAddr,
      await registry.getAddress(),
    ],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await treasury.waitForDeployment();
  console.log("  ✓ Treasury :", await treasury.getAddress());

  // ── 6. MockVRFAssigner ───────────────────────────────────────────────────
  console.log("[6/9] MockVRFAssigner 배포...");
  const mockVRF = await ethers.deployContract("MockVRFAssigner");
  await mockVRF.waitForDeployment();
  console.log("  ✓ MockVRF  :", await mockVRF.getAddress());

  // ── 7. PublicGroupVRF (샘플 그룹) ────────────────────────────────────────
  console.log("[7/9] PublicGroupVRF 배포...");
  const group = await ethers.deployContract("PublicGroupVRF", [
    1n,
    ethers.parseEther("100"),
    10n,
    7n * 24n * 3600n,
    14000n,
    await vault.getAddress(),
    await mockVRF.getAddress(),
    devWalletAddr,
    eventWalletAddr,
  ]);
  await group.waitForDeployment();
  console.log("  ✓ Group #1 :", await group.getAddress());

  // ── 8. AutoGroupFactory ───────────────────────────────────────────────────
  console.log("[8/9] AutoGroupFactory 배포...");
  const autoFactory = await ethers.deployContract("AutoGroupFactory", [
    await vault.getAddress(),
    await hhusd.getAddress(),
    devWalletAddr,
    eventWalletAddr,
    deployer.address,
  ]);
  await autoFactory.waitForDeployment();
  console.log("  ✓ AutoFactory :", await autoFactory.getAddress());

  // ── 9. CustomGroupFactory ─────────────────────────────────────────────────
  console.log("[9/9] CustomGroupFactory 배포...");
  const customFactory = await ethers.deployContract("CustomGroupFactory", [
    await vault.getAddress(),
    await hhusd.getAddress(),
    devWalletAddr,
    eventWalletAddr,
    deployer.address,
  ]);
  await customFactory.waitForDeployment();
  console.log("  ✓ CustomFactory :", await customFactory.getAddress());

  // ── 역할 설정 ─────────────────────────────────────────────────────────────
  console.log("\n역할(Role) 설정 중...");
  const MINTER      = await hhusd.MINTER_ROLE();
  const BURNER      = await hhusd.BURNER_ROLE();
  const GROUP_ROLE  = await vault.GROUP_ROLE();
  const REGISTRAR   = await registry.REGISTRAR_ROLE();
  const PAYOUT_ROLE = await treasury.PAYOUT_EXECUTOR_ROLE();
  const DEFAULT_ADMIN = await vault.DEFAULT_ADMIN_ROLE();

  const HHUSD_ADMIN = await hhusd.DEFAULT_ADMIN_ROLE();
  await (await hhusd.grantRole(MINTER, await treasury.getAddress())).wait();
  await (await hhusd.grantRole(MINTER, await vault.getAddress())).wait();
  await (await hhusd.grantRole(BURNER, await treasury.getAddress())).wait();
  await (await hhusd.grantRole(BURNER, await vault.getAddress())).wait();
  await (await vault.grantRole(GROUP_ROLE, await group.getAddress())).wait();
  await (await vault.grantRole(DEFAULT_ADMIN, await autoFactory.getAddress())).wait();
  await (await vault.grantRole(DEFAULT_ADMIN, await customFactory.getAddress())).wait();
  // factories가 새 그룹 컨트랙트에 MINTER/BURNER를 부여할 수 있도록 HHUSD admin 권한 부여
  await (await hhusd.grantRole(HHUSD_ADMIN, await autoFactory.getAddress())).wait();
  await (await hhusd.grantRole(HHUSD_ADMIN, await customFactory.getAddress())).wait();
  await (await registry.grantRole(REGISTRAR, deployer.address)).wait();
  await (await treasury.grantRole(PAYOUT_ROLE, await group.getAddress())).wait();
  await (await registry.registerGroup(1n, await group.getAddress(), ethers.parseEther("100"), 10n)).wait();
  console.log("  ✓ 역할 설정 완료");

  // ── 주소 저장 ─────────────────────────────────────────────────────────────
  const chainInfo = await ethers.provider.getNetwork();
  const addresses = {
    network:     network.name,
    chainId:     Number(chainInfo.chainId),
    deployer:    deployer.address,
    devWallet:   devWalletAddr,
    eventWallet: eventWalletAddr,
    feeReceiver: feeReceiverAddr,
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
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(addresses, null, 2));

  // 프론트엔드 복사
  const frontendFile = path.join(__dirname, "../frontend/src/deployedAddresses.json");
  fs.writeFileSync(frontendFile, JSON.stringify(addresses, null, 2));
  console.log("  ✓ 프론트엔드 주소 파일 업데이트");

  console.log("\n" + "=".repeat(60));
  console.log("✅ 배포 완료! 주소 저장:", outFile);
  console.log("=".repeat(60));
  console.log(JSON.stringify(addresses.contracts, null, 2));

  // ── 컨트랙트 검증 안내 ────────────────────────────────────────────────────
  console.log("\n📋 BscScan 검증 커맨드 (BSCSCAN_API_KEY 필요):");
  console.log(`npx hardhat verify --network bscTestnet ${await usdt.getAddress()}`);
  console.log(`npx hardhat verify --network bscTestnet ${await mockVRF.getAddress()}`);
  console.log(`npx hardhat verify --network bscTestnet ${await autoFactory.getAddress()} "${await vault.getAddress()}" "${devWalletAddr}" "${eventWalletAddr}" "${deployer.address}"`);
  console.log(`npx hardhat verify --network bscTestnet ${await customFactory.getAddress()} "${await vault.getAddress()}" "${devWalletAddr}" "${eventWalletAddr}" "${deployer.address}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
