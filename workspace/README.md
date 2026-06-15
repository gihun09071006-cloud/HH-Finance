# HH Finance — 마스터 작업 가이드
> BNB Chain 기반 비수탁형 계(ROSCa) DeFi 플랫폼

---

## 📁 프로젝트 폴더 구조

```
hhfinance/
├── contracts/                     ← 스마트 컨트랙트
│   ├── HHUSD.sol                  ← 내부 회계 토큰 (Non-Transferable ERC20)
│   ├── Treasury.sol               ← v1: 입출금 + 수수료 + 추천
│   ├── TreasuryV2.sol             ★ 사용 권장: 그룹 풀링 통합
│   ├── CollateralVault.sol        ← 담보 관리
│   ├── PublicGroup.sol            ← 퍼블릭 그룹 (pseudo-random, 테스트용)
│   ├── PublicGroupVRF.sol         ★ 사용 권장: VRF 연동 퍼블릭 그룹
│   ├── VRFPositionAssigner.sol    ★ Chainlink VRF v2.5 소비자
│   └── GroupContracts.sol         ← Factory + PrivateGroup + PrivateFactory
│
├── docs/
│   ├── 01_spec_review.md          ← 명세서 검토 + 10대 보완 제안
│   ├── 02_audit_checklist.md      ← 보안 감사 체크리스트 (12카테고리)
│   └── 03_contribution_mechanism.md ← HHUSD 기여금 방식 분석
│
├── frontend/
│   └── HHFinanceDashboard.jsx     ← React 대시보드 (Overview/Groups/Referral)
│
└── README.md                      ← 이 파일
```

---

## ★ 핵심 설계 원칙 (반드시 숙지)

```
HHUSD = 담보 영수증 토큰   →  전송 불가, CollateralVault에서만 사용
USDT  = 실제 이동 자산     →  항상 TreasuryV2 내부에 머묾

그룹 컨트랙트는 USDT에 직접 접근 ❌
모든 USDT 이동은 TreasuryV2를 통해서만 ✅

랜덤 배정은 block.timestamp 사용 ❌
반드시 Chainlink VRF v2.5 사용 ✅
```

---

## 🔗 컨트랙트 의존 관계

```
TreasuryV2
  ├── HHUSD        (mint / burn)
  ├── USDT         (safeTransfer)
  └── GroupRegistry (그룹 유효성 검증)

CollateralVault
  └── HHUSD        (balanceOf / burn)

VRFPositionAssigner
  └── Chainlink VRF Coordinator

PublicGroupVRF
  ├── CollateralVault   (lock / unlock / slash)
  └── VRFPositionAssigner (requestRandomness)

GroupContracts (Factory들)
  ├── HHUSD
  ├── CollateralVault
  └── VRFPositionAssigner
```

---

## 🌐 BSC 네트워크 주소

### Mainnet
| 항목 | 주소 |
|------|------|
| USDT (BEP20) | `0x55d398326f99059fF775485246999027B3197955` |
| VRF Coordinator v2.5 | `0xd691f04bc0C9a24Edb78af9754bE204f869cef3a` |
| LINK Token | `0x404460C6A5EdE2D891e8297795264fDe62ADBB75` |
| 500gwei keyHash | `0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314` |

### Testnet (BSC Testnet)
| 항목 | 주소 |
|------|------|
| USDT (BEP20 Test) | 직접 배포 또는 faucet 사용 |
| VRF Coordinator v2.5 | `0x9C22cD2689B24c05cB84BFf34a4eb30Bb42cAA3A` |
| LINK Token | `0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06` |
| 50gwei keyHash | `0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314` |
| LINK Faucet | https://faucets.chain.link/bnb-chain-testnet |

> ⚠️ BNB Bridge로 이동한 LINK는 ERC-677 불호환
> → 반드시 PegSwap 사용: https://pegswap.chain.link

---

## 🔐 배포 순서 및 Role 설정

```
배포 순서:
  1. HHUSD.sol
  2. TreasuryV2.sol
  3. CollateralVault.sol
  4. GroupRegistry.sol  (별도 구현 필요)
  5. VRFPositionAssigner.sol
  6. PublicGroupVRF (Factory를 통해 그룹별 배포)
  7. GroupContracts (PrivateGroupFactory)

Role 부여:
  HHUSD:
    MINTER_ROLE  → TreasuryV2
    BURNER_ROLE  → TreasuryV2, CollateralVault

  CollateralVault:
    GROUP_ROLE   → 각 PublicGroupVRF 인스턴스
                 → 각 PrivateGroup 인스턴스

  VRFPositionAssigner:
    GROUP_ROLE   → 각 PublicGroupVRF 인스턴스

  TreasuryV2:
    PAYOUT_EXECUTOR_ROLE → 각 PublicGroupVRF 인스턴스
```

---

## 💡 VRF Subscription 설정 (배포 전 필수)

```
1. https://vrf.chain.link/bsc 접속
2. "Create Subscription" 클릭
3. SubscriptionId (uint256) 기록
4. LINK 충전 (그룹 100개당 약 1 LINK 추정)
5. VRFPositionAssigner 배포 후 컨트랙트 주소를 Consumer로 추가
6. VRFPositionAssigner 생성자에 subscriptionId 입력
```
