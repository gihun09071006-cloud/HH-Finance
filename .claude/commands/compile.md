---
description: HH Finance 컨트랙트 컴파일 및 에러 분석
allowed-tools: Bash(npx hardhat compile), Bash(cat:*)
---

contracts/ 폴더의 모든 Solidity 파일을 컴파일해줘.

`npx hardhat compile` 실행하고:
1. 에러가 있으면 원인 설명 + 수정 방법 제시
2. 성공하면 컴파일된 컨트랙트 목록과 각 파일 크기(바이트코드) 요약
3. 24576 bytes 초과하는 컨트랙트가 있으면 경고

$ARGUMENTS
