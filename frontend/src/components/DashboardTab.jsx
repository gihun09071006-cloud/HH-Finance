import ADDRESSES from "../deployedAddresses.json";
import { useLang } from "../i18n/LanguageContext.jsx";

const STATE_COLOR = {
  ENROLLING: "#7EB8F7", POSITION_SELECTION: "#F7C97E",
  ACTIVE: "#A8F77E", COMPLETED: "#888", CANCELLED: "#F77E7E",
};

export default function DashboardTab({
  account, hhusdBal, lockedCol, usdtBal,
  mintHHUSD, contracts, onTx, loading, refreshBalances,
  autoMyGroups, customMyGroups, platformStats, fmt, short,
}) {
  const { t } = useLang();

  const allMyGroups = [
    ...autoMyGroups.map(g => ({ ...g, type: t("tab_auto") })),
    ...customMyGroups.map(g => ({ ...g, type: t("tab_custom") })),
  ];

  const ps = platformStats || {};

  return (
    <div>
      <div style={s.platformBanner}>
        <div style={s.platformTitle}>{t("platform_status")}</div>
        <div style={s.statsRow}>
          <StatItem
            icon="👥"
            label={t("total_users")}
            value={(ps.totalUsers || 0).toLocaleString() + t("people")}
            color="#7EB8F7"
          />
          <div style={s.statDivider} />
          <StatItem
            icon="💰"
            label={t("total_pool")}
            value={(ps.totalPool || "0") + " HHUSD"}
            color="#F7C97E"
            sub={t("all_rooms_combined")}
          />
          <div style={s.statDivider} />
          <StatItem
            icon="🏠"
            label={t("total_rooms")}
            value={(ps.totalGroups || 0) + t("rooms_unit")}
            color="#A8F77E"
          />
          <div style={s.statDivider} />
          <StatItem
            icon="⚡"
            label={t("active_rooms")}
            value={(ps.activeGroups || 0) + t("rooms_unit")}
            color="#C8A8F7"
            sub="ACTIVE"
          />
        </div>
      </div>

      <div style={s.sectionTitle}>{t("my_assets")}</div>

      <div style={s.cardRow}>
        <Card title={t("hhusd_balance")} value={`${fmt(hhusdBal)} HHUSD`} color="#7EB8F7" />
        <Card title={t("locked_collateral")} value={`${fmt(lockedCol)} HHUSD`} color="#F7C97E"
          sub={t("all_groups_combined")} />
        <Card title={t("usdt_balance")} value={`${fmt(usdtBal)} USDT`} color="#A8F77E" />
        <Card title={t("my_rooms_count")} value={allMyGroups.length + t("rooms_unit")} color="#C8A8F7" />
      </div>

      {ADDRESSES.network === "hardhat" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>🧪 {t("test_mint_title")}</div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => mintHHUSD(1000)} disabled={loading} style={s.btn}>
              {t("mint_1000")}
            </button>
            <button onClick={() => mintHHUSD(5000)} disabled={loading} style={s.btn}>
              {t("mint_5000")}
            </button>
          </div>
          <div style={{ color: "#555", fontSize: 12, marginTop: 8 }}>
            {t("test_mint_note")}
          </div>
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("my_rooms_section")}</div>
        {allMyGroups.length === 0 ? (
          <div style={s.empty}>{t("no_rooms_yet")}</div>
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
                  <span>{t("join_order")} {g.joinOrder}{t("num_suffix")}</span>
                  {g.position > 0 && <span>📍 {t("position")} {g.position}{t("num_suffix")}</span>}
                  <span style={{ color: "#555", fontSize: 11 }}>{short(g.groupAddr)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📋 {t("contract_addresses")}</div>
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

function StatItem({ icon, label, value, color, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ color: "#666", fontSize: 11 }}>{label}</span>
      <span style={{ color: color || "#eee", fontSize: 20, fontWeight: 800 }}>{value}</span>
      {sub && <span style={{ color: "#444", fontSize: 10 }}>{sub}</span>}
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
  platformBanner: {
    background: "linear-gradient(135deg, #0d1a2a 0%, #0a1020 50%, #0d1a0d 100%)",
    border: "1px solid #1e3a5a",
    borderRadius: 16, padding: "24px 32px", marginBottom: 28,
  },
  platformTitle: {
    fontSize: 13, fontWeight: 600, color: "#7EB8F7",
    marginBottom: 20, textTransform: "uppercase", letterSpacing: 1,
  },
  statsRow: {
    display: "flex", alignItems: "center", gap: 0,
  },
  statDivider: {
    width: 1, height: 50, background: "#1e2e1e", margin: "0 16px",
  },
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
