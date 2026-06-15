# HH Finance 개발 커리큘럼
> 총 8개 스테이지 | 예상 기간: 12~16주

---

## 전체 로드맵 한눈에 보기

```
STAGE 1  │ 환경 세팅          │ 1주  │ Hardhat + OpenZeppelin + Chainlink
STAGE 2  │ 기반 컨트랙트      │ 2주  │ HHUSD + TreasuryV2 + CollateralVault
STAGE 3  │ VRF 통합          │ 1주  │ VRFPositionAssigner + 로컬 목업 테스트
STAGE 4  │ 그룹 시스템        │ 3주  │ PublicGroupVRF + Factory + PrivateGroup
STAGE 5  │ 통합 테스트        │ 2주  │ Foundry Fuzz + 시나리오 테스트
STAGE 6  │ 프론트엔드         │ 2주  │ React 대시보드 + ethers.js 연동
STAGE 7  │ 테스트넷 배포      │ 1주  │ BSC Testnet 전체 E2E
STAGE 8  │ 감사 + 메인넷      │ 2~4주│ 외부 감사 → 메인넷 배포
```

---

## STAGE 1 — 개발 환경 세팅
**목표:** 로컬에서 컨트랙트 컴파일·테스트가 돌아가는 환경 구성

### 설치 목록
```bash
# Node.js 20+ 필요
node -v

# Hardhat 프로젝트 초기화
mkdir hhfinance && cd hhfinance
npm init -y
npm install --save-dev hardhat
npx hardhat init  # "Create a TypeScript project" 선택

# OpenZeppelin (UUPS, AccessControl, ReentrancyGuard 등)
npm install @openzeppelin/contracts @openzeppelin/contracts-upgradeable

# Chainlink VRF v2.5
npm install @chainlink/contracts

# 테스트 유틸
npm install --save-dev @nomicfoundation/hardhat-toolbox
npm install --save-dev hardhat-deploy
npm install --save-dev dotenv

# Foundry (병행 사용 권장 — fuzz 테스트용)
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### hardhat.config.ts 핵심 설정
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: [process.env.PRIVATE_KEY!]
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: [process.env.PRIVATE_KEY!]
    }
  },
  etherscan: {
    apiKey: { bscTestnet: process.env.BSCSCAN_API_KEY! }
  }
};
export default config;
```

### .env 파일
```
PRIVATE_KEY=0x...
BSCSCAN_API_KEY=...
VRF_SUBSCRIPTION_ID=...
```

### 폴더 구조 (Hardhat 기준)
```
hhfinance/
├── contracts/
│   ├── HHUSD.sol
│   ├── TreasuryV2.sol
│   ├── CollateralVault.sol
│   ├── VRFPositionAssigner.sol
│   ├── PublicGroupVRF.sol
│   ├── GroupContracts.sol
│   └── mocks/
│       ├── MockVRFCoordinatorV2_5.sol   ← 로컬 VRF 테스트용
│       └── MockUSDT.sol
├── test/
│   ├── unit/
│   │   ├── HHUSD.test.ts
│   │   ├── Treasury.test.ts
│   │   ├── CollateralVault.test.ts
│   │   └── PublicGroupVRF.test.ts
│   └── integration/
│       └── FullGroupLifecycle.test.ts
├── deploy/
│   ├── 01_deploy_hhusd.ts
│   ├── 02_deploy_treasury.ts
│   ├── 03_deploy_vault.ts
│   ├── 04_deploy_vrf.ts
│   └── 05_deploy_factories.ts
├── scripts/
│   └── setup-roles.ts
└── hardhat.config.ts
```

### 체크리스트
- [ ] `npx hardhat compile` 에러 없이 통과
- [ ] `npx hardhat test` 샘플 테스트 통과
- [ ] BSC Testnet RPC 연결 확인
- [ ] BscScan API Key 발급 완료

---

## STAGE 2 — 기반 컨트랙트 구현 및 테스트
**목표:** HHUSD, TreasuryV2, CollateralVault 단위 테스트 100% 통과

### 2-1. HHUSD.sol 테스트 시나리오
```typescript
// test/unit/HHUSD.test.ts

describe("HHUSD", () => {
  it("mint: MINTER_ROLE만 가능")
  it("burn: BURNER_ROLE만 가능")
  it("transfer: 항상 revert")
  it("transferFrom: 항상 revert")
  it("approve: 항상 revert")
  it("allowance: 항상 0 반환")
  it("upgrade: UPGRADER_ROLE만 가능")
  it("initialize: 두 번 호출 불가")
})
```

### 2-2. TreasuryV2.sol 테스트 시나리오
```typescript
describe("TreasuryV2", () => {
  describe("depositUSDT", () => {
    it("정상 입금: HHUSD 순액 발행 확인")
    it("수수료 2.5% 정확히 차감")
    it("추천인 있을 때 1% 추가 분배")
    it("최소 금액 미달: revert")
    it("최대 금액 초과: revert")
    it("paused 상태: revert")
  })
  describe("redeemHHUSD", () => {
    it("정상 환급: 수수료 2.5% 차감 후 USDT 반환")
    it("잔액 부족: revert")
    it("paused 상태에서도 가능 (사용자 자금 보호)")
  })
  describe("setReferrer", () => {
    it("정상 등록")
    it("자기 자신 추천: revert")
    it("중복 등록: revert")
  })
  describe("contributeToGroup", () => {
    it("정상 기여: groupPool 증가 확인")
    it("같은 사이클 이중 납부: revert")
    it("잘못된 금액: revert")
    it("비활성 그룹: revert")
  })
  describe("executeGroupPayout", () => {
    it("정상 지급: 수령인에게 USDT 전송")
    it("이중 지급 방지: revert")
    it("빈 풀: revert")
    it("PAYOUT_EXECUTOR_ROLE 없는 호출: revert")
  })
})
```

### 2-3. CollateralVault.sol 테스트 시나리오
```typescript
describe("CollateralVault", () => {
  it("lockCollateral: HHUSD 잔액 부족 시 revert")
  it("lockCollateral: 그룹별 담보 정확히 기록")
  it("unlockCollateral: 정상 언락")
  it("slashCollateral: burn 또는 recipient 전송")
  it("getRequiredCollateral: 공식 검증 (contribution × cycles × ratioBP / 10000)")
  it("GROUP_ROLE 없는 호출: 전부 revert")
})
```

### 주의사항
```
TreasuryV2 테스트 전제조건:
  - MockUSDT 배포 (18 decimals)
  - MockGroupRegistry 배포
  - HHUSD에 TreasuryV2를 MINTER_ROLE + BURNER_ROLE 부여
  - TreasuryV2에 GroupRegistry 설정
```

---

## STAGE 3 — Chainlink VRF 통합
**목표:** 로컬에서 VRF 목업으로 포지션 배정 전 과정 테스트

### 3-1. MockVRFCoordinatorV2_5 준비
```solidity
// contracts/mocks/MockVRFCoordinatorV2_5.sol
// Chainlink 제공 테스트 목업 사용:
// @chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol

import {VRFCoordinatorV2_5Mock}
  from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
```

### 3-2. VRF 테스트 흐름
```typescript
// test/unit/VRF.test.ts

describe("VRFPositionAssigner", () => {
  let mockCoordinator: VRFCoordinatorV2_5Mock;
  let vrfAssigner: VRFPositionAssigner;
  let group: PublicGroupVRF;

  beforeEach(async () => {
    // 1. Mock Coordinator 배포
    mockCoordinator = await deployMockCoordinator();

    // 2. Subscription 생성
    const subId = await mockCoordinator.createSubscription();
    await mockCoordinator.fundSubscription(subId, LINK_AMOUNT);

    // 3. VRFPositionAssigner 배포
    vrfAssigner = await deploy("VRFPositionAssigner", [
      mockCoordinator.address, subId, KEY_HASH, admin
    ]);

    // 4. Consumer 등록
    await mockCoordinator.addConsumer(subId, vrfAssigner.address);
  });

  it("포지션 랜덤 배정: Fisher-Yates 검증", async () => {
    // finalizePositions() 호출 → VRF Request 발생
    await group.finalizePositions();

    // Mock Coordinator가 fulfillRandomWords 시뮬레이션
    const requestId = await vrfAssigner.pendingRequest(group.address);
    await mockCoordinator.fulfillRandomWords(requestId, vrfAssigner.address);

    // 모든 멤버에 유일한 포지션 배정 확인
    const positions = new Set();
    for (const member of members) {
      const m = await group.getMember(member);
      expect(m.position).to.be.gt(0);
      expect(positions.has(m.position)).to.be.false;
      positions.add(m.position);
    }
  });

  it("비승인 그룹: requestRandomness revert")
  it("중복 요청: revert")
  it("VRF 타임아웃 후 retryVRFRequest 가능")
  it("콜백 실패 시 VRFPositionAssigner 브릭 안됨")
})
```

### 3-3. 랜덤 분포 검증 (통계 테스트)
```typescript
it("1000회 시뮬레이션: 포지션 분포 균등성 검증", async () => {
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 1000; i++) {
    // 다른 seed로 배정
    const seed = ethers.utils.randomBytes(32);
    // 첫 번째 멤버가 특정 포지션 받는 빈도 기록
    counts[assignedPosition - 1]++;
  }
  // 각 포지션이 약 100±30회 (±3σ 이내) 나와야 함
  counts.forEach(c => expect(c).to.be.within(70, 130));
});
```

---

## STAGE 4 — 그룹 시스템 구현 및 테스트
**목표:** 그룹 전체 수명주기(ENROLLING → COMPLETED) 시나리오 검증

### 4-1. 전체 수명주기 시나리오
```typescript
// test/integration/FullGroupLifecycle.test.ts

describe("PublicGroupVRF 전체 수명주기", () => {

  it("시나리오 A: 정상 완주", async () => {
    // 1. Factory로 그룹 생성
    // 2. 10~20명 가입 (joinGroup)
    // 3. 24시간 후 closeEnrollment
    // 4. 포지션 선택 기간 (일부 직접 선택)
    // 5. finalizePositions → VRF 요청
    // 6. fulfillRandomWords → 포지션 배정
    // 7. 10사이클 × 기여 + 지급 반복
    // 8. completeGroup → 담보 전액 반환
  })

  it("시나리오 B: 멤버 미납 처리", async () => {
    // 1차 미납 → Warning
    // 2차 미납 → 담보 일부 슬래시
    // 3차 미납 → 제거 + 담보 전량 소각
  })

  it("시나리오 C: 멤버 수 부족으로 그룹 취소", async () => {
    // 9명만 가입 → closeEnrollment → CANCELLED
    // 모든 멤버 담보 전액 환급 확인
  })

  it("시나리오 D: VRF 타임아웃 후 재시도", async () => {
    // finalizePositions → VRF 요청
    // 1시간 대기 시뮬레이션 (evm_increaseTime)
    // retryVRFRequest → 새 requestId 발급
    // fulfillRandomWords → 정상 배정
  })

  it("시나리오 E: 프라이빗 그룹 초대 코드", async () => {
    // createPrivateGroup
    // generateInviteCode
    // 초대 코드로 joinGroup
    // 초대 코드 재사용 revert 확인
    // owner assignPosition + startGroup
  })
})
```

### 4-2. 가스 측정
```typescript
it("가스 측정", async () => {
  const joinGas       = await group.estimateGas.joinGroup();
  const finalizeGas   = await group.estimateGas.finalizePositions();
  const contributeGas = await group.estimateGas.contribute();
  const payoutGas     = await group.estimateGas.distributePayout();

  // 각각 300,000 gas 이하여야 함
  console.log({ joinGas, finalizeGas, contributeGas, payoutGas });
});
```

---

## STAGE 5 — 보안 강화 및 Fuzz 테스트
**목표:** Slither 정적 분석 통과 + Foundry fuzz 취약점 0개

### 5-1. Slither 실행
```bash
pip install slither-analyzer
slither contracts/ --exclude-dependencies
# 결과에서 high/medium severity 항목 전부 해소
```

### 5-2. Foundry Fuzz 테스트
```solidity
// test/fuzz/Treasury.fuzz.t.sol

contract TreasuryFuzzTest is Test {
    function testFuzz_deposit(uint256 amount) public {
        // bound: minDeposit ~ maxDeposit
        amount = bound(amount, 1e18, 100_000e18);
        treasury.depositUSDT(amount);

        // 불변량: HHUSD 발행량 <= 입금액
        assertLe(hhusd.balanceOf(user), amount);
        // 불변량: Treasury USDT 잔액 = 이전 잔액 + amount - fees
    }

    function testFuzz_redeemNeverExceedsDeposit(uint256 deposit, uint256 redeem) public {
        deposit = bound(deposit, 1e18, 100_000e18);
        redeem  = bound(redeem, 1, deposit);
        // USDT 환급량이 HHUSD 소각량보다 크면 안 됨
    }

    function testFuzz_collateralRatio(uint256 contribution, uint256 cycles, uint256 ratio) public {
        ratio = bound(ratio, 5000, 20000); // 50% ~ 200%
        uint256 required = vault.getRequiredCollateral(contribution, cycles, ratio);
        assertGe(required, contribution); // 담보 >= 1사이클 기여금
    }
}
```

### 5-3. 감사 체크리스트 수동 점검
```
docs/02_audit_checklist.md의 항목들을 순서대로 체크
특히 🔴 High 항목:
  [ ] Chainlink VRF 적용 완료 (pseudo-random 제거)
  [ ] HHUSD 기여금 방식 → TreasuryV2 Pool 방식으로 최종 확정
  [ ] 제거된 멤버가 수령 포지션인 경우 처리 로직
  [ ] PrivateGroup ReentrancyGuard 추가
  [ ] Timelock 컨트랙트 연동
```

### 5-4. GroupRegistry 구현 (누락된 컨트랙트)
```solidity
// 별도 구현 필요:
contract GroupRegistry {
    mapping(uint256 => address) public groupContracts;
    mapping(uint256 => bool)    public activeGroups;
    mapping(uint256 => uint256) public contributionAmounts;

    function registerGroup(uint256 groupId, address groupContract, uint256 contribution) external;
    function setActive(uint256 groupId, bool active) external;
    function isActiveGroup(uint256 groupId) external view returns (bool);
    function getContributionAmount(uint256 groupId) external view returns (uint256);
    function getCurrentCycle(uint256 groupId) external view returns (uint256);
}
```

---

## STAGE 6 — 프론트엔드 개발
**목표:** 실제 컨트랙트와 연동된 풀스택 대시보드

### 6-1. 기술 스택
```
React + TypeScript
ethers.js v6
wagmi v2 (지갑 연결)
viem
TailwindCSS
react-query (상태 관리)
```

### 6-2. 설치
```bash
# React 앱 생성
npm create vite@latest hhfinance-app -- --template react-ts
cd hhfinance-app

# 의존성
npm install ethers wagmi viem @tanstack/react-query
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 6-3. ABI 추출 및 연동
```bash
# Hardhat 컴파일 후 ABI 추출
npx hardhat compile

# artifacts에서 ABI 복사
cp artifacts/contracts/TreasuryV2.sol/TreasuryV2.json src/abis/
cp artifacts/contracts/HHUSD.sol/HHUSD.json src/abis/
cp artifacts/contracts/PublicGroupVRF.sol/PublicGroupVRF.json src/abis/
```

### 6-4. 구현할 페이지/기능
```
HHFinanceDashboard.jsx (제공된 파일 베이스)

추가 구현 필요:
  ├── WalletConnect 버튼 (wagmi useConnect)
  ├── USDT approve + depositUSDT 실제 트랜잭션
  ├── redeemHHUSD 실제 트랜잭션
  ├── joinGroup: CollateralVault approve + joinGroup 호출
  ├── selectPosition: 12시간 타이머 + 버튼 UI
  ├── contribute: 매 사이클 USDT approve + contributeToGroup
  ├── 포지션 배정 대기 화면 (PENDING_VRF 상태)
  ├── 그룹 완료 화면 + 담보 해제 안내
  └── 트랜잭션 상태 토스트 알림
```

### 6-5. 주요 ethers.js 패턴
```typescript
// USDT approve → contributeToGroup 연속 호출
async function contributeToGroup(groupId: number, cycleNumber: number) {
  const signer = provider.getSigner();
  const usdt = new Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const treasury = new Contract(TREASURY_ADDRESS, TREASURY_ABI, signer);

  // 1. USDT approve
  const approveTx = await usdt.approve(TREASURY_ADDRESS, amount);
  await approveTx.wait();

  // 2. contributeToGroup
  const contributeTx = await treasury.contributeToGroup(groupId, cycleNumber);
  const receipt = await contributeTx.wait();
  return receipt;
}

// VRF 상태 폴링 (PENDING_VRF → ACTIVE 전환 감지)
useEffect(() => {
  const poll = setInterval(async () => {
    const state = await group.state();
    if (state === GroupState.ACTIVE) {
      clearInterval(poll);
      refetchGroupData();
    }
  }, 5000); // 5초마다
  return () => clearInterval(poll);
}, []);
```

---

## STAGE 7 — BSC Testnet 배포 및 E2E 테스트
**목표:** 실제 테스트넷에서 전체 시나리오 1회 이상 완주

### 7-1. 배포 스크립트 실행 순서
```bash
# 1. 컴파일
npx hardhat compile

# 2. 컨트랙트 배포 (BSC Testnet)
npx hardhat deploy --network bscTestnet --tags hhusd
npx hardhat deploy --network bscTestnet --tags treasury
npx hardhat deploy --network bscTestnet --tags vault
npx hardhat deploy --network bscTestnet --tags vrf
npx hardhat deploy --network bscTestnet --tags factory

# 3. Role 설정 스크립트
npx hardhat run scripts/setup-roles.ts --network bscTestnet

# 4. BscScan 검증 (소스코드 공개)
npx hardhat verify --network bscTestnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### 7-2. VRF Subscription 설정 (Testnet)
```
1. https://vrf.chain.link/bsc-testnet 접속
2. Testnet LINK faucet: https://faucets.chain.link/bnb-chain-testnet
3. Subscription 생성 → ID 기록
4. VRFPositionAssigner 주소를 Consumer로 추가
5. LINK 충전 (최소 5 LINK)
```

### 7-3. E2E 테스트 체크리스트
```
[ ] USDT faucet 민팅 (테스트용 MockUSDT)
[ ] Treasury.depositUSDT → HHUSD 발행 확인
[ ] CollateralVault에 담보 잠금 확인
[ ] 10명 그룹 가입 완료
[ ] closeEnrollment 성공
[ ] selectPosition (일부 멤버)
[ ] finalizePositions → VRF Request ID 기록
[ ] BscScan에서 VRF fulfillment 트랜잭션 확인
[ ] 모든 멤버 포지션 배정 확인
[ ] 1사이클: contributeToGroup × 10명 → executeGroupPayout
[ ] USDT 수령인 지갑 잔액 증가 확인
[ ] 전체 10사이클 완주
[ ] 담보 전액 반환 확인
[ ] HHUSD → USDT 환급 (redeemHHUSD) 확인
```

---

## STAGE 8 — 외부 감사 및 메인넷 배포
**목표:** 외부 보안 감사 통과 후 메인넷 출시

### 8-1. 감사 전 준비
```
[ ] Natspec 주석 100% (모든 public/external 함수)
[ ] 테스트 커버리지 95%+ (npx hardhat coverage)
[ ] Slither 고위험 항목 0개
[ ] Foundry fuzz: 10,000회 이상 통과
[ ] README + 기술 명세서 최신화
[ ] 감사사에 제출할 변경 이력(CHANGELOG) 작성
```

### 8-2. 감사사 옵션
| 감사사 | 특징 | 예상 비용 | 기간 |
|--------|------|----------|------|
| Code4rena | 경쟁 감사, 커뮤니티 참여 | $20K~$50K | 2~3주 |
| Sherlock | 성과 기반 | $15K~$40K | 2~3주 |
| Hacken | 가성비, BSC 경험 多 | $5K~$20K | 1~2주 |
| Certik | 인지도 높음 | $30K~$100K | 3~4주 |

→ **권장: Code4rena 또는 Sherlock 먼저, Certik으로 추가 검증**

### 8-3. 버그 바운티 (감사 병행)
```
플랫폼: Immunefi (https://immunefi.com)
등급:
  Critical: $50,000~
  High:     $10,000~
  Medium:   $1,000~
  Low:      $100~
```

### 8-4. 메인넷 배포 체크리스트
```
[ ] Timelock 컨트랙트 배포 (48시간 딜레이)
[ ] Timelock에 UPGRADER_ROLE 이관
[ ] VRF Subscription 메인넷 설정
[ ] 초기 LINK 충전 (최소 50 LINK)
[ ] 컨트랙트 BscScan 검증 완료
[ ] Multi-sig 지갑 설정 (Gnosis Safe 권장)
[ ] Admin 권한 Multi-sig로 이관
[ ] 모니터링 시스템 가동 (Tenderly/OZ Defender)
[ ] 긴급 연락 채널 준비
[ ] 소규모 베타 출시 (최대 총 예치금 $50,000 제한)
[ ] 제한 해제 후 정식 출시
```

---

## 📌 각 스테이지별 완료 기준

| 스테이지 | 완료 기준 |
|---------|----------|
| 1 | `npx hardhat compile` + `npx hardhat test` 통과 |
| 2 | 단위 테스트 커버리지 95%+, 모든 엣지케이스 통과 |
| 3 | VRF 목업으로 포지션 배정 전 과정 검증 |
| 4 | 5개 시나리오(A~E) 전부 통과 |
| 5 | Slither High 0개, Fuzz 10,000회 통과 |
| 6 | Testnet 컨트랙트와 UI 완전 연동 |
| 7 | Testnet E2E 체크리스트 100% |
| 8 | 외부 감사 리포트 수령 + 지적사항 해소 |

---

## ⚡ 자주 쓰는 명령어 모음

```bash
# 컴파일
npx hardhat compile

# 테스트 전체
npx hardhat test

# 특정 파일만
npx hardhat test test/unit/Treasury.test.ts

# 커버리지
npx hardhat coverage

# Foundry fuzz (test/fuzz/ 폴더)
forge test --match-path "test/fuzz/*" --fuzz-runs 10000

# Slither
slither contracts/ --exclude-dependencies --filter-paths "node_modules"

# BSC Testnet 배포
npx hardhat deploy --network bscTestnet

# 컨트랙트 검증
npx hardhat verify --network bscTestnet 0xYOUR_CONTRACT

# 로컬 노드 (테스트용)
npx hardhat node

# 특정 블록까지 시간 앞당기기 (테스트에서)
await ethers.provider.send("evm_increaseTime", [86400]); // 24시간
await ethers.provider.send("evm_mine", []);
```

---

## 🔴 절대 하지 말 것

```
❌ block.timestamp / block.prevrandao로 랜덤 배정
❌ HHUSD에 transfer 기능 추가
❌ Admin 계정에 사용자 자금 접근 권한 부여
❌ Timelock 없이 업그레이드
❌ 감사 전 메인넷 거액 예치 허용
❌ Private Key를 .env 이외 파일에 노출
❌ Proxy 패턴 변경 시 스토리지 레이아웃 재배치
```
