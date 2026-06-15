# HHUSD 그룹 기여금 처리 방식 분석 및 권장안

---

## 문제 정의

HHUSD는 **Non-Transferable ERC20**으로 설계됨:
```solidity
function transfer()     → revert HHUSDNotTransferable
function transferFrom() → revert HHUSDNotTransferable
```

따라서 그룹 멤버가 매 사이클마다 기여금(예: 100 HHUSD)을 **그룹 컨트랙트 또는 수령인에게 이동**시키는 일반적인 방법이 없음.

---

## 검토한 4가지 방식

---

### ❌ 방식 A: HHUSD에 protocol transfer 추가
```solidity
// HHUSD.sol에 추가
function protocolTransfer(address from, address to, uint256 amount)
    external onlyRole(TRANSFER_ROLE) { ... }
```

**원리:** GROUP_ROLE을 가진 그룹 컨트랙트가 사용자 HHUSD를 강제 이동

**문제점:**
- Non-Transferable 설계 철학 훼손
- 그룹 컨트랙트에 사용자 자산 강제 인출 권한 부여
- TRANSFER_ROLE 탈취 시 전체 HHUSD 잔액 위험
- 사용자 입장에서 "내 자산이 프로토콜에 의해 언제든 이동 가능"

→ **보안 리스크가 너무 높아 권장하지 않음**

---

### ❌ 방식 B: Burn-and-Mint 패턴
```
기여금 납부:
  1. Group.contribute() 호출
  2. HHUSD.burn(member, amount)
  3. HHUSD.mint(groupContract, amount)

수령인 지급:
  1. HHUSD.burn(groupContract, totalPool)
  2. HHUSD.mint(recipient, totalPool)
```

**문제점:**
- 그룹 컨트랙트가 MINTER_ROLE + BURNER_ROLE 모두 보유 → 과도한 권한
- 그룹 컨트랙트 해킹 시 무제한 HHUSD 발행 가능
- totalSupply 통계가 부정확해짐 (burn/mint 반복으로 인한 왜곡)
- 복잡한 권한 체계로 감사 난이도 상승

→ **권한 집중 문제로 권장하지 않음**

---

### ✅ 방식 C: USDT 직접 기여 (HHUSD는 담보 전용)
```
설계 원칙:
  - HHUSD = 내부 회계 + 담보 관리 전용
  - 그룹 기여금/수령금 = USDT로 처리
  - 두 자산의 역할을 명확히 분리
```

**흐름:**
```
[입금]
User → Treasury.depositUSDT(100) → HHUSD 100 발행 (잔액 표시용)

[그룹 가입]
User → CollateralVault.lockCollateral(100 HHUSD) → 담보 고정

[매 사이클 기여]
User → Group.contribute() → USDT 100 직접 전송 → Group Pool

[지급]
Group → USDT 1,000 → 수령인 지갑

[그룹 완료]
CollateralVault → HHUSD 100 언락 → User 담보 반환
```

**USDT 잔고 관리:**
- 사용자는 Treasury에서 받은 HHUSD를 담보로 잠그고
- 그룹 기여금은 별도의 USDT 잔액에서 납부
- 또는 그룹 참여 전 HHUSD 일부를 Treasury에서 redeem하여 USDT 확보

**장점:**
- 가장 단순하고 감사하기 쉬운 구조
- HHUSD 전송 문제 완전 회피
- USDT는 표준 ERC20이므로 안전한 transferFrom 사용
- 멤버별 USDT 기여 여부 온체인 추적 가능

**단점:**
- 멤버가 USDT를 그룹 컨트랙트에 approve() 해야 함
- HHUSD 잔액과 실제 그룹 참여가 분리되어 UX 복잡

---

### ✅✅ 방식 D: Treasury 중개 패턴 (최우선 권장)
```
핵심 아이디어:
  - USDT는 항상 Treasury 안에 있음 (최고 보안)
  - 그룹 컨트랙트는 USDT에 직접 접근 불가
  - Treasury가 그룹 컨트랙트의 지시에 따라 USDT만 이동
  - HHUSD는 순수 내부 회계 토큰으로 유지
```

**구체적 흐름:**
```
[그룹 기여금 납부]
Member → Treasury.contributeToGroup(groupId, amount)
  └─ Treasury: USDT balanceOf(member) 검증
  └─ Treasury: groupContributions[groupId][member] += amount
  └─ Treasury: groupPool[groupId] += amount
  (실제 USDT는 Treasury 내에 머묾)

[자동 지급]
Group Contract → Treasury.executeGroupPayout(groupId, cycleNumber)
  └─ Treasury: 권한 검증 (group must have PAYOUT_ROLE)
  └─ Treasury: recipient = group.getPayoutRecipient(cycleNumber)
  └─ Treasury: USDT 전송 to recipient

[담보 연동]
HHUSD는 CollateralVault에서만 lock/unlock
Treasury의 USDT pool과 독립적으로 관리
```

**Treasury 추가 변수:**
```solidity
// groupId => member => amount contributed this cycle
mapping(uint256 => mapping(address => uint256)) public groupContributions;

// groupId => total USDT pool
mapping(uint256 => uint256) public groupPool;

// groupId => cycle => bool paid out
mapping(uint256 => mapping(uint256 => bool)) public cyclePayoutExecuted;
```

**Treasury 추가 함수:**
```solidity
function contributeToGroup(
    uint256 groupId,
    uint256 cycleNumber,
    uint256 amount
) external nonReentrant whenNotPaused {
    require(IGroupRegistry(groupRegistry).isActiveGroup(groupId), "Invalid group");
    require(amount == IGroupRegistry(groupRegistry).getContributionAmount(groupId), "Wrong amount");

    usdtToken.safeTransferFrom(msg.sender, address(this), amount);
    groupContributions[groupId][msg.sender] += amount;
    groupPool[groupId] += amount;

    emit GroupContribution(groupId, msg.sender, cycleNumber, amount);
}

function executeGroupPayout(
    uint256 groupId,
    uint256 cycleNumber,
    address recipient
) external onlyRole(PAYOUT_EXECUTOR_ROLE) nonReentrant {
    require(!cyclePayoutExecuted[groupId][cycleNumber], "Already paid");

    uint256 poolBalance = groupPool[groupId];
    require(poolBalance > 0, "Empty pool");

    cyclePayoutExecuted[groupId][cycleNumber] = true;
    groupPool[groupId] = 0;

    usdtToken.safeTransfer(recipient, poolBalance);
    emit GroupPayout(groupId, cycleNumber, recipient, poolBalance);
}
```

**장점:**
- USDT가 Treasury에서 절대 이탈하지 않음 (가장 높은 보안)
- 그룹 컨트랙트는 USDT에 직접 접근 불가
- Admin도 개별 그룹 자금에 접근 불가
- 감사 범위가 Treasury 단일 컨트랙트로 집중
- 그룹 컨트랙트 해킹 시 피해 최소화

**단점:**
- Treasury 로직이 복잡해짐
- GroupRegistry 추가 필요
- Group과 Treasury 간 신뢰 관계 설계 필요

---

## 최종 권장 아키텍처

```
[ 자산 흐름 ]
USDT ──→ Treasury ←──────────────── 항상 Treasury에 머묾
                  │
                  ├─ groupPool[id] ──→ 수령인 (executeGroupPayout)
                  └─ feeReceiver     ──→ 수수료 수령자

[ 회계 흐름 ]
Treasury → HHUSD.mint() ──→ 사용자 잔액 (담보 전용)
CollateralVault → HHUSD lock/unlock/slash

[ 그룹 흐름 ]
PublicGroupVRF ──→ Treasury.contributeToGroup() ──→ USDT pooling
               ──→ Treasury.executeGroupPayout() ──→ USDT 지급
               ──→ CollateralVault.slashCollateral() ──→ HHUSD 소각
```

---

## 구현 체크리스트

- [ ] Treasury에 `groupPool` 매핑 추가
- [ ] Treasury에 `contributeToGroup()` 구현
- [ ] Treasury에 `executeGroupPayout()` 구현
- [ ] GroupRegistry 컨트랙트 추가 (그룹 유효성 검증용)
- [ ] PAYOUT_EXECUTOR_ROLE을 Group 컨트랙트에 부여
- [ ] 기여금 미납 시 Treasury에서 직접 처리 (Group → Treasury.markMissed())
- [ ] 그룹 취소 시 groupPool 전액 환불 로직
- [ ] cyclePayoutExecuted 중복 실행 방지

---

## HHUSD 역할 재정의 (최종)

| 역할 | HHUSD | USDT |
|------|-------|------|
| 내부 잔액 표시 | ✅ | ❌ |
| 담보 잠금 | ✅ (CollateralVault) | ❌ |
| 그룹 기여금 | ❌ | ✅ (Treasury Pool) |
| 지급금 | ❌ | ✅ (Treasury → 수령인) |
| 수수료 | ❌ | ✅ (Treasury → feeReceiver) |
| 추천 보상 | ❌ | ✅ (Treasury → referrer) |

HHUSD = "내 계좌에 예치된 총액을 표시하는 영수증 토큰"
USDT  = "실제로 움직이는 자산"

이 분리가 명확해야 Non-Transferable 설계 의도가 살고 보안도 최대화됨.
