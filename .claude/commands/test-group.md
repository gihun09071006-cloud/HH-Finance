---
description: 그룹 전체 수명주기 통합 테스트 (5개 시나리오)
allowed-tools: Bash(npx hardhat test:*), Bash(cat:*)
argument-hint: [A|B|C|D|E|all]
---

PublicGroupVRF의 전체 수명주기 통합 테스트를 실행해줘.

시나리오:
- A: 정상 완주 (10명, 10사이클, VRF 배정, 전체 지급)
- B: 미납 처리 (1차 경고 → 2차 슬래시 → 3차 제거)
- C: 멤버 부족 취소 (9명 가입 → CANCELLED → 전액 환불)
- D: VRF 타임아웃 후 재시도
- E: 프라이빗 그룹 초대 코드 + 수동 포지션 배정

인수가 없거나 `all`이면 5개 전부.
특정 알파벳이면 해당 시나리오만.

테스트 파일이 없으면 `test/integration/FullGroupLifecycle.test.ts`를 작성한 후 실행해줘.
VRF는 MockVRFCoordinatorV2_5를 사용해.

$ARGUMENTS
