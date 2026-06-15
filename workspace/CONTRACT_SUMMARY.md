# 컨트랙트 요약 카드

## 사용할 파일 (★ 표시)

| 파일 | 역할 | 사용 여부 |
|------|------|----------|
| HHUSD.sol | 내부 회계 토큰 | ★ 그대로 사용 |
| TreasuryV2.sol | 입출금 + 그룹 풀링 | ★ v1 대신 이걸 사용 |
| CollateralVault.sol | 담보 관리 | ★ 그대로 사용 |
| VRFPositionAssigner.sol | Chainlink VRF 소비자 | ★ 신규 추가 |
| PublicGroupVRF.sol | 퍼블릭 그룹 (VRF 연동) | ★ PublicGroup.sol 대신 이걸 사용 |
| GroupContracts.sol | Factory + PrivateGroup | ★ 그대로 사용 (PublicGroupFactory는 PublicGroupVRF로 수정 필요) |
| Treasury.sol | 구버전 | ✗ TreasuryV2로 대체 |
| PublicGroup.sol | 구버전 (pseudo-random) | ✗ PublicGroupVRF로 대체 |

## 아직 구현 필요한 컨트랙트

| 파일 | 역할 | 우선순위 |
|------|------|---------|
| GroupRegistry.sol | 그룹 유효성 검증, TreasuryV2에서 참조 | 🔴 필수 |
| TimelockController.sol | 업그레이드 딜레이 (OZ 기본 제공) | 🟡 배포 전 |
| MockUSDT.sol | 테스트용 USDT | 🟢 테스트용 |
| MockVRFCoordinatorV2_5.sol | 로컬 VRF 테스트 | 🟢 테스트용 |

## 핵심 함수 빠른 참조

### TreasuryV2
```
depositUSDT(amount)                          ← 사용자 입금
redeemHHUSD(amount)                          ← 사용자 출금
setReferrer(address)                          ← 추천인 등록 (최초 1회)
contributeToGroup(groupId, cycleNumber)       ← 그룹 기여금 납부
executeGroupPayout(groupId, cycle, recipient) ← 사이클 지급 (그룹 컨트랙트가 호출)
refundGroupPool(groupId, members[], cycle)    ← 그룹 취소 환불
```

### PublicGroupVRF
```
joinGroup()             ← 그룹 가입 (담보 자동 잠금)
closeEnrollment()       ← 등록 마감 (누구나 호출 가능)
selectPosition(pos)     ← 포지션 직접 선택
finalizePositions()     ← VRF 요청 트리거
receiveRandomPositions  ← VRF 콜백 (VRFPositionAssigner만 호출)
retryVRFRequest()       ← VRF 타임아웃 후 재시도
contribute()            ← 사이클 기여 (TreasuryV2.contributeToGroup와 연동)
distributePayout()      ← 사이클 지급 트리거
warningMissedPayment()  ← 미납 처리
```

### VRFPositionAssigner
```
requestRandomness(memberCount)  ← 그룹 컨트랙트가 호출
fulfillRandomWords()            ← Chainlink가 자동 호출 (수동 호출 불가)
retryVRFRequest()               ← 타임아웃 후 관리자 재시도
```

### CollateralVault
```
lockCollateral(user, groupId, amount)              ← 그룹 가입 시
unlockCollateral(user, groupId, amount)            ← 그룹 완료 시
slashCollateral(user, groupId, amount, recipient)  ← 미납 패널티
getRequiredCollateral(contribution, cycles, ratio) ← 필요 담보량 계산
```
