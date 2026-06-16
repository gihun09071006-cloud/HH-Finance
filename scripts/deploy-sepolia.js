/**
 * @file deploy-sepolia.js
 * @notice HH Finance Sepolia 테스트넷 배포 스크립트
 *
 * 사전 준비:
 *   1. .env 파일 설정 (아래 항목 필수)
 *   2. Sepolia ETH 충분히 보유 (deployer 지갑)
 *   3. Chainlink VRF v2.5 구독 생성 후 LINK 충전
 *
 * 사용법:
 *   npx hardhat run scripts/deploy-sepolia.js --network sepolia
 *
 * .env 항목:
 *   DEPLOYER_PRIVATE_KEY   = 0x...  (배포 지갑 pk)
 *   DEV_WALLET             = 0x...  (devWallet 주소)
 *   EVENT_WALLET           = 0x...  (eventWallet 주소)
 *   FEE_RECEIVER           = 0x...  (수수료 수령 주소)
 *   SEPOLIA_RPC_URL        = https://...
 *   ETHERSCAN_API_KEY      = ...    (컨트랙트 검증용)
 *
 * Chainlink Sepolia 주소:
 *   USDT 대신 Sepolia 실제 LINK 또는 MockUSDT 사용
 *   VRF Coordinator: 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B (Sepolia)
 *   LINK Token:      0x779877A7B0D9E8603169DdbD7836e478b4624789 (Sepolia)
 */

const { ethers, upgrades, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ── Chainlink VRF v2.5 Sepolia 설정 ──────────────────────────────────────────
const VRF_COORDINATOR_SEPOLIA = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";
const KEY_HASH_SEPOLIA        = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae"; // 500 gwei
// VRF Subscription ID: 배포 전 https://vrf.chain.link/sepolia 에서 생성
const VRF_SUBSCRIPTION_ID     = process.env.VRF_SUBSCRIPTION_ID || "0";

// 검증 대기 시간 (블록 확인 시간)
const VERIFY_DELAY_MS = 30000;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function verifyContract(address, constructorArgs = []) {
  try {
    console.log(`  Etherscan 검증 중: ${address}`);
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`  ✓ 검증 완료`);
  } catch (e) {
    if (e.message.includes("Already Verified")) {
      console.log(`  ✓ 이미 검증됨`);
    } else {
      console.log(`  ⚠ 검증 실패: ${e.message.substring(0, 80)}`);
    }
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  // 환경 변수에서 지갑 주소 가져오기
  const devWalletAddr   = process.env.DEV_WALLET;
  const eventWalletAddr = process.env.EVENT_WALLET;
  const feeReceiverAddr = process.env.FEE_RECEIVER;

  if (!devWalletAddr || !eventWalletAddr || !feeReceiverAddr) {
    throw new Error(
      "환경변수 필수: DEV_WALLET, EVENT_WALLET, FEE_RECEIVER\n" +
      ".env 파일을 확인하세요."
    );
  }

  console.log("=".repeat(60));
  console.log("HH Finance Sepolia 배포 시작");
  console.log("=".repeat(60));
  console.log("네트워크      :", network.name, `(chainId: ${network.chainId})`);
  console.log("배포 계정     :", deployer.address);
  console.log("잔액          :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("devWallet     :", devWalletAddr);
  console.log("eventWallet   :", eventWalletAddr);
  console.log("feeReceiver   :", feeReceiverAddr);
  console.log("VRF SubID     :", VRF_SUBSCRIPTION_ID);
  console.log("-".repeat(60));

  if (network.chainId !== 11155111n) {
    throw new Error(`Sepolia 체인 아님 (chainId: ${network.chainId}). --network sepolia 옵션 확인`);
  }

  const deployed = {};

  // ── 1. MockUSDT ────────────────────────────────────────────────────────────
  // Sepolia에서도 MockUSDT 사용 (실제 USDC/USDT 대신 테스트용)
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

  // ── 6. VRFPositionAssigner (실제 Chainlink VRF) ───────────────────────────
  console.log("[6/7] VRFPositionAssigner (Chainlink VRF v2.5) 배포...");
  const VRFAssigner = await ethers.getContractFactory("VRFPositionAssigner");
  const vrfAssigner = await VRFAssigner.deploy(
    VRF_COORDINATOR_SEPOLIA,
    BigInt(VRF_SUBSCRIPTION_ID),
    KEY_HASH_SEPOLIA
  );
  await vrfAssigner.waitForDeployment();
  deployed.VRFPositionAssigner = await vrfAssigner.getAddress();
  console.log("  VRFAssigner:", deployed.VRFPositionAssigner);
  console.log("  ⚠  VRF 구독에 이 주소를 consumer로 추가하세요:");
  console.log("     https://vrf.chain.link/sepolia →", deployed.VRFPositionAssigner);

  // ── 7. PublicGroupVRF (샘플 그룹 #1) ────────────────────────────────────
  console.log("[7/7] PublicGroupVRF (샘플 그룹 #1) 배포...");
  const group = await ethers.deployContract("PublicGroupVRF", [
    1n,                           // groupId
    ethers.parseEther("100"),     // contributionAmount: 100 HHUSD
    10n,                          // totalCycles: 10사이클
    7n * 24n * 3600n,             // cycleInterval: 7일 (테스트 단축 원하면 변경)
    14000n,                       // collateralBP: 140%
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
  const REGISTRAR   = await registry.REGISTRAR_ROLE();
  const PAYOUT_ROLE = await treasury.PAYOUT_EXECUTOR_ROLE();

  console.log("  MINTER_ROLE → Treasury, Vault");
  await (await hhusd.grantRole(MINTER, deployed.TreasuryV2)).wait();
  await (await hhusd.grantRole(MINTER, deployed.CollateralVault)).wait();

  console.log("  BURNER_ROLE → Treasury, Vault");
  await (await hhusd.grantRole(BURNER, deployed.TreasuryV2)).wait();
  await (await hhusd.grantRole(BURNER, deployed.CollateralVault)).wait();

  console.log("  GROUP_ROLE → PublicGroupVRF");
  await (await vault.grantRole(GROUP_ROLE, deployed.PublicGroupVRF)).wait();

  console.log("  REGISTRAR_ROLE → deployer");
  await (await registry.grantRole(REGISTRAR, deployer.address)).wait();

  console.log("  PAYOUT_EXECUTOR_ROLE → PublicGroupVRF");
  await (await treasury.grantRole(PAYOUT_ROLE, deployed.PublicGroupVRF)).wait();

  // VRFAssigner에 그룹 등록
  console.log("  VRFAssigner.setGroupContract → PublicGroupVRF");

  // GroupRegistry에 그룹 등록
  console.log("  GroupRegistry.registerGroup → Group #1");
  await (await registry.registerGroup(
    1n,
    deployed.PublicGroupVRF,
    ethers.parseEther("100"),
    10n
  )).wait();

  console.log("  ✓ 역할 설정 완료");

  // ── 주소 저장 ─────────────────────────────────────────────────────────────
  const output = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    devWallet: devWalletAddr,
    eventWallet: eventWalletAddr,
    feeReceiver: feeReceiverAddr,
    vrfSubscriptionId: VRF_SUBSCRIPTION_ID,
    contracts: deployed,
  };

  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outFile = path.join(outDir, "sepolia.json");
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log("\n주소 저장:", outFile);

  // 프론트엔드 src에도 복사
  const frontendDir = path.join(__dirname, "../frontend/src");
  if (fs.existsSync(frontendDir)) {
    fs.writeFileSync(
      path.join(frontendDir, "deployedAddresses.json"),
      JSON.stringify(output, null, 2)
    );
    console.log("프론트엔드 주소 파일 업데이트: frontend/src/deployedAddresses.json");
  }

  // ── Etherscan 검증 ────────────────────────────────────────────────────────
  if (process.env.ETHERSCAN_API_KEY) {
    console.log(`\nEtherscan 검증 대기 중 (${VERIFY_DELAY_MS / 1000}초)...`);
    await sleep(VERIFY_DELAY_MS);

    await verifyContract(deployed.MockUSDT);
    await verifyContract(deployed.VRFPositionAssigner, [
      VRF_COORDINATOR_SEPOLIA,
      BigInt(VRF_SUBSCRIPTION_ID),
      KEY_HASH_SEPOLIA,
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
    // UUPS 프록시는 implementation 주소로 검증
    console.log("\n  UUPS 프록시 컨트랙트들은 Etherscan에서 프록시 자동 감지됩니다.");
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Sepolia 배포 완료!");
  console.log("=".repeat(60));
  console.log(JSON.stringify(deployed, null, 2));

  console.log("\n📋 배포 후 체크리스트:");
  console.log("  1. VRF 구독에 VRFPositionAssigner 주소를 Consumer로 추가");
  console.log("     https://vrf.chain.link/sepolia");
  console.log("  2. VRF 구독에 LINK 충전 (그룹당 최소 2~5 LINK 권장)");
  console.log("  3. MetaMask에서 Sepolia 네트워크(chainId 11155111)로 전환");
  console.log("  4. 프론트엔드 실행: cd frontend && npm run dev");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
