import { useState } from "react";
import { ethers } from "ethers";
import ADDRESSES from "../deployedAddresses.json";
import { useLang } from "../i18n/LanguageContext.jsx";

const STATE_COLOR = {
  ENROLLING: "#6C47FF", POSITION_SELECTION: "#FF9500",
  ACTIVE: "#30D158", COMPLETED: "#999", CANCELLED: "#FF453A",
};

export default function DashboardTab({
  account, hhusdBal, lockedCol, usdtBal,
  mintMockUSDT, contracts, onTx, loading, refreshBalances,
  autoMyGroups, customMyGroups, platformStats, fmt, short,
}) {
  const { t } = useLang();
  const [swapAmount, setSwapAmount]   = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");

  const handleDeposit = async () => {
    if (!contracts || !swapAmount) return;
    const amt = ethers.parseEther(swapAmount);
    await onTx(() => contracts.usdt.approve(ADDRESSES.contracts.TreasuryV2, amt));
    await onTx(() => contracts.treasury.depositUSDT(amt));
    await refreshBalances();
    setSwapAmount("");
  };

  const handleRedeem = async () => {
    if (!contracts || !redeemAmount) return;
    const amt = ethers.parseEther(redeemAmount);
    await onTx(() => contracts.treasury.redeemHHUSD(amt));
    await refreshBalances();
    setRedeemAmount("");
  };

  const allMyGroups = [
    ...autoMyGroups.map(g => ({ ...g, type: t("tab_auto") })),
    ...customMyGroups.map(g => ({ ...g, type: t("tab_custom") })),
  ];

  const ps = platformStats || {};

  return (
    <div>
      <div style={s.platformBanner}>
        <div style={{ position:"absolute", top:18, right:60, width:14, height:14, borderRadius:"50%", background:"#FF9500", opacity:0.8 }} />
        <div style={{ position:"absolute", top:36, right:90, width:9, height:9, borderRadius:"50%", background:"#FFD60A", opacity:0.7 }} />
        <div style={{ position:"absolute", bottom:20, right:40, width:12, height:12, transform:"rotate(45deg)", background:"rgba(255,255,255,0.4)" }} />
        <div style={{ position:"absolute", top:24, left:220, width:8, height:8, borderRadius:"50%", background:"rgba(255,255,255,0.5)" }} />

        <div style={s.platformTitle}>{t("platform_status")}</div>
        <div style={s.statsRow}>
          <StatItem icon="👥" label={t("total_users")} value={(ps.totalUsers || 0).toLocaleString() + t("people")} color="#fff" />
          <div style={s.statDivider} />
          <StatItem icon="💰" label={t("total_pool")} value={(ps.totalPool || "0") + " HHUSD"} color="#FFD60A" sub={t("all_rooms_combined")} />
          <div style={s.statDivider} />
          <StatItem icon="🏠" label={t("total_rooms")} value={(ps.totalGroups || 0) + t("rooms_unit")} color="#fff" />
          <div style={s.statDivider} />
          <StatItem icon="⚡" label={t("active_rooms")} value={(ps.activeGroups || 0) + t("rooms_unit")} color="#30D158" sub="ACTIVE" />
        </div>
      </div>

      <div style={s.sectionTitle}>{t("my_assets")}</div>

      <div style={s.cardRow}>
        <Card title={t("hhusd_balance")} value={`${fmt(hhusdBal)} HHUSD`} color="#6C47FF" />
        <Card title={t("locked_collateral")} value={`${fmt(lockedCol)} HHUSD`} color="#FF9500" sub={t("all_groups_combined")} />
        <Card title={t("usdt_balance")} value={`${fmt(usdtBal)} USDT`} color="#30D158" />
        <Card title={t("my_rooms_count")} value={allMyGroups.length + t("rooms_unit")} color="#9B72FF" />
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>💱 USDT ↔ HHUSD</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={s.swapCard}>
            <div style={{ color: "#6C47FF", fontWeight: 700, marginBottom: 8 }}>USDT → HHUSD</div>
            <div style={{ color: "#999", fontSize: 12, marginBottom: 12 }}>보유 USDT: {fmt(usdtBal)}</div>
            <input
              type="number" min="1" placeholder="USDT 금액"
              value={swapAmount}
              onChange={e => setSwapAmount(e.target.value)}
              style={s.input}
            />
            <button onClick={handleDeposit} disabled={loading || !swapAmount} style={s.depositBtn}>
              {loading ? "처리 중..." : "발행 (Deposit)"}
            </button>
          </div>
          <div style={s.swapCard}>
            <div style={{ color: "#FF9500", fontWeight: 700, marginBottom: 8 }}>HHUSD → USDT</div>
            <div style={{ color: "#999", fontSize: 12, marginBottom: 12 }}>보유 HHUSD: {fmt(hhusdBal)}</div>
            <input
              type="number" min="1" placeholder="HHUSD 금액"
              value={redeemAmount}
              onChange={e => setRedeemAmount(e.target.value)}
              style={s.input}
            />
            <button onClick={handleRedeem} disabled={loading || !redeemAmount} style={s.redeemBtn}>
              {loading ? "처리 중..." : "환급 (Redeem)"}
            </button>
          </div>
        </div>
        <div style={{ color: "#bbb", fontSize: 11, marginTop: 8 }}>
          * Deposit 수수료 2.5% / Redeem 수수료 2.5% (TreasuryV2)
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🧪 {t("test_mint_title")}</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => mintMockUSDT(1000)} disabled={loading} style={s.btn}>{t("mint_1000")}</button>
          <button onClick={() => mintMockUSDT(5000)} disabled={loading} style={s.btn}>{t("mint_5000")}</button>
        </div>
        <div style={{ color: "#bbb", fontSize: 12, marginTop: 8 }}>{t("test_mint_note")}</div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("my_rooms_section")}</div>
        {allMyGroups.length === 0 ? (
          <div style={s.empty}>{t("no_rooms_yet")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {allMyGroups.map((g, i) => (
              <div key={i} style={s.groupRow}>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ ...s.badge, background: "#f0ecff", color: "#6C47FF" }}>{g.type}</span>
                  {g.tierLabel && <span style={{ color: "#555", fontSize: 13 }}>{g.tierLabel}</span>}
                  {g.contributionAmount && (
                    <span style={{ color: "#555", fontSize: 13 }}>{fmt(g.contributionAmount)} HHUSD</span>
                  )}
                  <span style={{ ...s.badge, background: "#fafafa", border: "1px solid #eee", color: STATE_COLOR[g.stateName] || "#aaa" }}>
                    {g.stateName}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#aaa" }}>
                  <span>{t("join_order")} {g.joinOrder}{t("num_suffix")}</span>
                  {g.position > 0 && <span>📍 {t("position")} {g.position}{t("num_suffix")}</span>}
                  <span style={{ color: "#ccc", fontSize: 11 }}>{short(g.groupAddr)}</span>
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
              <span style={{ color: "#999", fontSize: 12, minWidth: 160 }}>{name}</span>
              <span style={{ color: "#6C47FF", fontSize: 12, fontFamily: "monospace" }}>{addr}</span>
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
      <span style={{ fontSize: 26 }}>{icon}</span>
      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{label}</span>
      <span style={{ color: color || "#fff", fontSize: 22, fontWeight: 800 }}>{value}</span>
      {sub && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{sub}</span>}
    </div>
  );
}

function Card({ title, value, sub, color }) {
  return (
    <div style={{ ...s.card, borderTop: `3px solid ${color}` }}>
      <div style={{ color: "#aaa", fontSize: 12, marginBottom: 8 }}>{title}</div>
      <div style={{ color: color || "#1a1a2e", fontSize: 22, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: "#bbb", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const s = {
  platformBanner: {
    background: "linear-gradient(135deg, #6C47FF 0%, #9B72FF 60%, #7B5CF6 100%)",
    borderRadius: 20, padding: "28px 36px", marginBottom: 28,
    position: "relative", overflow: "hidden",
    boxShadow: "0 8px 32px rgba(108,71,255,0.3)",
  },
  platformTitle: {
    fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)",
    marginBottom: 20, textTransform: "uppercase", letterSpacing: 1.5,
  },
  statsRow: { display: "flex", alignItems: "center", gap: 0 },
  statDivider: { width: 1, height: 54, background: "rgba(255,255,255,0.2)", margin: "0 20px" },
  cardRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 },
  card: {
    background: "#fff", borderRadius: 16, padding: "20px 22px",
    boxShadow: "0 2px 16px rgba(108,71,255,0.08)",
  },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 14 },
  groupRow: {
    background: "#fff", border: "1px solid #f0ecff", borderRadius: 14,
    padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8,
    boxShadow: "0 2px 8px rgba(108,71,255,0.05)",
  },
  badge: { fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700 },
  empty: { color: "#ccc", fontSize: 14, padding: "32px 0", textAlign: "center" },
  btn: {
    background: "#f0ecff", border: "none", color: "#6C47FF",
    padding: "10px 22px", borderRadius: 50, cursor: "pointer", fontSize: 13, fontWeight: 700,
  },
  addrGrid: { display: "flex", flexDirection: "column", gap: 6 },
  addrRow: {
    display: "flex", gap: 16, padding: "8px 14px",
    background: "#fff", borderRadius: 10, border: "1px solid #f0ecff",
  },
  swapCard: {
    background: "#fff", border: "1px solid #f0ecff", borderRadius: 16,
    padding: "20px 22px", display: "flex", flexDirection: "column", gap: 8,
    boxShadow: "0 2px 16px rgba(108,71,255,0.06)",
  },
  input: {
    background: "#fafafa", border: "1.5px solid #e0d9ff", color: "#1a1a2e",
    padding: "10px 14px", borderRadius: 12, fontSize: 14, width: "100%",
    boxSizing: "border-box", outline: "none",
  },
  depositBtn: {
    background: "linear-gradient(135deg,#6C47FF,#9B72FF)", color: "#fff", border: "none",
    padding: "11px", borderRadius: 50, cursor: "pointer", fontWeight: 700,
    fontSize: 14, marginTop: 4, boxShadow: "0 2px 12px rgba(108,71,255,0.25)",
  },
  redeemBtn: {
    background: "linear-gradient(135deg,#FF9500,#FFB340)", color: "#fff", border: "none",
    padding: "11px", borderRadius: 50, cursor: "pointer", fontWeight: 700,
    fontSize: 14, marginTop: 4, boxShadow: "0 2px 12px rgba(255,149,0,0.25)",
  },
};