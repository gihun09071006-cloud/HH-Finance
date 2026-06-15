---
description: 보안 점검 — Slither 정적 분석 + 체크리스트 수동 확인
allowed-tools: Bash(slither:*), Bash(cat:*), Bash(grep:*)
argument-hint: [slither|checklist|reentrancy|access|all]
---

HH Finance 보안 점검을 실행해줘.

인수가 없거나 `all`이면:

**1단계: Slither 정적 분석**
```
slither contracts/ --exclude-dependencies --filter-paths "node_modules"
```
결과에서 High/Medium severity만 추려서 정리해줘.

**2단계: 재진입 공격 검토** (`reentrancy`)
contracts/ 폴더의 모든 .sol 파일에서:
- 외부 호출(call, transfer, safeTransfer) 이전에 상태 업데이트가 됐는지
- ReentrancyGuard가 누락된 컨트랙트는 없는지

**3단계: 접근 제어 검토** (`access`)
- onlyRole, onlyOwner 없이 노출된 민감 함수
- MINTER_ROLE / BURNER_ROLE / GROUP_ROLE / PAYOUT_EXECUTOR_ROLE 부여 상태

**4단계: docs/02_audit_checklist.md 체크리스트 점검**
현재 코드 기준으로 체크리스트 항목별 Pass/Fail/미구현 상태 정리

완료 후 High 우선순위 미해결 항목 목록으로 마무리.

$ARGUMENTS
