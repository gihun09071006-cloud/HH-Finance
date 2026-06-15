---
description: HH Finance 테스트 실행 (단위/통합/fuzz 선택 가능)
allowed-tools: Bash(npx hardhat test:*), Bash(npx hardhat coverage), Bash(forge test:*)
argument-hint: [unit|integration|fuzz|coverage|all]
---

HH Finance 테스트를 실행해줘.

인수가 없으면 전체 테스트(`npx hardhat test`) 실행.

인수에 따라:
- `unit`        → `npx hardhat test test/unit/`
- `integration` → `npx hardhat test test/integration/`
- `fuzz`        → `forge test --match-path "test/fuzz/*" --fuzz-runs 10000 -v`
- `coverage`    → `npx hardhat coverage` 후 커버리지 % 요약
- `all`         → unit → integration → fuzz 순서로 전부

실행 후:
1. 실패한 테스트가 있으면 원인 분석 + 수정 제안
2. 성공하면 통과한 테스트 수 요약
3. coverage 실행 시 90% 미만 파일 목록 강조

$ARGUMENTS
