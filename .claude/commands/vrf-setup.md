---
description: Chainlink VRF v2.5 Subscription 설정 가이드 및 상태 확인
allowed-tools: Bash(cat:*), Bash(grep:*)
argument-hint: [testnet|mainnet|status]
---

Chainlink VRF v2.5 설정을 도와줘.

인수가 `testnet`이거나 없으면 — BSC Testnet 설정 안내:

**필요한 것:**
1. Testnet LINK 확보: https://faucets.chain.link/bnb-chain-testnet
2. VRF Subscription UI: https://vrf.chain.link/bsc-testnet
3. VRFPositionAssigner 배포 주소 (`deployments/bscTestnet.json` 확인)

**설정 순서:**
1. https://vrf.chain.link/bsc-testnet 에서 "Create Subscription"
2. 발급된 subscriptionId를 `.env`의 `VRF_SUBSCRIPTION_ID`에 저장
3. LINK 최소 5개 충전 (Fund Subscription)
4. VRFPositionAssigner 주소를 "Add Consumer"로 등록
5. VRFPositionAssigner의 `s_subscriptionId` 확인

인수가 `mainnet`이면 — BSC Mainnet 설정 안내:
- Coordinator: 0xd691f04bc0C9a24Edb78af9754bE204f869cef3a
- UI: https://vrf.chain.link/bsc
- ⚠️ BNB Bridge LINK는 ERC-677 불호환 → PegSwap 필요: https://pegswap.chain.link
- 권장 초기 충전량: 50 LINK

인수가 `status`이면 — 현재 VRF 설정 상태 점검:
- VRFPositionAssigner.sol에서 subscriptionId, keyHash 값 확인
- .env 파일에 VRF_SUBSCRIPTION_ID 있는지 확인
- deployments/ 폴더에 VRFPositionAssigner 주소 있는지 확인

$ARGUMENTS
