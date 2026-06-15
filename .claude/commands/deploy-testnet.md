---
description: BSC Testnet 배포 (순서대로 자동 진행)
allowed-tools: Bash(npx hardhat deploy:*), Bash(npx hardhat verify:*), Bash(npx hardhat run:*), Bash(cat:*)
argument-hint: [all|hhusd|treasury|vault|vrf|factory|roles|verify]
---

HH Finance 컨트랙트를 BSC Testnet에 배포해줘.

인수가 없거나 `all`이면 전체 순서대로:
1. HHUSD 배포
2. TreasuryV2 배포 (HHUSD 주소 자동 연결)
3. CollateralVault 배포
4. GroupRegistry 배포
5. VRFPositionAssigner 배포 (testnet coordinator 주소 사용)
6. PublicGroupVRF Factory 배포
7. PrivateGroupFactory 배포
8. `scripts/setup-roles.ts` 실행 (Role 전체 설정)
9. BscScan 소스코드 검증

특정 인수가 있으면 해당 컨트랙트만 배포.

배포 완료 후:
- 배포된 주소 목록을 `deployments/bscTestnet.json`에 저장
- 각 컨트랙트 BscScan 링크 출력

.env에 PRIVATE_KEY, BSCSCAN_API_KEY, VRF_SUBSCRIPTION_ID가 필요해.
없으면 먼저 안내해줘.

$ARGUMENTS
