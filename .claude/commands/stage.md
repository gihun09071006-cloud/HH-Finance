---
description: 현재 개발 스테이지 확인 및 다음 할 일 안내
allowed-tools: Bash(ls:*), Bash(cat:*), Bash(npx hardhat compile), Bash(find:*)
---

HH Finance 현재 개발 상태를 파악해서 어디까지 왔는지 알려줘.

아래 항목들을 체크해줘:

**STAGE 1: 환경 세팅**
- [ ] package.json에 hardhat, openzeppelin, chainlink 의존성 있는지
- [ ] hardhat.config.ts / hardhat.config.js 있는지
- [ ] `npx hardhat compile` 통과하는지

**STAGE 2: 기반 컨트랙트**
- [ ] HHUSD.sol 있는지
- [ ] TreasuryV2.sol 있는지 (Treasury.sol 아님)
- [ ] CollateralVault.sol 있는지
- [ ] GroupRegistry.sol 있는지
- [ ] test/unit/ 테스트 파일들 있는지

**STAGE 3: VRF 통합**
- [ ] VRFPositionAssigner.sol 있는지
- [ ] mocks/MockVRFCoordinatorV2_5.sol 있는지
- [ ] VRF 테스트 있는지

**STAGE 4: 그룹 시스템**
- [ ] PublicGroupVRF.sol 있는지 (PublicGroup.sol 아님)
- [ ] GroupContracts.sol (Factory들) 있는지
- [ ] test/integration/ 파일 있는지

**STAGE 5: 보안**
- [ ] slither 설치됐는지
- [ ] test/fuzz/ 파일 있는지

**STAGE 6: 프론트엔드**
- [ ] frontend/ 폴더 있는지
- [ ] HHFinanceDashboard.jsx 있는지

**STAGE 7: 테스트넷**
- [ ] deployments/bscTestnet.json 있는지
- [ ] .env에 VRF_SUBSCRIPTION_ID 있는지

체크 완료 후:
1. 현재 완료된 스테이지 표시
2. 지금 당장 해야 할 것 3가지 구체적으로 제시
3. 막히는 부분 있으면 질문 받기
