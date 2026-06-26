import { useState } from "react";
import { ethers } from "ethers";
import ADDRESSES from "../deployedAddresses.json";
import { useLang } from "../i18n/LanguageContext.jsx";

const STATE_COLOR = {
  ENROLLING:"#5C3DE5", POSITION_SELECTION:"#FF9F43",
  ACTIVE:"#00C48C", COMPLETED:"#9B9BAE", CANCELLED:"#FF4757",
};

export default function DashboardTab({
  account, hhusdBal, lockedCol, usdtBal,
  mintMockUSDT, contracts, onTx, loading, refreshBalances,
  autoMyGroups, customMyGroups, platformStats, fmt, short,
}) {
  const { t } = useLang();
  const [swapAmount,   setSwapAmount]   = useState("");
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
      {/* ── Premium stats banner ── */}
      <div style={s.banner}>
        <div style={s.bannerGlow} />
        <div style={s.bannerLeft}>
          <div style={s.eyebrow}>PLATFORM STATUS</div>
          <div style={s.bigNum}>{ps.totalPool || "0"}</div>
          <div style={s.bigLabel}>HHUSD · {t("total_pool")}</div>
        </div>
        <div style={s.sep} />
        <div style={s.bannerRight}>
          <BStat label={t("total_users")}  value={(ps.totalUsers  || 0) + t("people")} />
          <BStat label={t("total_rooms")}  value={(ps.totalGroups || 0) + t("rooms_unit")} />
          <BStat label={t("active_rooms")} value={(ps.activeGroups || 0) + t("rooms_unit")} green />
        </div>
      </div>

      {/* ── Assets ── */}
      <SLabel>{t("my_assets")}</SLabel>
      <div style={s.assetGrid}>
        <ACard label={t("hhusd_balance")}     value={fmt(hhusdBal)}  unit="HHUSD"            color="#5C3DE5" primary />
        <ACard label={t("locked_collateral")} value={fmt(lockedCol)} unit="HHUSD"            color="#FF9F43" sub={t("all_groups_combined")} />
        <ACard label={t("usdt_balance")}      value={fmt(usdtBal)}   unit="USDT"             color="#00C48C" />
        <ACard label={t("my_rooms_count")}    value={String(allMyGroups.length)} unit={t("rooms_unit")} color="#9B7AFF" />
      </div>

      {/* ── Swap ── */}
      <div style={s.section}>
        <SLabel>USDT ↔ HHUSD</SLabel>
        <div style={s.swapRow}>
          <div style={s.swapCard}>
            <div style={s.swapHead}>
              <span style={{ color:"#5C3DE5", fontWeight:700 }}>USDT</span>
              <span style={{ color:"#C0BFD4", margin:"0 8px" }}>→</span>
              <span style={{ color:"#5C3DE5", fontWeight:700 }}>HHUSD</span>
              <span style={s.fee}>−2.5%</span>
            </div>
            <div style={s.bal}>보유 USDT: <b>{fmt(usdtBal)}</b></div>
            <input type="number" min="1" placeholder="금액 입력"
              value={swapAmount} onChange={e => setSwapAmount(e.target.value)} style={s.inp} />
            <button onClick={handleDeposit} disabled={loading || !swapAmount} style={s.btnP}>
              {loading ? "처리 중..." : "발행 (Deposit)"}
            </button>
          </div>
          <div style={s.swapCard}>
            <div style={s.swapHead}>
              <span style={{ color:"#FF9F43", fontWeight:700 }}>HHUSD</span>
              <span style={{ color:"#C0BFD4", margin:"0 8px" }}>→</span>
              <span style={{ color:"#FF9F43", fontWeight:700 }}>USDT</span>
              <span style={{ ...s.fee, background:"#FFF7ED", color:"#FF9F43" }}>−2.5%</span>
            </div>
            <div style={s.bal}>보유 HHUSD: <b>{fmt(hhusdBal)}</b></div>
            <input type="number" min="1" placeholder="금액 입력"
              value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)} style={s.inp} />
            <button onClick={handleRedeem} disabled={loading || !redeemAmount} style={s.btnO}>
              {loading ? "처리 중..." : "환급 (Redeem)"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Test mint ── */}
      <div style={s.section}>
        <SLabel>🧪 {t("test_mint_title")}</SLabel>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => mintMockUSDT(1000)} disabled={loading} style={s.mintBtn}>{t("mint_1000")}</button>
          <button onClick={() => mintMockUSDT(5000)} disabled={loading} style={s.mintBtn}>{t("mint_5000")}</button>
        </div>
        <div style={{ color:"#C0BFD4", fontSize:12, marginTop:8 }}>{t("test_mint_note")}</div>
      </div>

      {/* ── My rooms ── */}
      <div style={s.section}>
        <SLabel>{t("my_rooms_section")}</SLabel>
        {allMyGroups.length === 0 ? (
          <div style={s.empty}>{t("no_rooms_yet")}</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {allMyGroups.map((g, i) => (
              <div key={i} style={s.roomRow}>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <span style={s.typeTag}>{g.type}</span>
                  {g.tierLabel && <span style={{ color:"#3D3B54", fontSize:13, fontWeight:600 }}>{g.tierLabel}</span>}
                  {g.contributionAmount && <span style={{ color:"#3D3B54", fontSize:13, fontWeight:600 }}>{fmt(g.contributionAmount)} HHUSD</span>}
                  <span style={{ fontSize:12, fontWeight:700, color: STATE_COLOR[g.stateName] || "#aaa" }}>{g.stateName}</span>
                </div>
                <div style={{ display:"flex", gap:16, fontSize:12, color:"#9B9BAE" }}>
                  <span>{t("join_order")} {g.joinOrder}{t("num_suffix")}</span>
                  {g.position > 0 && <span>📍 {t("position")} {g.position}{t("num_suffix")}</span>}
                  <span style={{ fontFamily:"monospace", fontSize:11 }}>{short(g.groupAddr)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Contracts ── */}
      <div style={s.section}>
        <SLabel>컨트랙트 주소</SLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {Object.entries(ADDRESSES.contracts).map(([name, addr]) => (
            <div key={name} style={s.addrRow}>
              <span style={{ color:"#9B9BAE", fontSize:12, minWidth:160 }}>{name}</span>
              <span style={{ color:"#5C3DE5", fontSize:12, fontFamily:"monospace" }}>{addr}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SLabel({ children }) {
  return <div style={{ fontSize:11, fontWeight:800, color:"#9B9BAE", marginBottom:14, letterSpacing:1.5, textTransform:"uppercase" }}>{children}</div>;
}

function BStat({ label, value, green }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      <span style={{ color:"rgba(255,255,255,0.38)", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.2 }}>{label}</span>
      <span style={{ color: green ? "#00C48C" : "rgba(255,255,255,0.88)", fontSize:19, fontWeight:800 }}>{value}</span>
    </div>
  );
}

function ACard({ label, value, unit, color, sub, primary }) {
  return (
    <div style={{
      background: primary ? `linear-gradient(140deg,${color}1A 0%,${color}08 100%)` : "#fff",
      border:`1.5px solid ${primary ? color+"38" : "#EBEBF0"}`,
      borderRadius:16, padding:"22px 24px",
      boxShadow: primary ? `0 4px 20px ${color}1A` : "0 2px 8px rgba(0,0,0,0.04)",
    }}>
      <div style={{ color:"#9B9BAE", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:0.7, marginBottom:14 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
        <span style={{ color, fontSize:26, fontWeight:800, letterSpacing:-1 }}>{value}</span>
        <span style={{ color:color+"88", fontSize:13, fontWeight:700 }}>{unit}</span>
      </div>
      {sub && <div style={{ color:"#C0BFD4", fontSize:11, marginTop:8 }}>{sub}</div>}
    </div>
  );
}

const s = {
  banner: {
    background:"linear-gradient(155deg,#0C0622 0%,#1A0A4A 55%,#250E68 100%)",
    borderRadius:20, padding:"36px 44px", marginBottom:36,
    display:"flex", alignItems:"center",
    position:"relative", overflow:"hidden",
    boxShadow:"0 24px 64px rgba(12,6,34,0.35),0 0 0 1px rgba(255,255,255,0.04)",
  },
  bannerGlow: {
    position:"absolute", top:-60, right:-40, width:280, height:280, borderRadius:"50%",
    background:"rgba(92,61,229,0.22)", filter:"blur(70px)", pointerEvents:"none",
  },
  bannerLeft:  { flex:1, position:"relative" },
  eyebrow:     { fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.32)", letterSpacing:2.5, marginBottom:14, textTransform:"uppercase" },
  bigNum:      { fontSize:54, fontWeight:900, color:"#F2C94C", letterSpacing:-2.5, lineHeight:1, marginBottom:10 },
  bigLabel:    { color:"rgba(255,255,255,0.38)", fontSize:13 },
  sep:         { width:1, height:90, background:"rgba(255,255,255,0.08)", margin:"0 52px", flexShrink:0 },
  bannerRight: { display:"flex", flexDirection:"column", gap:22, position:"relative" },
  assetGrid:   { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:36 },
  section:     { marginBottom:32 },
  swapRow:     { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 },
  swapCard:    { background:"#fff", border:"1.5px solid #EBEBF0", borderRadius:16, padding:"24px", display:"flex", flexDirection:"column", gap:12, boxShadow:"0 2px 12px rgba(0,0,0,0.04)" },
  swapHead:    { display:"flex", alignItems:"center", fontSize:15 },
  fee:         { marginLeft:"auto", background:"#EDE9FF", color:"#5C3DE5", fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:6 },
  bal:         { color:"#9B9BAE", fontSize:12 },
  inp:         { background:"#F8F7FF", border:"1.5px solid #E8E4FF", color:"#0F0A2E", padding:"13px 16px", borderRadius:10, fontSize:15, outline:"none", width:"100%", boxSizing:"border-box" },
  btnP:        { background:"linear-gradient(135deg,#5C3DE5,#8B6DFF)", color:"#fff", border:"none", padding:"13px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14, boxShadow:"0 4px 16px rgba(92,61,229,0.3)" },
  btnO:        { background:"linear-gradient(135deg,#FF9F43,#FFBE76)", color:"#fff", border:"none", padding:"13px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14, boxShadow:"0 4px 16px rgba(255,159,67,0.3)" },
  mintBtn:     { background:"#F0EBFF", border:"none", color:"#5C3DE5", padding:"10px 22px", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:700 },
  roomRow:     { background:"#fff", border:"1.5px solid #EBEBF0", borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:8 },
  typeTag:     { background:"#EDE9FF", color:"#5C3DE5", fontSize:11, padding:"3px 10px", borderRadius:6, fontWeight:700 },
  addrRow:     { display:"flex", gap:16, padding:"10px 16px", background:"#fff", borderRadius:10, border:"1.5px solid #EBEBF0" },
  empty:       { color:"#C0BFD4", fontSize:14, padding:"32px 0", textAlign:"center" },
};