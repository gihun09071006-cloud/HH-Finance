---
description: 가스 사용량 분석 및 최적화 제안
allowed-tools: Bash(npx hardhat test:*), Bash(cat:*), Bash(grep:*)
argument-hint: [파일명 또는 all]
---

HH Finance 컨트랙트의 가스 최적화를 분석해줘.

인수가 없거나 `all`이면 모든 컨트랙트 분석.
특정 파일명이 있으면 해당 파일만.

분석 항목:
1. **storage 읽기 최적화** — 같은 storage 변수를 여러 번 읽는 함수 찾기 → 로컬 캐싱 제안
2. **구조체 패킹** — Member 등 구조체에서 패킹 최적화 가능한 부분
3. **반복문 가스** — memberList 루프에서 최악의 경우 가스 추정
4. **custom error vs require** — require string 대신 custom error 미적용 부분
5. **불필요한 이벤트** — 과도하게 indexed 파라미터가 많은 이벤트
6. **컨트랙트 크기** — 24576 bytes 제한 근접 여부 (PublicGroupVRF, GroupContracts 주의)

각 항목마다:
- 문제 위치 (파일명:줄번호)
- 현재 가스 예상
- 최적화 후 가스 예상
- 수정 코드 제시

$ARGUMENTS
