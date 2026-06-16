import { useLang } from "../i18n/LanguageContext.jsx";

// 다국어 화이트페이퍼 콘텐츠
const WP = {
  ko: {
    title:    "HH Finance 화이트페이퍼",
    subtitle: "탈중앙화 순환 신용 프로토콜 (Decentralized Rotating Credit Protocol)",
    version:  "v1.0 · 2025",
    toc: ["개요", "핵심 가치", "시스템 구조", "스마트컨트랙트", "토크노믹스", "보안", "로드맵"],
    sections: [
      {
        id: "overview", title: "1. 개요 (Overview)",
        content: `HH Finance는 전통적인 계모임(Rotating Credit System)을 블록체인 위에서 완전히 탈중앙화한 금융 프로토콜입니다.

계모임은 구성원들이 매 회차 일정 금액을 납입하고, 순번에 따라 전액을 수령하는 상호 신용 시스템으로, 한국을 비롯해 아프리카(에수수), 중남미(탄다), 동남아(아리산)에서 수천 년 동안 이어져 온 금융 문화입니다.

HH Finance는 이 전통적인 계모임을 스마트컨트랙트로 구현하여:
• 중개자 없이 투명하게 운영
• 담보 시스템으로 미납 리스크 제거
• 전 세계 누구나 참여 가능한 글로벌 계모임 플랫폼을 제공합니다.`
      },
      {
        id: "values", title: "2. 핵심 가치",
        cards: [
          { icon: "🔍", title: "투명성 (Transparency)", desc: "모든 자금 이동, 담보 잠금·해제, 납입, 지급이 블록체인에 영구 기록됩니다. 어떤 중개자도 자금에 접근하거나 조작할 수 없습니다." },
          { icon: "⚖️", title: "공정성 (Fairness)", desc: "순번 배정은 입장 순서 기반 결정론적 알고리즘으로 처리됩니다. 랜덤 조작 불가, 특정인 우대 불가. 원하는 순번을 먼저 선택할 수 있는 선택권도 보장합니다." },
          { icon: "🛡️", title: "안전성 (Security)", desc: "OpenZeppelin v5 감사된 라이브러리 사용, ReentrancyGuard 재진입 공격 방어, 역할 기반 접근 제어(RBAC), UUPS 업그레이드 패턴으로 보안을 다층 구조로 유지합니다." },
          { icon: "🌐", title: "접근성 (Accessibility)", desc: "스마트폰과 MetaMask만 있으면 전 세계 누구나 계모임에 참여할 수 있습니다. 은행 계좌, 신용 점수, 신분증이 불필요합니다." },
          { icon: "🤝", title: "무신뢰성 (Trustless)", desc: "계장(방장)도, 운영자도, 어떤 제3자도 자금을 직접 보유하거나 이동시킬 수 없습니다. 모든 규칙은 코드로 강제됩니다." },
          { icon: "💡", title: "유연성 (Flexibility)", desc: "자동화방(고정 티어)과 커스텀방(자유 파라미터) 두 가지 유형으로 다양한 니즈를 충족합니다. 2명부터 29명, 기여금 자유 설정 가능." },
        ]
      },
      {
        id: "structure", title: "3. 시스템 구조",
        content: `HH Finance는 두 가지 방 유형을 지원합니다:

━━ 자동화방 (AutoGroup) ━━
• 기여금 티어: 10 / 20 / 50 / 100 / 200 HHUSD
• 최소 10명 입장 시 24시간 카운트다운 자동 시작
• 최대 28명까지 모집, 이후 새 방 자동 생성
• 12시간 순번 선택 창 → 미선택자는 입장 순서대로 자동 배정
• 실제 시작 인원 기준으로 담보 차액 자동 환불

━━ 커스텀방 (CustomGroup) ━━
• 계장(방장)이 기여금, 최대 인원(2~29명), 납입 기한, 모집 기간 직접 설정
• 방 생성 시 계장의 담보가 즉시 잠김 (장난 방지)
• 계장 권한: 멤버 강퇴, 조기 마감, 방 취소 (전원 담보 환불)

━━ 진행 흐름 ━━
ENROLLING → POSITION_SELECTION → ACTIVE → COMPLETED
    ↓                                          ↓
  (미충족)                               (순환 완료)
CANCELLED                            담보 전액 환불`
      },
      {
        id: "contracts", title: "4. 스마트컨트랙트 구조",
        contracts: [
          {
            name: "HHUSD", role: "프로토콜 내부 통화",
            desc: "USD 페깅 스테이블코인. 담보 잠금 및 계 납입에 사용. MINTER/BURNER 역할로 접근 제어. 일반 transfer 불가(보안).",
            badge: "UUPS Upgradeable"
          },
          {
            name: "CollateralVault", role: "담보 관리 금고",
            desc: "HHUSD를 논리적으로 잠금 관리. 실제 토큰은 사용자 지갑에 머물고 vault가 권한만 추적. getGroupCollateral(), lockCollateral(), unlockCollateral(), slashCollateral() 함수로 담보 생애주기 관리.",
            badge: "UUPS Upgradeable"
          },
          {
            name: "AutoGroup", role: "자동화 계모임 계약",
            desc: "10~28명 자동 계모임 방. joinGroup(), selectPosition(), closeEnrollment(), finalizePositions(), contribute(), distributePayout() 순서로 라이프사이클 진행. warningMissedPayment()로 미납자 담보 차감.",
            badge: "Non-upgradeable"
          },
          {
            name: "AutoGroupFactory", role: "자동화방 팩토리",
            desc: "5개 티어(10/20/50/100/200 HHUSD)별로 AutoGroup 컨트랙트를 자동 배포·관리. 방이 가득 차면 다음 방 자동 생성. GROUP_ROLE을 자동 부여.",
            badge: "Non-upgradeable"
          },
          {
            name: "CustomGroup", role: "커스텀 계모임 계약",
            desc: "계장이 파라미터를 설정하는 계모임 방. kickMember(), cancelGroup() 계장 전용 기능 포함. 2~29명, 기여금 자유 설정.",
            badge: "Non-upgradeable"
          },
          {
            name: "CustomGroupFactory", role: "커스텀방 팩토리",
            desc: "계장이 createGroup()으로 방을 생성하면 담보가 즉시 잠김. getAllGroupInfos()로 전체 방 목록+상태 한 번에 조회. GROUP_ROLE 자동 부여.",
            badge: "Non-upgradeable"
          },
        ]
      },
      {
        id: "tokenomics", title: "5. 토크노믹스 & 담보 시스템",
        content: `━━ 담보 비율: 140% ━━
납입액 × 사이클 수 × 140%를 사전 잠금하여 미납 리스크를 원천 차단합니다.

예) 50 HHUSD × 10사이클 × 140% = 700 HHUSD 담보 필요

━━ 초과 담보 환불 ━━
28명 기준 방이 12명으로 시작되면:
• 기존 잠금: 기여금 × 28 × 140%
• 실제 필요: 기여금 × 12 × 140%
• 차액(16사이클분)을 방 시작 시 자동 환불

━━ 미납 처리 ━━
1회 미납 → WARNED 상태 + 담보 1사이클분 차감
2회 미납 → PENALIZED 상태 + 추가 차감
담보 소진 시 → 강제 REMOVED + 잔여 담보 그룹 분배

━━ 수수료 구조 ━━
• 현재: 0% (초기 성장 단계)
• 향후: 지급액의 소량 프로토콜 수수료 예정`
      },
      {
        id: "security", title: "6. 보안",
        items: [
          "OpenZeppelin v5 검증된 라이브러리 사용 (AccessControl, ReentrancyGuard, UUPS)",
          "모든 외부 호출 함수에 nonReentrant 적용",
          "역할 기반 접근 제어: ADMIN_ROLE, CONFIG_ROLE, GROUP_ROLE, MINTER_ROLE, BURNER_ROLE",
          "Factory 컨트랙트만 GROUP_ROLE 발급 가능 (DEFAULT_ADMIN 위임)",
          "warningMissedPayment: keeper 또는 devWallet만 호출 가능",
          "distributePayout: 수취인 주소 0 체크, 사이클 오버플로우 방지",
          "try-catch 패턴: 개별 멤버 환불 실패가 전체 트랜잭션 롤백 방지",
          "UUPS 업그레이드: UPGRADER_ROLE 보유자만 가능, 향후 멀티시그로 전환 예정",
        ]
      },
      {
        id: "roadmap", title: "7. 로드맵",
        phases: [
          { phase: "Phase 1", status: "완료", title: "핵심 프로토콜 구축", items: ["HHUSD 스테이블코인", "CollateralVault 담보 시스템", "AutoGroup / CustomGroup 계약", "Factory 패턴 구현", "보안 감사 & 테스트 211개 통과"] },
          { phase: "Phase 2", status: "진행 중", title: "프론트엔드 & 테스트넷", items: ["다국어 UI (11개 언어)", "AutoGroupFactory UI 연동", "CustomGroupFactory UI 연동", "BSC 테스트넷 배포"] },
          { phase: "Phase 3", status: "예정", title: "자동화 & 운영", items: ["Chainlink Automation Keeper 봇", "BSC 메인넷 배포", "실제 USDT 연동", "멀티시그(Gnosis Safe) 도입"] },
          { phase: "Phase 4", status: "예정", title: "생태계 확장", items: ["모바일 앱", "커뮤니티 거버넌스", "추가 체인 지원 (Polygon, Arbitrum)", "전통 금융기관 파트너십"] },
        ]
      }
    ]
  },
  en: {
    title:    "HH Finance Whitepaper",
    subtitle: "Decentralized Rotating Credit Protocol",
    version:  "v1.0 · 2025",
    toc: ["Overview", "Core Values", "System Structure", "Smart Contracts", "Tokenomics", "Security", "Roadmap"],
    sections: [
      { id:"overview", title:"1. Overview", content:`HH Finance is a fully decentralized blockchain implementation of the traditional Rotating Credit System (known as "Kye" in Korea, "Susu" in Africa, "Tanda" in Latin America, "Arisan" in Southeast Asia).

Members contribute a fixed amount each cycle, and each member receives the full pool once per rotation — a mutual credit system practiced for thousands of years across cultures.

HH Finance brings this to blockchain:
• Transparent operation without intermediaries
• Collateral system eliminates default risk
• Global accessibility for anyone with a smartphone` },
      { id:"values", title:"2. Core Values", cards:[
        { icon:"🔍", title:"Transparency", desc:"Every fund movement, collateral lock/unlock, contribution, and payout is permanently recorded on-chain. No intermediary can access or manipulate funds." },
        { icon:"⚖️", title:"Fairness", desc:"Position assignment uses deterministic join-order algorithms. No random manipulation, no favoritism. Members can choose preferred positions during the selection window." },
        { icon:"🛡️", title:"Security", desc:"OpenZeppelin v5 audited libraries, ReentrancyGuard, role-based access control (RBAC), and UUPS upgrade patterns provide multi-layered security." },
        { icon:"🌐", title:"Accessibility", desc:"Anyone worldwide with a smartphone and MetaMask can participate. No bank account, credit score, or ID required." },
        { icon:"🤝", title:"Trustless", desc:"No organizer, operator, or third party can directly hold or move funds. All rules are enforced by code." },
        { icon:"💡", title:"Flexibility", desc:"Auto Rooms (fixed tiers) and Custom Rooms (free parameters) serve diverse needs. 2 to 29 members, any contribution amount." },
      ]},
      { id:"structure", title:"3. System Structure", content:`Two room types supported:

━━ Auto Room (AutoGroup) ━━
• Contribution tiers: 10 / 20 / 50 / 100 / 200 HHUSD
• 24h countdown auto-starts at 10 members
• Up to 28 members; new room auto-created when full
• 12h position selection window → unselected auto-assigned by join order
• Excess collateral auto-refunded based on actual member count

━━ Custom Room (CustomGroup) ━━
• Organizer sets contribution, max members (2-29), cycle duration, enrollment period
• Organizer's collateral locked immediately on room creation (anti-spam)
• Organizer powers: kick members, early close, cancel group (full refund)

━━ Lifecycle ━━
ENROLLING → POSITION_SELECTION → ACTIVE → COMPLETED` },
      { id:"contracts", title:"4. Smart Contract Architecture", contracts:[
        { name:"HHUSD", role:"Protocol Currency", desc:"USD-pegged stablecoin used for collateral and contributions. MINTER/BURNER role access control. Non-transferable for security.", badge:"UUPS Upgradeable" },
        { name:"CollateralVault", role:"Collateral Vault", desc:"Logically locks HHUSD. Tokens stay in user wallets; vault tracks locked amounts. lockCollateral(), unlockCollateral(), slashCollateral() manage full collateral lifecycle.", badge:"UUPS Upgradeable" },
        { name:"AutoGroup", role:"Auto Room Contract", desc:"Manages 10-28 member rotating credit. Full lifecycle: joinGroup() → selectPosition() → closeEnrollment() → finalizePositions() → contribute() → distributePayout().", badge:"Non-upgradeable" },
        { name:"AutoGroupFactory", role:"Auto Room Factory", desc:"Deploys and manages AutoGroup contracts per tier. Auto-creates next room when current is full. Automatically grants GROUP_ROLE.", badge:"Non-upgradeable" },
        { name:"CustomGroup", role:"Custom Room Contract", desc:"Organizer-configured rotating credit. Includes kickMember(), cancelGroup() organizer-exclusive functions. 2-29 members, flexible contribution.", badge:"Non-upgradeable" },
        { name:"CustomGroupFactory", role:"Custom Room Factory", desc:"Organizer calls createGroup() and collateral is immediately locked. getAllGroupInfos() returns all rooms with status. Auto-grants GROUP_ROLE.", badge:"Non-upgradeable" },
      ]},
      { id:"tokenomics", title:"5. Tokenomics & Collateral", content:`━━ Collateral Ratio: 140% ━━
Contribution × Cycles × 140% pre-locked to eliminate default risk.

Example: 50 HHUSD × 10 cycles × 140% = 700 HHUSD collateral required

━━ Excess Collateral Refund ━━
If a 28-member room starts with 12 members:
• Original lock: contribution × 28 × 140%
• Actual needed: contribution × 12 × 140%
• Difference (16 cycles) auto-refunded at group start

━━ Missed Payment Handling ━━
1st miss → WARNED status + 1 cycle collateral slashed
2nd miss → PENALIZED + additional slash
Collateral depleted → REMOVED + remaining distributed to group

━━ Fee Structure ━━
• Current: 0% (growth phase)
• Future: small protocol fee on payouts` },
      { id:"security", title:"6. Security", items:[
        "OpenZeppelin v5 verified libraries (AccessControl, ReentrancyGuard, UUPS)",
        "nonReentrant applied to all external call functions",
        "Role-based access control: ADMIN_ROLE, CONFIG_ROLE, GROUP_ROLE, MINTER_ROLE, BURNER_ROLE",
        "Only Factory contracts can issue GROUP_ROLE (DEFAULT_ADMIN delegated)",
        "warningMissedPayment: callable only by keeper or devWallet",
        "distributePayout: zero-address check, cycle overflow prevention",
        "try-catch pattern: individual refund failure doesn't rollback entire transaction",
        "UUPS upgrade: UPGRADER_ROLE holders only, multisig planned",
      ]},
      { id:"roadmap", title:"7. Roadmap", phases:[
        { phase:"Phase 1", status:"Completed", title:"Core Protocol", items:["HHUSD Stablecoin","CollateralVault","AutoGroup / CustomGroup","Factory Pattern","Security Audit & 211 Tests Passing"] },
        { phase:"Phase 2", status:"In Progress", title:"Frontend & Testnet", items:["11-Language UI","AutoGroupFactory UI","CustomGroupFactory UI","BSC Testnet Deployment"] },
        { phase:"Phase 3", status:"Planned", title:"Automation & Operations", items:["Chainlink Automation Keeper","BSC Mainnet","Real USDT Integration","Gnosis Safe Multisig"] },
        { phase:"Phase 4", status:"Planned", title:"Ecosystem Expansion", items:["Mobile App","Community Governance","Multi-chain (Polygon, Arbitrum)","Traditional Finance Partnerships"] },
      ]},
    ]
  }
};

// 미지원 언어는 영어로 폴백
function getWP(lang) {
  return WP[lang] || WP["en"];
}

const STATUS_COLOR = { "완료":"#A8F77E", "진행 중":"#F7C97E", "예정":"#7EB8F7", "Completed":"#A8F77E", "In Progress":"#F7C97E", "Planned":"#7EB8F7" };

export default function WhitepaperTab() {
  const { lang } = useLang();
  const wp = getWP(lang);

  return (
    <div style={s.root}>
      {/* 타이틀 */}
      <div style={s.hero}>
        <div style={s.heroIcon}>💎</div>
        <div style={s.heroTitle}>{wp.title}</div>
        <div style={s.heroSub}>{wp.subtitle}</div>
        <div style={s.heroVer}>{wp.version}</div>
      </div>

      {/* 목차 */}
      <div style={s.toc}>
        {wp.toc.map((item, i) => (
          <a key={i} href={`#wp-${i}`} style={s.tocItem}>
            <span style={{ color: "#7EB8F7", marginRight: 6 }}>{i+1}.</span>{item}
          </a>
        ))}
      </div>

      {/* 섹션들 */}
      {wp.sections.map((sec, idx) => (
        <div key={sec.id} id={`wp-${idx}`} style={s.section}>
          <div style={s.secTitle}>{sec.title}</div>

          {/* 일반 텍스트 */}
          {sec.content && (
            <div style={s.content}>
              {sec.content.split("\n").map((line, i) => (
                <div key={i} style={line.startsWith("━") ? s.heading : line === "" ? s.spacer : s.line}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* 가치 카드 */}
          {sec.cards && (
            <div style={s.cardGrid}>
              {sec.cards.map((c, i) => (
                <div key={i} style={s.card}>
                  <div style={s.cardIcon}>{c.icon}</div>
                  <div style={s.cardTitle}>{c.title}</div>
                  <div style={s.cardDesc}>{c.desc}</div>
                </div>
              ))}
            </div>
          )}

          {/* 컨트랙트 목록 */}
          {sec.contracts && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {sec.contracts.map((c, i) => (
                <div key={i} style={s.contractRow}>
                  <div style={s.contractHeader}>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <span style={s.contractName}>{c.name}</span>
                      <span style={s.contractBadge}>{c.badge}</span>
                    </div>
                    <span style={s.contractRole}>{c.role}</span>
                  </div>
                  <div style={s.contractDesc}>{c.desc}</div>
                </div>
              ))}
            </div>
          )}

          {/* 보안 리스트 */}
          {sec.items && (
            <ul style={s.list}>
              {sec.items.map((item, i) => (
                <li key={i} style={s.listItem}>
                  <span style={{ color:"#A8F77E", marginRight:8 }}>✓</span>{item}
                </li>
              ))}
            </ul>
          )}

          {/* 로드맵 */}
          {sec.phases && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {sec.phases.map((p, i) => (
                <div key={i} style={s.phaseRow}>
                  <div style={s.phaseHeader}>
                    <span style={s.phaseLabel}>{p.phase}</span>
                    <span style={{ ...s.phaseStatus, color: STATUS_COLOR[p.status] || "#888" }}>
                      {p.status}
                    </span>
                    <span style={s.phaseTitle}>{p.title}</span>
                  </div>
                  <ul style={s.phaseList}>
                    {p.items.map((item, j) => (
                      <li key={j} style={s.phaseItem}>· {item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 푸터 */}
      <div style={s.footer}>
        <div style={{ color:"#333", fontSize:13 }}>
          © 2025 HH Finance Protocol · All smart contracts are open source
        </div>
        <div style={{ color:"#7EB8F7", fontSize:12, marginTop:4 }}>
          github.com/gihun09071006-cloud/HH-Finance
        </div>
      </div>
    </div>
  );
}

const s = {
  root: { maxWidth: 860, margin: "0 auto" },
  hero: {
    textAlign:"center", padding:"48px 24px 36px",
    background:"linear-gradient(135deg, #0a1520 0%, #0d0d0d 100%)",
    borderRadius:16, marginBottom:32, border:"1px solid #1e3a5a",
  },
  heroIcon: { fontSize:52, marginBottom:12 },
  heroTitle: { fontSize:28, fontWeight:800, color:"#7EB8F7", marginBottom:8 },
  heroSub:  { fontSize:16, color:"#888", marginBottom:8 },
  heroVer:  { fontSize:12, color:"#444", fontFamily:"monospace" },
  toc: {
    display:"flex", flexWrap:"wrap", gap:8, marginBottom:32,
    background:"#0f0f0f", border:"1px solid #1e1e1e", borderRadius:12, padding:16,
  },
  tocItem: { color:"#7EB8F7", fontSize:13, textDecoration:"none", padding:"4px 10px", borderRadius:6, background:"#0a1820" },
  section: { marginBottom:40 },
  secTitle: { fontSize:20, fontWeight:700, color:"#eee", marginBottom:18, paddingBottom:8, borderBottom:"1px solid #1e3a5a" },
  content: { color:"#bbb", fontSize:14, lineHeight:1.9, background:"#0f0f0f", borderRadius:10, padding:"20px 24px" },
  heading: { color:"#7EB8F7", fontWeight:700, marginTop:8 },
  spacer:  { height:8 },
  line:    {},
  cardGrid: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 },
  card: {
    background:"#111", border:"1px solid #1e1e1e", borderRadius:12,
    padding:"20px 18px", display:"flex", flexDirection:"column", gap:8,
  },
  cardIcon:  { fontSize:28 },
  cardTitle: { color:"#eee", fontWeight:700, fontSize:14 },
  cardDesc:  { color:"#888", fontSize:13, lineHeight:1.6 },
  contractRow: {
    background:"#0f0f0f", border:"1px solid #1e2a3a", borderRadius:10,
    padding:"16px 20px", display:"flex", flexDirection:"column", gap:8,
  },
  contractHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 },
  contractName: { color:"#7EB8F7", fontWeight:800, fontSize:16, fontFamily:"monospace" },
  contractBadge: { background:"#1a2a3a", color:"#7EB8F7", fontSize:11, padding:"2px 8px", borderRadius:12 },
  contractRole: { color:"#F7C97E", fontSize:13, fontWeight:600 },
  contractDesc: { color:"#888", fontSize:13, lineHeight:1.7 },
  list: { listStyle:"none", padding:0, margin:0, display:"flex", flexDirection:"column", gap:10 },
  listItem: { color:"#bbb", fontSize:14, lineHeight:1.6, display:"flex", alignItems:"flex-start" },
  phaseRow: {
    background:"#0f0f0f", border:"1px solid #1e1e1e", borderRadius:10, padding:"16px 20px",
  },
  phaseHeader: { display:"flex", gap:12, alignItems:"center", marginBottom:10, flexWrap:"wrap" },
  phaseLabel: { background:"#1a2a3a", color:"#7EB8F7", fontSize:12, padding:"3px 10px", borderRadius:12, fontWeight:700 },
  phaseStatus: { fontSize:12, fontWeight:700 },
  phaseTitle: { color:"#eee", fontWeight:600, fontSize:14 },
  phaseList: { listStyle:"none", padding:0, margin:0, display:"flex", flexDirection:"column", gap:4 },
  phaseItem: { color:"#888", fontSize:13 },
  footer: { textAlign:"center", padding:"32px 0 16px", borderTop:"1px solid #1a1a1a", marginTop:16 },
};
