# 오늘 당장 시작하기 (Quick Start)

## Step 1 — 폴더 복사
```
받은 파일들을 아래 구조로 정리:

hhfinance/
├── contracts/
│   ├── HHUSD.sol               ← 그대로
│   ├── TreasuryV2.sol          ← 그대로 (Treasury.sol은 무시)
│   ├── CollateralVault.sol     ← 그대로
│   ├── VRFPositionAssigner.sol ← 그대로
│   ├── PublicGroupVRF.sol      ← 그대로 (PublicGroup.sol은 무시)
│   └── GroupContracts.sol      ← 그대로
├── docs/                       ← 참고 문서
└── frontend/                   ← 나중에
```

## Step 2 — Hardhat 초기화
```bash
cd hhfinance
npm init -y
npm install --save-dev hardhat
npx hardhat init
# TypeScript project 선택

npm install @openzeppelin/contracts @openzeppelin/contracts-upgradeable
npm install @chainlink/contracts
npm install --save-dev @nomicfoundation/hardhat-toolbox hardhat-deploy dotenv
```

## Step 3 — 컴파일 확인
```bash
npx hardhat compile
# 에러 없으면 성공
```

## Step 4 — 다음 할 일 목록
```
[ ] GroupRegistry.sol 작성 (CURRICULUM.md Stage 5-4 참고)
[ ] MockUSDT.sol 작성 (표준 ERC20, 18 decimals)
[ ] 테스트 파일 작성 시작 (CURRICULUM.md Stage 2 참고)
[ ] VRF Testnet Subscription 생성 (https://vrf.chain.link/bsc-testnet)
```

## 막히면 참고할 링크
```
OpenZeppelin Docs     : https://docs.openzeppelin.com/contracts/5.x/
Chainlink VRF v2.5    : https://docs.chain.link/vrf/v2-5/getting-started
BSC Testnet Faucet    : https://testnet.bnbchain.org/faucet-smart
LINK Testnet Faucet   : https://faucets.chain.link/bnb-chain-testnet
VRF Subscription UI   : https://vrf.chain.link/bsc-testnet
BscScan Testnet       : https://testnet.bscscan.com
Hardhat Docs          : https://hardhat.org/docs
```
