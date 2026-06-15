---
description: 컨트랙트 Role 설정 스크립트 실행 및 검증
allowed-tools: Bash(npx hardhat run:*), Bash(cat:*), Bash(ls:*)
argument-hint: [testnet|mainnet|check]
---

HH Finance 컨트랙트 Role 설정을 해줘.

인수가 `check`이면 — 현재 Role 상태만 확인:
`deployments/` 폴더의 주소를 기반으로 각 컨트랙트에서
현재 부여된 Role 목록을 읽어서 아래 표와 비교:

```
HHUSD:
  MINTER_ROLE  → TreasuryV2 ✓/✗
  BURNER_ROLE  → TreasuryV2 ✓/✗
  BURNER_ROLE  → CollateralVault ✓/✗

CollateralVault:
  GROUP_ROLE   → 등록된 PublicGroupVRF 목록 ✓/✗

VRFPositionAssigner:
  GROUP_ROLE   → 등록된 PublicGroupVRF 목록 ✓/✗

TreasuryV2:
  PAYOUT_EXECUTOR_ROLE → 등록된 PublicGroupVRF 목록 ✓/✗
```

인수가 `testnet`이거나 없으면:
`scripts/setup-roles.ts`가 있으면 실행.
없으면 스크립트를 먼저 작성한 후 실행해줘.

인수가 `mainnet`이면:
mainnet 배포 주소로 Role 설정 실행.
Timelock 컨트랙트가 있으면 Timelock을 통해 제안.

$ARGUMENTS
