/**
 * @file deploy-bsc.js
 * @notice HH Finance BNB Chain (BSC) 배포 스크립트
 *
 * 사전 준비:
 *   1. .env 파일 설정
 *   2. BNB (가스비) 충분히 보유
 *   3. Chainlink VRF 구독 생성 + LINK 충전
 *      - LINK는 PegSwap으로 ERC-677로 교환 필요: https://pegswap.chain.link
 *
 * 사용법:
 *   테스트넷: npx hardhat run scripts/deploy-bsc.js --network bscTestnet
 *   메인넷:  npx hardhat run scripts/deploy-bsc.js --network bscMainnet
 *
 * .env 항목:
 *   DEPLOYER_PRIVATE_KEY = 0x...
 *   DEV_WALLET           = 0x...
 *   EVENT_WALLET         = 0x...
 *   FEE_RECEIVER         = 0x...
 *   BSC_TESTNET_RPC_URL  = https://...  (테스트넷)
 *   BSC_MAINNET_RPC_URL  = https://...  (메인넷)
 *   BSCSCAN_API_KEY      = ...
 *   VRF_SUBSCRIPTION_ID  = ...          (vrf.chain.link/bsc 에서 생성)
 */

const { ethers, upgrades, run, network: hreNetwork } = require("hardhat");
const fs   = require("fs");
const path = require("path");

// ── Chainlink VRF v2.5 BNB Chain 주소 ────────────────────────────────────────
// 최신 주소: https://docs.chain.link/vrf/v2-5/supported-networks
const VRF_CONFIG = {
  bscTestnet: {
    coordinator: "0x9C22cD2689B24c05cB84BFf34a4eb30Bb42cAA3A",
    keyHash:     "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314", // 50 gwei
    chainId:     97n,
    name:        "BSC 테스트넷",
    linkToken:   "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06",
    explorer:    "https://testnet.bscscan.com",
    vrfDashboard: "https://vrf.chain.link/bsc-testnet",
  },
  bscMainnet: {
    coordinator: "0xd691f04bc0C9a24Edb78af9754bE204f869cef3a",
    keyHash:     "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314", // 500 gwei
    chainId:     56n,
    name:        "BSC 메인넷",
    linkToken:   "0x404460C6A5EdE2D891e8297795264fDe62ADBB75",
    explorer:    "https://bscscan.com",
    vrfDashboard: "https://vrf.chain.link/bsc",
  },
};

const VERIFY_DELAY_MS = 20000;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function verifyContract(address, constructorArgs = []) {
  try {
    console.log(`  BscScan 검증 중: ${address}`);
    await run("verify:verify", { address, constructorArguments: constructorArgs });
    console.log(`  ✓ 검증 완료`);
  } catch (e) {
    if (e.message.toLowerCase().includes("already verified")) {
      console.log(`  ✓ 이미 검증됨`);
    } else {
      console.log(`  ⚠ 검증 실패: ${e.message.substring(0, 100)}`);
    }
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net        = await ethers.provider.getNetwork();
  const networkName = hreNetwork.name; // bscTestnet or bscMainnet

  const cfg = VRF_CONFIG[networkName];
  if (!cfg) {
    throw new Error(
      `지원되지 않는 네트워크: ${networkName}\n` +
      "bscTestnet 또는 bscMainnet 으로 실행하세요."
    );
  }
  if (net.chainId !== cfg.chainId) {
    throw new Error(`chainId 불일치: 기대=${cfg.chainId}, 실제=${net.chainId}`);
  }

  const devWalletAddr   = process.env.DEV_WALLET;
  const eventWalletAddr = process.env.EVENT_WALLET;
  const feeReceiverAddr = process.env.FEE_RECEIVER;
  const vrfSubId        = process.env.VRF_SUBSCRIPTION_ID || "0";

  if (!devWalletAddr || !eventWalletAddr || !feeReceiverAddr) {
    throw new Error("환경변수 필수: DEV_WALLET, EVENT_WALLET, FEE_RECEIVER");
  }

  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log(`HH Finance ${cfg.name} 배포 시작`);
  console.log("=".repeat(60));
  console.log("네트워크      :", cfg.name, `(chainId: ${net.chainId})`);
  console.log("Explorer      :", cfg.explorer);
  console.log("배포 계정     :", deployer.address);
  console.log("잔액          :", ethers.formatEther(balance), "BNB");
  console.log("devWallet     :", devWalletAddr);
  console.log("eventWallet   :", eventWalletAddr);
  console.log("feeReceiver   :", feeReceiverAddr);
  console.log("VRF SubID     :", vrfSubId);
  console.log("VRF Coord     :", cfg.coordinator);
  console.log("-".repeat(60));

  if (balance < ethers.parseEther("0.05")) {
    throw new Error(`BNB 잔액 부족: ${ethers.formatEther(balance)} BNB (최소 0.05 BNB 필요)`);
  }

  const deployed = {};

  // ── 1. MockUSDT ────────────────────────────────────────────────────────────
  console.log("\n[1/7] MockUSDT 배포...");
  const usdt = await ethers.deployContract("MockUSDT");
  await usdt.waitForDeployment();
  deployed.MockUSDT = await usdt.getAddress();
  console.log("  MockUSDT :", deployed.MockUSDT);

  // ── 2. HHUSD ──────────────────────────────────────────────────────────────
  console.log("[2/7] HHUSD 배포...");
  const HHUSD = await ethers.getContractFactory("HHUSD");
  const hhusd = await upgrades.deployProxy(HHUSD, [deployer.address], { kind: "uups" });
  await hhusd.waitForDeployment();
  deployed.HHUSD = await hhusd.getAddress();
  console.log("  HHUSD    :", deployed.HHUSD);

  // ── 3. CollateralVault ────────────────────────────────────────────────────
  console.log("[3/7] CollateralVault 배포...");
  const CollateralVault = await ethers.getContractFactory("CollateralVault");
  const vault = await upgrades.deployProxy(
    CollateralVault,
    [deployer.address, deployed.HHUSD],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await vault.waitForDeployment();
  deployed.CollateralVault = await vault.getAddress();
  console.log("  Vault    :", deployed.CollateralVault);

  // ── 4. GroupRegistry ──────────────────────────────────────────────────────
  console.log("[4/7] GroupRegistry 배포...");
  const GroupRegistry = await ethers.getContractFactory("GroupRegistry");
  const registry = await upgrades.deployProxy(GroupRegistry, [deployer.address], { kind: "uups" });
  await registry.waitForDeployment();
  deployed.GroupRegistry = await registry.getAddress();
  console.log("  Registry :", deployed.GroupRegistry);

  // ── 5. TreasuryV2 ─────────────────────────────────────────────────────────
  console.log("[5/7] TreasuryV2 배포...");
  const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
  const treasury = await upgrades.deployProxy(
    TreasuryV2,
    [
      deployer.address,
      deployed.MockUSDT,
      deployed.HHUSD,
      feeReceiverAddr,
      deployed.GroupRegistry,
    ],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await treasury.waitForDeployment();
  deployed.TreasuryV2 = await treasury.getAddress();
  console.log("  Treasury :", deployed.TreasuryV2);

  // ── 6. VRFPositionAssigner (실제 Chainlink VRF v2.5) ─────────────────────
  console.log("[6/7] VRFPositionAssigner (Chainlink VRF v2.5) 배포...");
  const VRFAssigner = await ethers.getContractFactory("VRFPositionAssigner");
  const vrfAssigner = await VRFAssigner.deploy(
    cfg.coordinator,
    BigInt(vrfSubId),
    cfg.keyHash,
    deployer.address  // admin
  );
  await vrfAssigner.waitForDeployment();
  deployed.VRFPositionAssigner = await vrfAssigner.getAddress();
  console.log("  VRFAssigner:", deployed.VRFPositionAssigner);

  // ── 7. PublicGroupVRF (샘플 그룹 #1) ────────────────────────────────────
  console.log("[7/7] PublicGroupVRF (샘플 그룹 #1) 배포...");
  const group = await ethers.deployContract("PublicGroupVRF", [
    1n,                       // groupId
    ethers.parseEther("100"), // contributionAmount: 100 HHUSD
    10n,                      // totalCycles: 10사이클
    7n * 24n * 3600n,         // cycleInterval: 7일
    14000n,                   // collateralBP: 140%
    deployed.CollateralVault,
    deployed.VRFPositionAssigner,
    devWalletAddr,
    eventWalletAddr,
  ]);
  await group.waitForDeployment();
  deployed.PublicGroupVRF = await group.getAddress();
  console.log("  Group #1 :", deployed.PublicGroupVRF);

  // ── 역할 설정 ─────────────────────────────────────────────────────────────
  console.log("\n역할(Role) 설정 중...");
  const MINTER      = await hhusd.MINTER_ROLE();
  const BURNER      = await hhusd.BURNER_ROLE();
  const GROUP_ROLE  = await vault.GROUP_ROLE();
  const VRF_GROUP   = await vrfAssigner.GROUP_ROLE();
  const REGISTRAR   = await registry.REGISTRAR_ROLE();
  const PAYOUT_ROLE = await treasury.PAYOUT_EXECUTOR_ROLE();

  console.log("  MINTER_ROLE → Treasury, Vault");
  await (await hhusd.grantRole(MINTER, deployed.TreasuryV2)).wait();
  await (await hhusd.grantRole(MINTER, deployed.CollateralVault)).wait();

  console.log("  BURNER_ROLE → Treasury, Vault");
  await (await hhusd.grantRole(BURNER, deployed.TreasuryV2)).wait();
  await (await hhusd.grantRole(BURNER, deployed.CollateralVault)).wait();

  console.log("  GROUP_ROLE (Vault) → PublicGroupVRF");
  await (await vault.grantRole(GROUP_ROLE, deployed.PublicGroupVRF)).wait();

  console.log("  GROUP_ROLE (VRFAssigner) → PublicGroupVRF");
  await (await vrfAssigner.grantRole(VRF_GROUP, deployed.PublicGroupVRF)).wait();

  console.log("  REGISTRAR_ROLE → deployer");
  await (await registry.grantRole(REGISTRAR, deployer.address)).wait();

  console.log("  PAYOUT_EXECUTOR_ROLE → PublicGroupVRF");
  await (await treasury.grantRole(PAYOUT_ROLE, deployed.PublicGroupVRF)).wait();

  console.log("  GroupRegistry.registerGroup → Group #1");
  await (await registry.registerGroup(
    1n,
    deployed.PublicGroupVRF,
    ethers.parseEther("100"),
    10n
  )).wait();

  console.log("  ✓ 역할 설정 완료");

  // ── 주소 저장 ─────────────────────────────────────────────────────────────
  const fileName = networkName === "bscMainnet" ? "bsc-mainnet.json" : "bsc-testnet.json";
  const output = {
    network: cfg.name,
    chainId: Number(net.chainId),
    deployer: deployer.address,
    devWallet: devWalletAddr,
    eventWallet: eventWalletAddr,
    feeReceiver: feeReceiverAddr,
    vrfSubscriptionId: vrfSubId,
    vrfCoordinator: cfg.coordinator,
    linkToken: cfg.linkToken,
    contracts: deployed,
  };

  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outFile = path.join(outDir, fileName);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log("\n주소 저장:", outFile);

  const frontendDir = path.join(__dirname, "../frontend/src");
  if (fs.existsSync(frontendDir)) {
    fs.writeFileSync(
      path.join(frontendDir, "deployedAddresses.json"),
      JSON.stringify(output, null, 2)
    );
    console.log("프론트엔드 주소 업데이트: frontend/src/deployedAddresses.json");
  }

  // ── BscScan 검증 ──────────────────────────────────────────────────────────
  if (process.env.BSCSCAN_API_KEY) {
    console.log(`\nBscScan 검증 대기 중 (${VERIFY_DELAY_MS / 1000}초)...`);
    await sleep(VERIFY_DELAY_MS);

    await verifyContract(deployed.MockUSDT);
    await verifyContract(deployed.VRFPositionAssigner, [
      cfg.coordinator,
      BigInt(vrfSubId),
      cfg.keyHash,
      deployer.address,
    ]);
    await verifyContract(deployed.PublicGroupVRF, [
      1n,
      ethers.parseEther("100"),
      10n,
      7n * 24n * 3600n,
      14000n,
      deployed.CollateralVault,
      deployed.VRFPositionAssigner,
      devWalletAddr,
      eventWalletAddr,
    ]);
  }

  // ── 최종 안내 ─────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log(`✅ ${cfg.name} 배포 완료!`);
  console.log("=".repeat(60));
  console.log(JSON.stringify(deployed, null, 2));

  console.log("\n📋 배포 후 체크리스트:");
  console.log(`  1. VRF 대시보드: ${cfg.vrfDashboard}`);
  console.log(`     → VRFPositionAssigner (${deployed.VRFPositionAssigner}) 를 Consumer로 추가`);
  console.log(`  2. LINK 충전 (그룹당 ~0.003 LINK, 최소 2 LINK 권장)`);
  if (networkName === "bscMainnet") {
    console.log(`  3. ⚠  BSC LINK는 ERC-677 필요: PegSwap에서 교환`);
    console.log(`     https://pegswap.chain.link`);
  }
  console.log(`  4. MetaMask에서 BNB 체인(chainId: ${cfg.chainId}) 네트워크로 전환`);
  console.log(`  5. 프론트엔드: cd frontend && npm run dev`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
