require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@openzeppelin/hardhat-upgrades");
require("solidity-coverage");
require("@nomicfoundation/hardhat-verify");

// dotenv@17 = dotenvx (암호화 이슈) → PowerShell 환경변수 직접 사용
try {
  require("dotenv").config({ processEnv: {} }); // env 파일 읽되 process.env는 덮어쓰지 않음
} catch (e) {}

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const accounts     = DEPLOYER_KEY ? [DEPLOYER_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },

  networks: {
    // ── 로컬 ──────────────────────────────────────────────────────────────
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },

    // ── BNB 테스트넷 ───────────────────────────────────────────────────────
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL ||
           "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts,
      gasPrice: 10_000_000_000,  // 10 gwei
    },

    // ── BNB 메인넷 ────────────────────────────────────────────────────────
    bscMainnet: {
      url: process.env.BSC_MAINNET_RPC_URL ||
           "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts,
      gasPrice: 3_000_000_000,   // 3 gwei
    },

    // ── Sepolia (보조) ────────────────────────────────────────────────────
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts,
      gasPrice: "auto",
    },
  },

  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
      bsc:        process.env.BSCSCAN_API_KEY || "",
      sepolia:    process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL:     "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
  mocha: { timeout: 60000 },
  sourcify: { enabled: false },
};
