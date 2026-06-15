# HH Finance 보안 감사 체크리스트

---

## 카테고리 1: 재진입 공격 (Reentrancy)

- [ ] **모든 외부 호출 이전에 상태 업데이트 완료** (Checks-Effects-Interactions 패턴)
  - Treasury.depositUSDT: HHUSD mint 전 상태 업데이트 확인
  - Treasury.redeemHHUSD: HHUSD burn 이후 USDT 전송 순서 확인
  - CollateralVault.slashCollateral: 상태 업데이트 후 burn 호출 확인
- [ ] **ReentrancyGuard 적용 확인**
  - Treasury: ✅ 적용
  - CollateralVault: ✅ 적용
  - PublicGroup: ✅ 적용
  - PrivateGroup: ⚠️ 추가 필요
- [ ] **외부 컨트랙트 호출 체인 검토** (group → vault → hhusd 연쇄 호출)

---

## 카테고리 2: 접근 제어 (Access Control)

- [ ] **모든 민감 함수에 Role 가드 적용**
  - mint/burn: MINTER_ROLE/BURNER_ROLE만 호출 가능
  - lockCollateral/slashCollateral: GROUP_ROLE만 호출 가능
  - setFees: FEE_MANAGER만 호출 가능
  - pause/unpause: PAUSER_ROLE만 호출 가능
  - upgrade: UPGRADER_ROLE + Timelock만 가능
- [ ] **Role 부여 대상 검토** (admin이 과도한 권한 보유 여부)
- [ ] **PrivateGroup owner 권한 범위 검토**
  - owner가 자금 인출 불가 확인
  - owner가 포지션만 설정 가능 확인
- [ ] **초기화 후 admin 권한 최소화** (Ownable2Step 또는 Timelock 이관 고려)

---

## 카테고리 3: 정수 오버플로 / 언더플로

- [ ] **Solidity 0.8.x 자동 오버플로 체크 확인**
- [ ] **수수료 계산 정밀도 검토**
  - buyFee = amount * buyFeeBP / BP_BASE 순서 확인 (나눗셈 마지막)
  - referralReward > buyFee 케이스 방지 로직 확인
- [ ] **담보 비율 계산 정밀도**: contribution * cycles * ratioBP / 10000
- [ ] **사이클 카운터 경계값**: currentCycle == totalCycles 조건 정확성

---

## 카테고리 4: 로직 취약점

- [ ] **HHUSD는 Non-Transferable이므로 그룹 기여금 처리 재검토**
  - PublicGroup.contribute()가 실제 HHUSD를 어떻게 이동시키는지 명확화 필요
  - 옵션 A: 기여금은 USDT로 처리 (HHUSD는 순수 내부 회계)
  - 옵션 B: HHUSD 특수 protocol transfer 함수 추가
- [ ] **포지션 선택 우선순위 로직**
  - 더 일찍 가입한 사람이 먼저 선택 가능한지 강제 검증 부재 → UI만으로 처리 중
  - 동일 시간 joinTime 충돌 처리
- [ ] **취소 그룹 담보 전액 환불 검증**
  - memberList 루프에서 가스 한도 초과 위험 (최대 20명 → 안전)
- [ ] **제거된 멤버가 수령 포지션인 경우 처리**
  - 포지션 재배정 로직 필요
- [ ] **그룹 완료 시점 검증**
  - distributePayout() 호출 타이밍 중복 방지

---

## 카테고리 5: 랜덤성 조작

- [ ] **pseudo-random 사용 위험 인지**
  - block.timestamp + block.prevrandao 조작 가능성
  - 검증자가 유리한 포지션 배정 조작 시도 가능
- [ ] **권장 해결책: Chainlink VRF v2.5 적용**
  ```solidity
  // VRF 요청 → 콜백에서 포지션 배정
  function requestRandomPositions() external { ... }
  function fulfillRandomWords(uint256 reqId, uint256[] memory words) internal override { ... }
  ```
- [ ] **VRF 도입 전 임시 완화**: 모든 멤버 동의 기반 시드 또는 commit-reveal 방식

---

## 카테고리 6: 업그레이드 보안

- [ ] **UUPS 패턴 사용 확인** (Transparent Proxy보다 가스 효율적)
- [ ] **Timelock 컨트랙트 연동**
  - 최소 딜레이: 48시간
  - 업그레이드 제안 → 2일 후 실행
- [ ] **스토리지 레이아웃 충돌 방지**
  - 업그레이드 시 기존 변수 순서 유지
  - 새 변수는 항상 마지막에 추가
  - OpenZeppelin storage gap (`uint256[50] __gap`) 사용
- [ ] **초기화 함수 재호출 방지** (initializer modifier 확인)

---

## 카테고리 7: 외부 의존성

- [ ] **USDT BEP20 주소 하드코딩 또는 검증**
  - BSC Mainnet USDT: `0x55d398326f99059fF775485246999027B3197955`
- [ ] **SafeERC20 사용 확인** (return value 미반환 토큰 방어)
- [ ] **HHUSD 컨트랙트 주소 불변성 검토**
- [ ] **CollateralVault와 Group 컨트랙트 신뢰 관계**
  - GROUP_ROLE 부여 과정 감사

---

## 카테고리 8: 가스 최적화

- [ ] **memberList 루프 최대 크기**: 20명 (안전)
- [ ] **allGroups 배열 성장**: 무제한 → getGroupsPaginated() 고려
- [ ] **구조체 패킹 최적화**
  - Member 구조체: position(uint8), missedPayments(uint8), status(uint8) 연속 배치
- [ ] **불필요한 storage 읽기 제거** (local variable 캐싱)
- [ ] **이벤트 indexed 파라미터 최적화** (검색 빈도 높은 파라미터만 indexed)

---

## 카테고리 9: 프론트런닝

- [ ] **포지션 선택 프론트런닝 위험**
  - 인기 포지션(1번) 스나이핑 가능
  - 완화: commit-reveal 방식 또는 12시간 창 충분히 긺
- [ ] **depositUSDT 멤풀 노출**
  - 일반 거래 특성상 큰 위험 없음
- [ ] **담보 슬래싱 타이밍 조작**
  - 멤버 제거 직전 포지션 교환 불가 확인

---

## 카테고리 10: 비즈니스 로직

- [ ] **추천인 자기 추천 방지**: ✅ SelfReferral 에러 적용
- [ ] **추천인 고리 형성 방지** (A→B→A 추천 순환 검토)
- [ ] **수수료 최대값 하드캡**: MAX_FEE_BP = 1000 (10%) ✅
- [ ] **referralFeeBP < buyFeeBP 강제 검증**: ✅ 적용
- [ ] **그룹 취소 후 재사용 방지**: groupId는 고유 단조증가
- [ ] **프라이빗 그룹 초대 코드 재사용 방지**: ✅ usedInviteCodes 적용
- [ ] **최소 담보 비율 강제**: 50% 이상 (PrivateGroupFactory) ✅

---

## 카테고리 11: 이벤트 & 모니터링

- [ ] **모든 상태 변경 이벤트 발행 확인**
- [ ] **중요 이벤트 indexed 파라미터 추가**
  ```solidity
  event DepositCompleted(address indexed user, uint256 usdtIn, uint256 fee, uint256 hhusdMinted);
  event CollateralSlashed(address indexed user, uint256 indexed groupId, uint256 amount, address indexed recipient);
  ```
- [ ] **온체인 모니터링 시스템 구축** (Tenderly / OpenZeppelin Defender)
- [ ] **긴급 알림 설정**: 대규모 출금, 반복 슬래싱, 비정상 수수료 변경

---

## 카테고리 12: 외부 감사 준비

- [ ] **Natspec 주석 100% 작성**
- [ ] **단위 테스트 커버리지 95%+ 달성** (Hardhat/Foundry)
- [ ] **Foundry fuzzing 테스트 추가**
- [ ] **Slither 정적 분석 실행 및 취약점 해소**
- [ ] **Mythril 분석 실행**
- [ ] **외부 감사사 선정** (Trail of Bits, Certik, Hacken, Code4rena 경쟁 감사 권장)
- [ ] **버그 바운티 프로그램 준비** (Immunefi)
- [ ] **BSC Testnet 전체 E2E 시나리오 테스트 완료**

---

## 위험도 요약 매트릭스

| 취약점 | 심각도 | 현재 상태 | 우선순위 |
|--------|--------|----------|---------|
| Pseudo-random 조작 | 🔴 High | 미해결 | 즉시 |
| 그룹 내 HHUSD 이동 로직 불명확 | 🔴 High | 미해결 | 즉시 |
| 제거 멤버 포지션 재배정 | 🟡 Medium | 미해결 | 높음 |
| PrivateGroup ReentrancyGuard 누락 | 🟡 Medium | 미해결 | 높음 |
| Timelock 미연동 | 🟡 Medium | 미설정 | 높음 |
| 추천인 순환 방지 | 🟡 Medium | 미해결 | 중간 |
| 가스 한도 (대규모 그룹) | 🟢 Low | 20명 제한으로 안전 | 낮음 |
| 스토리지 갭 누락 | 🟢 Low | 미적용 | 낮음 |
