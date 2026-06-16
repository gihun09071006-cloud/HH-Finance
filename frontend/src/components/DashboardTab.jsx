import ADDRESSES from "../deployedAddresses.json";

const STATE_COLOR = {
  ENROLLING: "#7EB8F7", POSITION_SELECTION: "#F7C97E",
  ACTIVE: "#A8F77E", COMPLETED: "#888", CANCELLED: "#F77E7E",
};

export default function DashboardTab({
  account, hhusdBal, lockedCol, usdtBal,
  mintHHUSD, contracts, onTx, loading, refreshBalances,
  autoMyGroups, customMyGroups, fmt, short,
}) {
  const allMyGroups = [
    ...autoMyGroups.map(g => ({ ...g, type: "자동화방" })),
    ...customMyGroups.map(g => ({ ...g, type: "커스텀방" })),
  ];

  return (
    <div>
      <div style={s.sectionTitle}>내 자산 현황</div>

      {/* 자산 카드 */}
      <div style={s.cardRow}>
        <Card title="HHUSD 잔액" value={`${fmt(hhusdBal)} HHUSD`} color="#7EB8F7" />
        <Card title="잠긴 담보 총액" value={`${fmt(lockedCol)} HHUSD`} color="#F7C97E"
          sub="모든 그룹 합산" />
        <Card title="MockUSDT 잔액" value={`${fmt(usdtBal)} USDT`} color="#A8F77E" />
        <Card title="참여 중인 방" value={allMyGroups.length + "개"} color="#C8A8F7" />
      </div>

      {/* 테스트용 민팅 */}
      {ADDRESSES.network === "hardhat" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>🧪 테스트 토큰 발행 (로컬넷 전용)</div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => mintHHUSD(1000)} disabled={loading} style={s.btn}>
              USDT 1,000 발행
            </button>
            <button onClick={() => mintHHUSD(5000)} disabled={loading} style={s.btn}>
              USDT 5,000 발행
            </button>
          </div>
          <div style={{ color: "#555", fontSize: 12, marginTop: 8 }}>
            * BSC 메인넷에서는 실제 USDT 필요
          </div>
        </div>
      )}

      {/* 내 그룹 목록 */}
      <div style={s.section}>
        <div style={s.sectionTitle}>내가 참여 중인 방</div>
        {allMyGroups.length === 0 ? (
          <div style={s.empty}>아직 참여 중인 방이 없습니다. 자동화방 또는 커스텀방에 참가하세요.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {allMyGroups.map((g, i) => (
              <div key={i} style={s.groupRow}>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ ...s.badge, background: "#1a2a3a", color: "#7EB8F7" }}>
                    {g.type}
                  </span>
                  {g.tierLabel && (
                    <span style={{ color: "#aaa", fontSize: 13 }}>{g.tierLabel}</span>
                  )}
                  {g.contributionAmount && (
                    <span style={{ color: "#aaa", fontSize: 13 }}>
                      {fmt(g.contributionAmount)} HHUSD
                    </span>
                  )}
                  <span style={{
                    ...s.badge,
                    background: "#1a1a1a",
                    color: STATE_COLOR[g.stateName] || "#aaa",
                  }}>
                    {g.stateName}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#888" }}>
                  <span>입장순서 {g.joinOrder}번</span>
                  {g.position > 0 && <span>📍 순번 {g.position}번</span>}
                  <span style={{ color: "#555", fontSize: 11 }}>{short(g.groupAddr)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 컨트랙트 주소 */}
      <div style={s.section}>
        <div style={s.sectionTitle}>📋 컨트랙트 주소</div>
        <div style={s.addrGrid}>
          {Object.entries(ADDRESSES.contracts).map(([name, addr]) => (
            <div key={name} style={s.addrRow}>
              <span style={{ color: "#666", fontSize: 12, minWidth: 160 }}>{name}</span>
              <span style={{ color: "#888", fontSize: 12, fontFamily: "monospace" }}>{addr}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, sub, color }) {
  return (
    <div style={s.card}>
      <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>{title}</div>
      <div style={{ color: color || "#eee", fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: "#555", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const s = {
  cardRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 },
  card: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "18px 20px" },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: "#bbb", marginBottom: 14 },
  groupRow: {
    background: "#111", border: "1px solid #1e1e1e", borderRadius: 10,
    padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8,
  },
  badge: { fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600 },
  empty: { color: "#555", fontSize: 14, padding: "24px 0" },
  btn: {
    background: "#1a2a3a", border: "1px solid #2a4a6a", color: "#7EB8F7",
    padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
  },
  addrGrid: { display: "flex", flexDirection: "column", gap: 6 },
  addrRow: {
    display: "flex", gap: 16, padding: "6px 12px",
    background: "#0f0f0f", borderRadius: 6,
  },
};
