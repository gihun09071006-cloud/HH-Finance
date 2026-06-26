import { useState } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";

const STATE_COLOR = {
  ENROLLING:"#5C3DE5", POSITION_SELECTION:"#FF9F43",
  ACTIVE:"#00C48C", COMPLETED:"#9B9BAE", CANCELLED:"#FF4757",
};

export default function CustomGroupTab({
  account, loading, fmt, short,
  allGroups, openGroups, myGroups,
  createGroup, joinGroup, kickMember, closeEnrollment, cancelGroup,
  selectPosition, contribute, refresh,
}) {
  const { t } = useLang();
  const [subTab,    setSubTab]    = useState("list");
  const [posInput,  setPosInput]  = useState({});
  const [kickInput, setKickInput] = useState({});
  const [form, setForm] = useState({ contribution:"50", maxMembers:"10", cycleDays:"7", enrollHours:"48" });

  const setF  = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const reqCol = () => ((parseFloat(form.contribution)||0) * (parseInt(form.maxMembers)||0) * 1.4).toFixed(2);

  const timeLeft = (ts) => {
    if (!ts) return "";
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return t("closed");
    return `${Math.floor(diff/3600)}${t("hours")} ${Math.floor((diff%3600)/60)}${t("minutes")} ${t("remaining")}`;
  };

  const statusLabel = (s) => [t("status_normal"), t("status_warning"), t("status_penalty"), t("status_removed")][s] || "-";

  const handleCreate = async () => {
    await createGroup({ contribution:form.contribution, maxMembers:form.maxMembers, cycleIntervalDays:form.cycleDays, enrollmentHours:form.enrollHours });
    setSubTab("my");
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={s.pageTitle}>{t("tab_custom")}</div>
        <button onClick={refresh} disabled={loading} style={s.refreshBtn}>↻ {t("refresh")}</button>
      </div>
      <div style={s.desc}>{t("custom_desc")}</div>

      <div style={s.tabs}>
        {[{ id:"list", label:`${t("all_rooms")} (${allGroups.length})` }, { id:"create", label:t("create_room") }, { id:"my", label:`${t("my_room_tab")} (${myGroups.length})` }].map(tb => (
          <button key={tb.id} onClick={() => setSubTab(tb.id)}
            style={{ ...s.tab, ...(subTab === tb.id ? s.tabOn : {}) }}>{tb.label}</button>
        ))}
      </div>

      {/* ── List ── */}
      {subTab === "list" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {allGroups.length === 0 ? <div style={s.empty}>{t("no_custom_rooms_list")}</div> : (
            allGroups.map((g, i) => {
              const isMe      = g.organizer?.toLowerCase() === account?.toLowerCase();
              const alreadyIn = myGroups.some(m => m.groupAddr === g.groupAddr);
              return (
                <div key={i} style={s.card}>
                  <div style={s.cardTop}>
                    <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ color: STATE_COLOR[g.stateName]||"#aaa", fontSize:12, fontWeight:700 }}>● {g.stateName}</span>
                      <span style={{ color:"#0F0A2E", fontWeight:800, fontSize:16, letterSpacing:-0.5 }}>{fmt(g.contributionAmount)} HHUSD</span>
                      <span style={{ color:"#9B9BAE", fontSize:12 }}>/ {t("cycle")}</span>
                      <span style={{ color:"#C0BFD4", fontSize:12 }}>{t("max")} {g.maxMembers}{t("people")}</span>
                      {isMe && <span style={s.orgTag}>{t("im_organizer")}</span>}
                    </div>
                    {alreadyIn ? (
                      <span style={{ color:"#00C48C", fontSize:13, fontWeight:700 }}>✓ {t("participating")}</span>
                    ) : g.state === 0 && !isMe && (
                      <button onClick={() => joinGroup(g.groupAddr, g.contributionAmount, g.maxMembers)}
                        disabled={loading} style={s.joinBtn}>{t("join_btn")}</button>
                    )}
                  </div>
                  <div style={s.grid4}>
                    <DI label={t("member_count")} value={`${g.memberCount} / ${g.maxMembers}${t("people")}`} />
                    <DI label={t("organizer")}    value={short(g.organizer)} mono />
                    {g.state === 0 && g.enrollmentDeadline && <DI label={t("enroll_close")} value={timeLeft(g.enrollmentDeadline)} />}
                    <DI label={t("room_addr")}    value={short(g.groupAddr)} mono />
                  </div>
                  <div style={{ background:"#F0EEFF", borderRadius:100, height:18, position:"relative", overflow:"hidden", marginTop:14 }}>
                    <div style={{ height:"100%", borderRadius:100, transition:"width 0.4s",
                      width:`${Math.min((g.memberCount/g.maxMembers)*100,100)}%`,
                      background: g.memberCount >= g.maxMembers ? "linear-gradient(90deg,#FF9F43,#FFBE76)" : "linear-gradient(90deg,#5C3DE5,#8B6DFF)" }} />
                    <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:10, fontWeight:700, color:"#fff", textShadow:"0 1px 3px rgba(0,0,0,0.3)" }}>
                      {g.memberCount}/{g.maxMembers}{t("people")}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Create ── */}
      {subTab === "create" && (
        <div style={s.createCard}>
          <div style={s.createTitle}>{t("create_form_title")}</div>
          <div style={s.createDesc}>{t("create_form_desc")}</div>
          <div style={s.formGrid}>
            <FF label={t("form_contribution")}  desc={t("form_contribution_desc")}><input type="number" min="1"  value={form.contribution} onChange={setF("contribution")} style={s.formIn} placeholder="50"  /></FF>
            <FF label={t("form_max_members")}   desc={t("form_max_members_desc")} ><input type="number" min="2" max="29" value={form.maxMembers}   onChange={setF("maxMembers")}   style={s.formIn} placeholder="10"  /></FF>
            <FF label={t("form_cycle_days")}    desc={t("form_cycle_days_desc")}  ><input type="number" min="1"  value={form.cycleDays}    onChange={setF("cycleDays")}    style={s.formIn} placeholder="7"   /></FF>
            <FF label={t("form_enroll_hours")}  desc={t("form_enroll_hours_desc")}><input type="number" min="1"  value={form.enrollHours}  onChange={setF("enrollHours")}  style={s.formIn} placeholder="48"  /></FF>
          </div>
          <div style={s.colBox}>
            <div>
              <div style={{ color:"#9B9BAE", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{t("required_collateral")}</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                <span style={{ color:"#FF9F43", fontSize:32, fontWeight:900, letterSpacing:-1 }}>{reqCol()}</span>
                <span style={{ color:"#FF9F4399", fontSize:14, fontWeight:700 }}>HHUSD</span>
              </div>
            </div>
            <div style={{ color:"#C0BFD4", fontSize:12, textAlign:"right" }}>{form.contribution} × {form.maxMembers}{t("people")} × 140%</div>
          </div>
          <button onClick={handleCreate} disabled={loading} style={s.createBtn}>
            {loading ? t("creating") : t("create_and_join")}
          </button>
        </div>
      )}

      {/* ── My ── */}
      {subTab === "my" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {myGroups.length === 0 ? <div style={s.empty}>{t("no_custom_rooms")}</div> : (
            myGroups.map((g, i) => (
              <div key={i} style={s.card}>
                <div style={s.cardTop}>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <span style={{ color: STATE_COLOR[g.stateName]||"#aaa", fontSize:12, fontWeight:700 }}>● {g.stateName}</span>
                    <span style={{ color:"#0F0A2E", fontWeight:800, fontSize:15, letterSpacing:-0.5 }}>{fmt(g.contributionAmount)} HHUSD/{t("cycle")}</span>
                    {g.isOrganizer && <span style={s.orgTag}>{t("organizer")}</span>}
                  </div>
                </div>
                <div style={{ padding:"0 24px 20px" }}>
                  <div style={s.grid4}>
                    <DI label={t("join_order")}   value={`${g.joinOrder}${t("num_suffix")}`} />
                    <DI label={t("position")}     value={g.position > 0 ? `${g.position}${t("num_suffix")}` : t("unassigned")} />
                    <DI label={t("status")}       value={statusLabel(g.status)} />
                    <DI label={t("member_count")} value={`${g.memberCount}/${g.maxMembers}${t("people")}`} />
                  </div>

                  {g.isOrganizer && g.state === 0 && (
                    <div style={s.actRow}>
                      <button onClick={() => closeEnrollment(g.groupAddr)} disabled={loading} style={s.btnO}>{t("early_close")}</button>
                      <input placeholder={t("kick_placeholder")} value={kickInput[g.groupAddr]||""}
                        onChange={e => setKickInput(k => ({ ...k, [g.groupAddr]: e.target.value }))}
                        style={{ ...s.formIn, flex:1, width:"auto" }} />
                      <button onClick={() => kickMember(g.groupAddr, kickInput[g.groupAddr])}
                        disabled={loading || !kickInput[g.groupAddr]} style={s.btnR}>{t("kick")}</button>
                      <button onClick={() => cancelGroup(g.groupAddr, "organizer cancel")} disabled={loading} style={s.btnR}>{t("cancel_room")}</button>
                    </div>
                  )}

                  {g.state === 1 && g.position === 0 && (
                    <div style={s.actRow}>
                      <input type="number" min="1" max={g.maxMembers} placeholder={t("pos_placeholder")}
                        value={posInput[g.groupAddr]||""}
                        onChange={e => setPosInput(p => ({ ...p, [g.groupAddr]: e.target.value }))}
                        style={s.numIn} />
                      <button onClick={() => selectPosition(g.groupAddr, Number(posInput[g.groupAddr]))}
                        disabled={loading || !posInput[g.groupAddr]} style={s.btnG}>{t("select_pos")}</button>
                    </div>
                  )}

                  {g.state === 2 && (
                    <button onClick={() => contribute(g.groupAddr, g.contributionAmount)} disabled={loading}
                      style={{ ...s.btnG, marginTop:14, display:"inline-block" }}>{t("contribute_btn")}</button>
                  )}
                </div>
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

function FF({ label, desc, children }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      <div style={{ color:"#0F0A2E", fontSize:13, fontWeight:700 }}>{label}</div>
      {desc && <div style={{ color:"#C0BFD4", fontSize:11 }}>{desc}</div>}
      {children}
    </div>
  );
}

const s = {
  pageTitle:  { fontSize:20, fontWeight:800, color:"#0F0A2E", letterSpacing:-0.5 },
  desc:       { color:"#9B9BAE", fontSize:13, marginBottom:24, lineHeight:1.7 },
  refreshBtn: { background:"#F0EEFF", border:"none", color:"#5C3DE5", padding:"8px 16px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 },
  tabs:       { display:"flex", gap:6, marginBottom:20 },
  tab:        { background:"#fff", border:"1.5px solid #EBEBF0", color:"#9B9BAE", padding:"8px 20px", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600 },
  tabOn:      { borderColor:"#5C3DE5", color:"#5C3DE5", background:"#EDE9FF" },
  card:       { background:"#fff", border:"1.5px solid #EBEBF0", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.04)" },
  cardTop:    { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 24px" },
  orgTag:     { background:"#F0EEFF", color:"#5C3DE5", fontSize:11, padding:"3px 10px", borderRadius:6, fontWeight:700 },
  grid4:      { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, paddingTop:16 },
  joinBtn:    { background:"linear-gradient(135deg,#5C3DE5,#8B6DFF)", color:"#fff", border:"none", padding:"10px 22px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13, boxShadow:"0 4px 14px rgba(92,61,229,0.3)" },
  actRow:     { display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginTop:16 },
  numIn:      { background:"#F8F7FF", border:"1.5px solid #E8E4FF", color:"#0F0A2E", padding:"10px 14px", borderRadius:10, fontSize:14, width:110, outline:"none" },
  btnG:       { background:"linear-gradient(135deg,#00C48C,#00E5A6)", color:"#fff", border:"none", padding:"10px 22px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13, boxShadow:"0 4px 14px rgba(0,196,140,0.3)" },
  btnO:       { background:"linear-gradient(135deg,#FF9F43,#FFBE76)", color:"#fff", border:"none", padding:"10px 18px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13, boxShadow:"0 4px 14px rgba(255,159,67,0.3)" },
  btnR:       { background:"linear-gradient(135deg,#FF4757,#FF6B81)", color:"#fff", border:"none", padding:"10px 18px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13, boxShadow:"0 4px 14px rgba(255,71,87,0.3)" },
  createCard: { background:"#fff", border:"1.5px solid #EBEBF0", borderRadius:20, padding:"36px 40px", boxShadow:"0 4px 24px rgba(0,0,0,0.06)" },
  createTitle:{ fontSize:18, fontWeight:800, color:"#0F0A2E", letterSpacing:-0.5, marginBottom:8 },
  createDesc: { color:"#9B9BAE", fontSize:13, marginBottom:28 },
  formGrid:   { display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:22, marginBottom:28 },
  formIn:     { background:"#F8F7FF", border:"1.5px solid #E8E4FF", color:"#0F0A2E", padding:"12px 16px", borderRadius:10, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" },
  colBox:     { background:"linear-gradient(135deg,#FFF9F0,#FFF5E6)", border:"1.5px solid #FFE4B0", borderRadius:14, padding:"20px 24px", marginBottom:24, display:"flex", justifyContent:"space-between", alignItems:"center" },
  createBtn:  { background:"linear-gradient(135deg,#5C3DE5,#8B6DFF)", color:"#fff", border:"none", padding:"15px 40px", borderRadius:12, cursor:"pointer", fontWeight:800, fontSize:15, boxShadow:"0 6px 24px rgba(92,61,229,0.35)", width:"100%" },
  empty:      { color:"#C0BFD4", fontSize:14, padding:"40px 0", textAlign:"center" },
};