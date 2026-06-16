/**
 * BSC 테스트넷에서 MockUSDT 민팅
 * 사용법: node scripts/mintTestUSDT.js <받을주소> <금액>
 * 예시:   node scripts/mintTestUSDT.js 0x9DC0...87Bc2 10000
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const to     = process.argv[2];
  const amount = process.argv[3] || "10000";

  if (!to) {
    console.error("사용법: node scripts/mintTestUSDT.js <받을주소> <금액>");
    process.exit(1);
  }

  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    console.error("DEPLOYER_PRIVATE_KEY 환경변수가 없습니다.");
    process.exit(1);
  }

  // deployedAddresses에서 MockUSDT 주소 읽기
  const addrs = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../frontend/src/deployedAddresses.json"), "utf8")
  );
  const usdtAddr = addrs.contracts.MockUSDT;
  console.log("MockUSDT:", usdtAddr);
  console.log("받을 주소:", to);
  console.log("금액:", amount, "USDT");

  const provider = new ethers.JsonRpcProvider(
    process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
    { chainId: 97, name: "bnbt" },
    { staticNetwork: true }
  );

  const signer = new ethers.Wallet(key, provider);
  console.log("배포자:", signer.address);

  const usdt = new ethers.Contract(
    usdtAddr,
    ["function mint(address to, uint256 amount) external"],
    signer
  );

  console.log("트랜잭션 전송 중...");
  const tx = await usdt.mint(to, ethers.parseEther(amount));
  console.log("TX Hash:", tx.hash);
  await tx.wait();
  console.log("✅ 완료! MockUSDT", amount, "개 민팅됨");
}

main().catch(e => {
  console.error(e.shortMessage || e.message);
  process.exit(1);
});
