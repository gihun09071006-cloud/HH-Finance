import { useState, useEffect } from "react";
import { useHHFinance } from "./src/useHHFinance.js";

const STATE_COLOR = {
  ENROLLING: "#7EB8F7", POSITION_SELECTION: "#F7C97E",
  PENDING_VRF: "#F7A97E", ACTIVE: "#A8F77E",
  COMPLETED: "#C8C8C8", CANCELLED: "#F77E7E",
};

export default function HHFinanceDashboard() {
  const {
    account, chainId, loading, txHash, error,
    hhusdBal, lockedCol, groupInfo, memberInfo, payoutSchedule,
    connect, refresh,
    mintTestUSDT, depositUSDT, redeemHHUSD,
    joinGroup, contribute, topUpCollateral,
    getUSDTBalance, ADDR,
  } = useHHFinance();

  const [tab, setTab]               = useState("dashboard");
  const [depositAmt, setDepositAmt] = useState("1000");
  const [redeemAmt, setRedeemAmt]   = useState("100");
  const [topUpAmt, setTopUpAmt]     = useState("500");
  const [usdtBal, setUsdtBal]       = useState("0");

  useEffect(() => {
    if (account) getUSDTBalance().then(setUsdtBal);
  }, [account, hhusdBal]);

  const short = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : "";
  const fmt   = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const card = (title, value, sub, color = "#7EB8F7") => (
    <div style={styles.card}>
      <div style={{ color: "#aaa", fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div style={{ color, fontSize: 26, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const btn = (label, onClick, color = "#7EB8F7", disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{ ...styles.btn, background: disabled || loading ? "#333" : color }}
    >
      {loading ? "처리 중..." : label}
    </button>
  );

  // ── 지갑 미연결 화면 ────────────────────────────────────────────────────
  if (!account) return (
    <div style={styles.root}>
      <div style={styles.center}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>💎</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#7EB8F7", marginBottom: 8 }}>HH Finance</div>
        <div style={{ color: "#aaa", marginBottom: 32 }}>탈중앙화 계 시스템 (Rotating Credit DeFi)</div>
        {error && <div style={styles.error}>{error}</div>}
        <button onClick={connect} style={{ ...styles.btn, background: "#7EB8F7", fontSize: 16, padding: "14px 40px" }}>
          🦊 MetaMask 연결
        </button>
        <div style={{ color: "#555", fontSize: 12, marginTop: 20 }}>
          Hardhat 로컬 네트워크 (ChainID: 31337)
        </div>
      </div>
    </div>
  );

  return (
    <div style={styles.root}>
      {/* 헤더 */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>💎</span>
          <span style={{ fontWeight: 700, fontSize: 18, color: "#7EB8F7" }}>HH Finance</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>Chain: {chainId}</span>
          <div style={styles.walletBadge}>
            <span style={{ color: "#A8F77E", marginRight: 6 }}>●</span>
            {short(account)}
          </div>
          <button onClick={refresh} style={{ ...styles.btn, padding: "6px 14px", fontSize: 12 }}>↻ 새로고침</button>
        </div>
      </div>

      {/* 알림 */}
      {txHash && (
        <div style={styles.success}>✅ TX: {txHash.slice(0, 20)}... 완료</div>
      )}
      {error && <div style={styles.error}>⚠️ {error}</div>}

      {/* 탭 */}
      <div style={styles.tabs}>
        {[["dashboard","대시보드"], ["deposit","입출금"], ["group","그룹"], ["collateral","담보"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...styles.tabBtn, ...(tab === k ? styles.tabActive : {}) }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 대시보드 탭 ── */}
      {tab === "dashboard" && (
        <div>
          <div style={styles.grid4}>
            {card("HHUSD 잔액", `${fmt(hhusdBal)} HHUSD`, "내 지갑 잔액", "#7EB8F7")}
            {card("USDT 잔액", `${fmt(usdtBal)} USDT`, "스테이블코인", "#A8F77E")}
            {card("잠긴 담보", `${fmt(lockedCol)} HHUSD`, "전체 그룹 합산", "#F7C97E")}
            {card("그룹 상태",
              groupInfo ? groupInfo.stateName : "—",
              groupInfo ? `사이클 ${groupInfo.cycle}/${groupInfo.totalCycles}` : "",
              STATE_COLOR[groupInfo?.stateName] || "#888"
            )}
          </div>

          {memberInfo && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>내 멤버 정보</div>
              <div style={styles.infoGrid}>
                <div><span style={styles.label}>포지션</span> <span style={styles.val}>#{memberInfo.position}</span></div>
                <div><span style={styles.label}>상태</span> <span style={{ ...styles.val, color: memberInfo.status === "ACTIVE" ? "#A8F77E" : "#F77E7E" }}>{memberInfo.status}</span></div>
                <div><span style={styles.label}>미납 횟수</span> <span style={styles.val}>{memberInfo.missedPayments}회</span></div>
                <div><span style={styles.label}>지급 수령</span> <span style={styles.val}>{memberInfo.hasReceivedPayout ? "✅ 완료" : "⏳ 대기"}</span></div>
              </div>
              {memberInfo.missedPayments > 0 && (
                <div style={{ background: "#3a1a1a", border: "1px solid #F77E7E", borderRadius: 8, padding: 12, marginTop: 12, color: "#F77E7E", fontSize: 13 }}>
                  ⚠️ 미납 {memberInfo.missedPayments}회 - 총 사이클의 80% 이상 미납 시 담보가 몰수될 수 있습니다.
                </div>
              )}
            </div>
          )}

          {groupInfo && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>그룹 #1 현황</div>
              <div style={styles.infoGrid}>
                <div><span style={styles.label}>기여금</span> <span style={styles.val}>{groupInfo.contribution} HHUSD</span></div>
                <div><span style={styles.label}>멤버 수</span> <span style={styles.val}>{groupInfo.memberCount}명</span></div>
                <div><span style={styles.label}>현재 사이클</span> <span style={styles.val}>{groupInfo.cycle}/{groupInfo.totalCycles}</span></div>
                <div><span style={styles.label}>상태</span>
                  <span style={{ ...styles.val, color: STATE_COLOR[groupInfo.stateName] }}>{groupInfo.stateName}</span>
                </div>
              </div>
              {groupInfo.totalCycles > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>진행률</div>
                  <div style={{ background: "#222", borderRadius: 4, height: 8 }}>
                    <div style={{ background: "#7EB8F7", width: `${(groupInfo.cycle / groupInfo.totalCycles) * 100}%`, height: "100%", borderRadius: 4 }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 컨트랙트 주소 */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>컨트랙트 주소</div>
            {Object.entries(ADDR).map(([name, addr]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #222", fontSize: 12 }}>
                <span style={{ color: "#aaa" }}>{name}</span>
                <span style={{ color: "#7EB8F7", fontFamily: "monospace" }}>{short(addr)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 입출금 탭 ── */}
      {tab === "deposit" && (
        <div>
          <div style={styles.grid2}>
            {/* USDT → HHUSD */}
            <div style={styles.panel}>
              <div style={styles.sectionTitle}>USDT → HHUSD (입금)</div>
              <div style={{ color: "#aaa", fontSize: 12, marginBottom: 12 }}>수수료 2.5% 차감 후 HHUSD 발행</div>
              <input
                type="number" value={depositAmt}
                onChange={e => setDepositAmt(e.target.value)}
                style={styles.input} placeholder="금액 (USDT)"
              />
              <div style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>
                예상 수령: {fmt(Number(depositAmt) * 0.975)} HHUSD
              </div>
              {btn("입금하기", () => depositUSDT(depositAmt), "#7EB8F7")}
              <div style={{ borderTop: "1px solid #333", marginTop: 16, paddingTop: 12 }}>
                <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>테스트용 USDT 받기</div>
                {btn("🚰 USDT 1000개 받기", () => mintTestUSDT(1000), "#555")}
              </div>
            </div>

            {/* HHUSD → USDT */}
            <div style={styles.panel}>
              <div style={styles.sectionTitle}>HHUSD → USDT (출금)</div>
              <div style={{ color: "#aaa", fontSize: 12, marginBottom: 12 }}>수수료 2.5% 차감 후 USDT 반환</div>
              <input
                type="number" value={redeemAmt}
                onChange={e => setRedeemAmt(e.target.value)}
                style={styles.input} placeholder="금액 (HHUSD)"
              />
              <div style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>
                예상 수령: {fmt(Number(redeemAmt) * 0.975)} USDT
              </div>
              {btn("출금하기", () => redeemHHUSD(redeemAmt), "#A8F77E")}
              <div style={{ background: "#1a2a1a", border: "1px solid #3a5a3a", borderRadius: 8, padding: 12, marginTop: 16, fontSize: 12, color: "#A8F77E" }}>
                💡 보유 HHUSD: {fmt(hhusdBal)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 그룹 탭 ── */}
      {tab === "group" && (
        <div>
          {groupInfo && (
            <div style={styles.section}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={styles.sectionTitle}>그룹 #1</div>
                <span style={{ background: STATE_COLOR[groupInfo.stateName], color: "#000", borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                  {groupInfo.stateName}
                </span>
              </div>

              <div style={styles.infoGrid}>
                <div><span style={styles.label}>기여금</span> <span style={styles.val}>{groupInfo.contribution} HHUSD/사이클</span></div>
                <div><span style={styles.label}>멤버</span> <span style={styles.val}>{groupInfo.memberCount}/20명</span></div>
                <div><span style={styles.label}>현재 사이클</span> <span style={styles.val}>{groupInfo.cycle}/{groupInfo.totalCycles}</span></div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                {groupInfo.stateName === "ENROLLING" && !memberInfo &&
                  btn("그룹 참여 (담보 1400 HHUSD 필요)", joinGroup, "#7EB8F7")}
                {groupInfo.stateName === "ACTIVE" && memberInfo && memberInfo.status !== "REMOVED" &&
                  btn("기여금 납부", contribute, "#A8F77E")}
              </div>

              {groupInfo.stateName === "ENROLLING" && (
                <div style={{ background: "#1a2a3a", border: "1px solid #7EB8F7", borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12, color: "#7EB8F7" }}>
                  💡 그룹 참여 조건: HHUSD 1400개 이상 보유 (기여금 100 × 10사이클 × 140% 담보)
                </div>
              )}
            </div>
          )}

          {payoutSchedule.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>지급 스케줄</div>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {payoutSchedule.map((addr, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222", fontSize: 13 }}>
                    <span style={{ color: "#aaa" }}>사이클 {i + 1}</span>
                    <span style={{
                      color: addr === account ? "#A8F77E" :
                             addr === "0x0000000000000000000000000000000000000000" ? "#555" : "#7EB8F7",
                      fontFamily: "monospace"
                    }}>
                      {addr === "0x0000000000000000000000000000000000000000" ? "미배정" :
                       addr === account ? `${short(addr)} (나)` : short(addr)}
                    </span>
                    <span style={{ color: i + 1 < (groupInfo?.cycle || 0) ? "#A8F77E" : i + 1 === groupInfo?.cycle ? "#F7C97E" : "#555", fontSize: 12 }}>
                      {i + 1 < (groupInfo?.cycle || 0) ? "✅ 완료" : i + 1 === groupInfo?.cycle ? "▶ 진행중" : "대기"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 담보 탭 ── */}
      {tab === "collateral" && (
        <div>
          <div style={styles.grid2}>
            <div style={styles.panel}>
              <div style={styles.sectionTitle}>담보 현황</div>
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: "#F7C97E" }}>{fmt(lockedCol)}</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>HHUSD 잠김</div>
              </div>
              {memberInfo && (
                <div style={styles.infoGrid}>
                  <div><span style={styles.label}>그룹 담보</span> <span style={styles.val}>{fmt(memberInfo.collateral)} HHUSD</span></div>
                  <div><span style={styles.label}>상태</span> <span style={{ ...styles.val, color: memberInfo.status === "ACTIVE" ? "#A8F77E" : "#F77E7E" }}>{memberInfo.status}</span></div>
                  <div><span style={styles.label}>미납 횟수</span> <span style={styles.val}>{memberInfo.missedPayments}회 / {groupInfo?.totalCycles || 10}사이클</span></div>
                </div>
              )}
            </div>

            <div style={styles.panel}>
              <div style={styles.sectionTitle}>담보 재충전 (Top-up)</div>
              <div style={{ color: "#aaa", fontSize: 12, marginBottom: 12 }}>
                미납으로 차감된 담보를 보충할 수 있습니다.<br />
                총 사이클의 80% 이상 미납 시 담보 몰수 위험!
              </div>
              <input
                type="number" value={topUpAmt}
                onChange={e => setTopUpAmt(e.target.value)}
                style={styles.input} placeholder="충전 금액 (HHUSD)"
              />
              {btn("담보 충전", () => topUpCollateral(topUpAmt), "#F7C97E",
                !memberInfo || memberInfo.status === "REMOVED")}

              {memberInfo && Number(memberInfo.missedPayments) >= Number(groupInfo?.totalCycles || 10) * 0.8 && (
                <div style={{ background: "#3a1a1a", border: "1px solid #F77E7E", borderRadius: 8, padding: 12, marginTop: 16, fontSize: 12, color: "#F77E7E" }}>
                  🚨 경고: 80% 임계치 도달! 지금 충전하지 않으면 그룹 완료 시 잔여 담보가 개발자 30% / 이벤트 70%로 분배됩니다.
                </div>
              )}
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>담보 구조 안내</div>
            <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.8 }}>
              <div>• 담보 = 기여금(100) × 총 사이클(10) × 140% = <span style={{ color: "#F7C97E" }}>1,400 HHUSD</span></div>
              <div>• 미납 시: 담보에서 기여금 차감 → 해당 사이클 수령인에게 지급</div>
              <div>• 그룹 완료 후 성실 납부 유저: <span style={{ color: "#A8F77E" }}>담보 전액 환불</span></div>
              <div>• 그룹 완료 후 미납 이력 유저: 잔여 담보 <span style={{ color: "#F77E7E" }}>30% 개발자 / 70% 이벤트 지갑</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 스타일 ──────────────────────────────────────────────────────────────────
const styles = {
  root: { background: "#0d0d0d", minHeight: "100vh", color: "#e0e0e0", fontFamily: "'Inter', sans-serif" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: "#111", borderBottom: "1px solid #222" },
  walletBadge: { background: "#1a1a2e", border: "1px solid #7EB8F7", borderRadius: 20, padding: "4px 12px", fontSize: 13, color: "#ccc" },
  tabs: { display: "flex", gap: 4, padding: "12px 24px", background: "#111", borderBottom: "1px solid #222" },
  tabBtn: { background: "none", border: "1px solid #333", borderRadius: 6, color: "#aaa", padding: "6px 16px", cursor: "pointer", fontSize: 13 },
  tabActive: { background: "#1a2a3a", border: "1px solid #7EB8F7", color: "#7EB8F7" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: 24 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 24 },
  card: { background: "#111", border: "1px solid #222", borderRadius: 10, padding: 16 },
  panel: { background: "#111", border: "1px solid #222", borderRadius: 10, padding: 20 },
  section: { background: "#111", border: "1px solid #222", borderRadius: 10, padding: 20, margin: "0 24px 16px" },
  sectionTitle: { fontWeight: 700, fontSize: 15, marginBottom: 14, color: "#fff" },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  label: { color: "#888", fontSize: 12, marginRight: 6 },
  val: { color: "#fff", fontWeight: 600, fontSize: 13 },
  btn: { border: "none", borderRadius: 8, color: "#000", fontWeight: 700, padding: "10px 20px", cursor: "pointer", fontSize: 13, marginBottom: 8, width: "100%" },
  input: { width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", padding: "10px 12px", fontSize: 14, marginBottom: 8, boxSizing: "border-box" },
  error: { background: "#3a1a1a", border: "1px solid #F77E7E", borderRadius: 8, color: "#F77E7E", padding: "10px 24px", margin: "8px 24px", fontSize: 13 },
  success: { background: "#1a3a1a", border: "1px solid #A8F77E", borderRadius: 8, color: "#A8F77E", padding: "10px 24px", margin: "8px 24px", fontSize: 13 },
};
