# HH Finance 명세서 검토 및 보완 제안 v1.0

---

## 1. 전체 아키텍처 평가

### ✅ 잘 설계된 부분
- HHUSD를 Non-Transferable ERC20으로 설계 → 내부 회계 토큰으로 적합
- CollateralVault 분리 → 담보와 자산 로직 분리로 보안성 향상
- Admin이 사용자 자금에 접근 불가 → 비수탁형 원칙 준수
- Emergency Pause가 기존 자금 인출을 막지 않는 구조 → 적절

### ⚠️ 보완이 필요한 부분

| # | 항목 | 현재 상태 | 문제점 | 제안 |
|---|------|----------|--------|------|
| 1 | **업그레이드 메커니즘** | Timelock만 언급 | 어떤 Proxy 패턴인지 미정 | UUPS 또는 Transparent Proxy 명시 필요 |
| 2 | **랜덤 배정** | 체인 상에서 랜덤 | block.timestamp / blockhash 조작 가능 | Chainlink VRF 사용 권장 |
| 3 | **사이클 정의** | 순환 횟수만 언급 | 사이클 간 간격(주간/월간?) 미정 | CycleInterval 파라미터 추가 필요 |
| 4 | **환불 로직** | CANCELLED 상태 존재 | 취소 시 환불 프로세스 미정 | refundAll() 함수 명세 필요 |
| 5 | **프라이빗 그룹 수수료** | 퍼블릭만 언급 | 프라이빗 그룹 수수료 정책 없음 | creatorFeeBP 등 추가 고려 |
| 6 | **오라클 / 가격 피드** | USDT 1:1 고정 | USDT 디페깅 시나리오 미고려 | Chainlink USDT/USD 피드 연동 권장 |
| 7 | **멤버 탈퇴** | removeMember()만 | 자발적 탈퇴 시 담보 처리 미정 | voluntaryExit() 별도 명세 필요 |
| 8 | **재진입 공격** | 미언급 | reentrancy 취약점 가능성 | ReentrancyGuard 적용 명시 필요 |
| 9 | **이벤트 인덱싱** | Events 목록만 | indexed 파라미터 미정 | 주요 파라미터에 indexed 명시 |
| 10 | **테스트 네트워크** | 미언급 | BNB 테스트넷 배포 계획 없음 | BSC Testnet 단계 추가 권장 |

---

## 2. 컨트랙트별 상세 보완 제안

### 2.1 Treasury.sol

**현재 누락된 항목:**
```
- USDT 소수점 처리 (USDT는 18 decimals on BEP20)
- 최소/최대 입금액 제한 없음
- 수수료 변경 시 타임락 없음
- pausable 상태에서 redeemHHUSD 가능 여부 불명확
```

**추가 권장 함수:**
```solidity
setFees(uint256 buyBP, uint256 sellBP) // Timelock 적용
setMinDeposit(uint256 amount)
setMaxDeposit(uint256 amount)
emergencyWithdrawByDAO() // 거버넌스 도입 후
```

**추가 권장 변수:**
```solidity
minDepositAmount = 1e18   // 1 USDT
maxDepositAmount = 100000e18  // 100,000 USDT
totalFeesCollected
totalReferralsPaid
```

---

### 2.2 PublicGroup.sol

**사이클 로직 보완:**
```
현재: 사이클 횟수만 정의
필요: 
  - cycleIntervalSeconds (예: 7일 = 604800)
  - firstPaymentDeadline
  - nextCycleStartTime
  - 자동 실행 트리거 (Chainlink Automation 권장)
```

**결제 미납 처리 강화:**
```
현재:
  1차 미납 → Warning
  2차 미납 → 담보 차감
  3차 미납 → 제거

보완:
  - Warning 발행 시 이벤트 + 타임스탬프 기록
  - 담보 차감액 = 해당 사이클 기여금액으로 명시
  - 제거된 멤버의 포지션 재배정 로직 필요
  - 제거된 멤버가 이미 수령한 경우 처리 방안
```

---

### 2.3 CollateralVault.sol

**담보 비율 명세 누락:**
```
현재: lockedCollateral 변수만 존재
필요:
  - 퍼블릭 그룹 기본 담보 비율: contribution × cycles × ratio
  - 프라이빗 그룹 커스텀 담보 비율
  - 최소 담보 비율 (예: 100%)
  - 최대 담보 비율 (예: 300%)
```

**추가 권장 함수:**
```solidity
getRequiredCollateral(uint256 contribution, uint256 cycles, uint256 ratioBP)
isCollateralSufficient(address user, uint256 groupId)
```

---

## 3. 보안 아키텍처 보완

### 접근 제어 (Access Control)
```
권장: OpenZeppelin AccessControl 또는 Ownable2Step 사용
역할 구분:
  - DEFAULT_ADMIN_ROLE: 최상위 관리자
  - PAUSER_ROLE: 긴급 정지 권한
  - MINTER_ROLE: HHUSD 발행 (Treasury만)
  - UPGRADER_ROLE: 업그레이드 권한 (Timelock만)
```

### Timelock 설정
```
권장 딜레이:
  - 수수료 변경: 48시간
  - 컨트랙트 업그레이드: 72시간
  - 주소 변경: 24시간
```

---

## 4. 추가 권장 컨트랙트

### GroupRegistry.sol (신규 제안)
```
목적: 모든 그룹의 중앙 등록소
기능:
  - 활성 그룹 목록 관리
  - 사용자별 참여 그룹 조회
  - 그룹 통계 집계
```

### ReferralRegistry.sol (신규 제안)
```
목적: Treasury에서 분리된 추천 로직
기능:
  - 추천 관계 영구 기록
  - 추천 수익 누적 조회
  - 다단계 추천 (향후 확장)
```

---

## 5. MVP 이후 로드맵 제안

```
Phase 1 (MVP):
  ✓ USDT 입출금
  ✓ 퍼블릭/프라이빗 그룹
  ✓ 담보 시스템
  ✓ 추천 시스템

Phase 2:
  → Chainlink VRF 랜덤 배정
  → Chainlink Automation 자동 사이클
  → HH 거버넌스 토큰
  → 멀티 체인 확장 (Polygon, Arbitrum)

Phase 3:
  → Yield 통합 (Aave/Compound로 idle USDT 운용)
  → DAO 투표
  → 평판 시스템
  → USDC, DAI 추가 지원
```

---

## 6. 요약 체크리스트

- [ ] Chainlink VRF 랜덤 배정 적용
- [ ] Chainlink Automation 사이클 자동화
- [ ] Proxy 패턴 명시 (UUPS 권장)
- [ ] Timelock 딜레이 수치 명시
- [ ] 사이클 간격 파라미터 추가
- [ ] CANCELLED 상태 환불 로직 완성
- [ ] ReentrancyGuard 전 컨트랙트 적용
- [ ] AccessControl 역할 분리
- [ ] 입금 최소/최대 한도 설정
- [ ] GroupRegistry 추가 고려
- [ ] BSC Testnet 배포 계획 수립
- [ ] 외부 감사(Audit) 일정 수립
