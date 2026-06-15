# HH Finance — Claude Code 프로젝트 메모리

프로젝트: BNB Chain 기반 비수탁형 계(ROSCa) DeFi 플랫폼
언어: Solidity ^0.8.20, TypeScript (Hardhat), React (프론트)
네트워크: BSC Mainnet (chainId 56) / BSC Testnet (chainId 97)

---

## 아키텍처 핵심 원칙 (항상 준수)

- HHUSD = Non-Transferable 내부 회계 토큰. transfer/transferFrom/approve 전부 revert. 담보 전용.
- USDT = 실제 이동 자산. 항상 TreasuryV2 내부에 머묾. 그룹 컨트랙트가 직접 접근하면 안 됨.
- 랜덤 배정은 반드시 Chainlink VRF v2.5. block.timestamp / block.prevrandao 절대 사용 금지.
- Admin은 사용자 자금 인출 불가. 모든 자금 이동은 컨트랙트 로직만.
- 모든 외부 호출 컨트랙트에 ReentrancyGuard 적용. Checks-Effects-Interactions 패턴 준수.

---

## 컨트랙트 파일 구조

```
contracts/
├── HHUSD.sol                ← Non-Transferable ERC20, UUPS
├── TreasuryV2.sol           ← ★ 사용 (Treasury.sol 아님)
├── CollateralVault.sol      ← 담보 lock/unlock/slash
├── VRFPositionAssigner.sol  ← Chainlink VRF v2.5 소비자
├── PublicGroupVRF.sol       ← ★ 사용 (PublicGroup.sol 아님)
├── GroupContracts.sol       ← PublicGroupFactory + PrivateGroup + PrivateGroupFactory
└── mocks/                   ← 테스트용 목업 (MockUSDT, MockVRFCoordinator)
```

아직 구현 안 된 파일:
- `GroupRegistry.sol` — TreasuryV2가 그룹 유효성 검증에 사용. 최우선 구현 필요.
- `mocks/MockUSDT.sol` — 표준 ERC20, 18 decimals
- `mocks/MockVRFCoordinatorV2_5.sol` — @chainlink/contracts 제공 목업 사용

---

## 빌드 및 테스트 명령어

```bash
npx hardhat compile              # 컴파일
npx hardhat test                 # 전체 테스트
npx hardhat coverage             # 커버리지 (목표: 95%+)
npx hardhat deploy --network bscTestnet  # 테스트넷 배포
forge test --fuzz-runs 10000     # Foundry fuzz 테스트
slither contracts/ --exclude-dependencies  # 정적 분석
```

---

## BSC 네트워크 주소

```
# Mainnet
USDT:            0x55d398326f99059fF775485246999027B3197955
VRF Coordinator: 0xd691f04bc0C9a24Edb78af9754bE204f869cef3a
LINK:            0x404460C6A5EdE2D891e8297795264fDe62ADBB75
VRF keyHash:     0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314

# Testnet
VRF Coordinator: 0x9C22cD2689B24c05cB84BFf34a4eb30Bb42cAA3A
LINK:            0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06
VRF keyHash:     0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314
```

---

## 컨트랙트 배포 순서 및 Role 설정

```
1. HHUSD
2. TreasuryV2 (HHUSD 주소 필요)
3. CollateralVault (HHUSD 주소 필요)
4. GroupRegistry
5. VRFPositionAssigner (VRF Coordinator 주소 + subscriptionId 필요)
6. PublicGroupVRF Factory (CollateralVault + VRFPositionAssigner 필요)
7. PrivateGroupFactory

Role 부여:
  HHUSD → MINTER_ROLE, BURNER_ROLE: TreasuryV2
  HHUSD → BURNER_ROLE: CollateralVault
  CollateralVault → GROUP_ROLE: 각 PublicGroupVRF 인스턴스
  VRFPositionAssigner → GROUP_ROLE: 각 PublicGroupVRF 인스턴스
  TreasuryV2 → PAYOUT_EXECUTOR_ROLE: 각 PublicGroupVRF 인스턴스
```

---

## 코딩 규칙

- Solidity 버전: `^0.8.20` 고정
- import 순서: OpenZeppelin → Chainlink → 내부 인터페이스
- 에러: `require` 대신 custom error + `revert` 사용
- 이벤트: 핵심 파라미터는 `indexed` 붙이기
- 함수 순서: constructor → initializer → external → public → internal → private → view
- 테스트 파일: `test/unit/`, `test/integration/`, `test/fuzz/` 분리
- 배포 스크립트: `deploy/01_`, `deploy/02_` 번호 순서 유지

---

## 현재 개발 스테이지 (@docs/CURRICULUM.md 참고)

@workspace/CURRICULUM.md
@workspace/CONTRACT_SUMMARY.md

---

## 절대 하지 말 것

- block.timestamp / block.prevrandao로 랜덤 생성
- HHUSD에 transfer 기능 추가
- Admin에게 사용자 자금 접근 권한 부여
- Timelock 없이 컨트랙트 업그레이드
- Private Key를 코드에 하드코딩
- Proxy 업그레이드 시 스토리지 레이아웃 변경
- TreasuryV2 대신 Treasury.sol 사용
- PublicGroupVRF 대신 PublicGroup.sol 사용
