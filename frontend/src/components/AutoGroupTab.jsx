import { useState } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";

const STATE_COLOR = {
  ENROLLING:"#5C3DE5", POSITION_SELECTION:"#FF9F43",
  ACTIVE:"#00C48C", COMPLETED:"#9B9BAE", CANCELLED:"#FF4757",
};

export default function AutoGroupTab({
  account, loading, fmt, short,
  activeInfos, myGroups, TIER_LABELS, TIER_AMOUNTS,
  join, selectPosition, contribute, refresh,
}) {
  const { t } = useLang();
  const [posInput, setPosInput] = useState({});
  const [subTab, setSubTab]     = useState("tiers");

  const timeLeft = (ts) => {
    if (!ts) return "";
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return t("closed");
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}${t("hours")} ${m}${t("minutes")} ${t("remaining")}`;
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={s.pageTitle}>{t("tab_auto")}</div>
        <button onClick={refresh} disabled={loading} style={s.refreshBtn}>↻ {t("refresh")}</button>
      </div>
      <div style={s.desc}>{t("auto_desc")}</div>

      <div style={s.tabs}>
        {[{ id:"tiers", label:t("tier_status") }, { id:"my", label:`${t("my_room_tab")} (${myGroups.length})` }].map(tb => (
          <button key={tb.id} onClick={() => setSubTab(tb.id)}
            style={{ ...s.tab, ...(subTab === tb.id ? s.tabOn : {}) }}>{tb.label}</button>
        ))}
      </div>

      {subTab === "tiers" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {activeInfos.map((info, i) => (
            <div key={i} style={s.card}>
              <div style={s.cardTop}>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <span style={s.tierBadge}>{TIER_LABELS[i]}</span>
                  {info.groupAddr !== "0x0000000000000000000000000000000000000000" ? (
                    <span style={{ color: STATE_COLOR[info.stateName] || "#aaa", fontSize:12, fontWeight:700 }}>
                      ● {info.stateName}
                    </span>
                  ) : <span style={{ color:"#C0BFD4", fontSize:13 }}>{t("no_room")}</span>}
                  {info.totalGroups > 0 && <span style={{ color:"#C0BFD4", fontSize:11 }}>{t("total_created")} {info.totalGroups}{t("rooms_created")}</span>}
                </div>
                <button onClick={() => join(i)} disabled={loading} style={{ ...s.joinBtn, opacity: loading ? 0.5 : 1 }}>
                  {t("join_btn")}
                </button>
              </div>

              {info.groupAddr !== "0x0000000000000000000000000000000000000000" && (
                <div style={s.cardBody}>
                  <div style={s.grid4}>
                    <DI label={t("member_count")} value={`${info.memberCount} / 28${t("people")}`} />
                    <DI label={t("countdown")}    value={info.countdownStarted ? t("countdown_started") : t("waiting")} />
                    {info.countdownStarted && info.enrollmentDeadline && (
                      <DI label={t("enroll_close")} value={timeLeft(info.enrollmentDeadline)} />
                    )}
                    <DI label={t("room_addr")} value={short(info.groupAddr)} mono />
                  </div>
                  <Bar current={info.memberCount} max={28} threshold={10}
                    label={`${info.memberCount}/28${t("people")}${info.memberCount >= 10 ? ` · ${t("countdown_possible")}` : ""}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {subTab === "my" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {myGroups.length === 0 ? <div style={s.empty}>{t("no_auto_rooms")}</div> : (
            myGroups.map((g, i) => (
              <div key={i} style={s.myCard}>
                <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:14 }}>
                  <span style={s.tierBadge}>{g.tierLabel}</span>
                  <span style={{ color: STATE_COLOR[g.stateName] || "#aaa", fontSize:12, fontWeight:700 }}>● {g.stateName}</span>
                  <span style={{ color:"#C0BFD4", fontSize:11, fontFamily:"monospace", marginLeft:"auto" }}>{short(g.groupAddr)}</span>
                </div>
                <div style={s.grid4}>
                  <DI label={t("join_order")}   value={`${g.joinOrder}${t("num_suffix")}`} />
                  <DI label={t("position")}     value={g.position > 0 ? `${g.position}${t("num_suffix")}` : t("unassigned")} />
                  <DI label={t("member_count")} value={`${g.memberCount}${t("people")}`} />
                </div>
                {g.state === 1 && g.position === 0 && (
                  <div style={s.actRow}>
                    <input type="number" min="1" max={g.memberCount}
                      placeholder={t("pos_placeholder")}
                      value={posInput[g.groupAddr] || ""}
                      onChange={e => setPosInput(p => ({ ...p, [g.groupAddr]: e.target.value }))}
                      style={s.numIn} />
                    <button onClick={() => selectPosition(g.groupAddr, Number(posInput[g.groupAddr]))}
                      disabled={loading || !posInput[g.groupAddr]} style={s.greenBtn}>
                      {t("select_pos")}
                    </button>
                  </div>
                )}
                {g.state === 2 && (
                  <button onClick={() => contribute(g.groupAddr)} disabled={loading}
                    style={{ ...s.greenBtn, marginTop:10, alignSelf:"flex-start" }}>
                    {t("contribute_btn")}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DI({ label, value, mono }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <span style={{ color:"#9B9BAE", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8 }}>{label}</span>
      <span style={{ color:"#0F0A2E", fontSize:13, fontWeight:600, fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  );
}

function Bar({ current, max, threshold, label }) {
  const pct   = Math.min((current / max) * 100, 100);
  const green = current >= threshold;
  return (
    <div style={{ marginTop:14, background:"#F0EEFF", borderRadius:100, height:20, position:"relative", overflow:"hidden" }}>
      <div style={{ height:"100%", borderRadius:100, width:`${pct}%`, transition:"width 0.4s",
        background: green ? "linear-gradient(90deg,#00C48C,#00E5A6)" : "linear-gradient(90deg,#5C3DE5,#8B6DFF)" }} />
      <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:10, fontWeight:700, color:"#fff", textShadow:"0 1px 4px rgba(0,0,0,0.3)" }}>{label}</span>
    </div>
  );
}

const s = {
  pageTitle: { fontSize:20, fontWeight:800, color:"#0F0A2E", letterSpacing:-0.5 },
  desc:      { color:"#9B9BAE", fontSize:13, marginBottom:24, lineHeight:1.7 },
  refreshBtn:{ background:"#F0EEFF", border:"none", color:"#5C3DE5", padding:"8px 16px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 },
  tabs:      { display:"flex", gap:6, marginBottom:20 },
  tab:       { background:"#fff", border:"1.5px solid #EBEBF0", color:"#9B9BAE", padding:"8px 20px", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600 },
  tabOn:     { borderColor:"#5C3DE5", color:"#5C3DE5", background:"#EDE9FF" },
  card:      { background:"#fff", border:"1.5px solid #EBEBF0", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.04)" },
  myCard:    { background:"#fff", border:"1.5px solid #EBEBF0", borderRadius:16, padding:"20px 24px", display:"flex", flexDirection:"column", boxShadow:"0 2px 12px rgba(0,0,0,0.04)" },
  cardTop:   { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 24px" },
  cardBody:  { padding:"0 24px 20px", borderTop:"1.5px solid #F6F5FE" },
  tierBadge: { background:"#EDE9FF", color:"#5C3DE5", fontSize:12, padding:"5px 14px", borderRadius:8, fontWeight:700 },
  joinBtn:   { background:"linear-gradient(135deg,#5C3DE5,#8B6DFF)", color:"#fff", border:"none", padding:"10px 22px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13, boxShadow:"0 4px 14px rgba(92,61,229,0.3)" },
  grid4:     { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, paddingTop:16 },
  actRow:    { display:"flex", gap:10, alignItems:"center", marginTop:14 },
  numIn:     { background:"#F8F7FF", border:"1.5px solid #E8E4FF", color:"#0F0A2E", padding:"10px 14px", borderRadius:10, fontSize:14, width:110, outline:"none" },
  greenBtn:  { background:"linear-gradient(135deg,#00C48C,#00E5A6)", color:"#fff", border:"none", padding:"10px 22px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13, boxShadow:"0 4px 14px rgba(0,196,140,0.3)" },
  empty:     { color:"#C0BFD4", fontSize:14, padding:"40px 0", textAlign:"center" },
};