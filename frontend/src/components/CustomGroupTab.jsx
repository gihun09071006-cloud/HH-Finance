import { useState } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";

const STATE_COLOR = {
  ENROLLING: "#6C47FF", POSITION_SELECTION: "#FF9500",
  ACTIVE: "#30D158", COMPLETED: "#999", CANCELLED: "#FF453A",
};

export default function CustomGroupTab({
  account, loading, fmt, short,
  allGroups, openGroups, myGroups,
  createGroup, joinGroup, kickMember, closeEnrollment, cancelGroup,
  selectPosition, contribute, refresh,
}) {
  const { t } = useLang();
  const [subTab, setSubTab] = useState("list");
  const [posInput,  setPosInput]  = useState({});
  const [kickInput, setKickInput] = useState({});
  const [form, setForm] = useState({
    contribution: "50",
    maxMembers:   "10",
    cycleDays:    "7",
    enrollHours:  "48",
  });

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const requiredCollateral = () => {
    const c = parseFloat(form.contribution) || 0;
    const m = parseInt(form.maxMembers)     || 0;
    return (c * m * 1.4).toFixed(2);
  };

  const timeLeft = (ts) => {
    if (!ts) return "";
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return t("closed");
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}${t("hours")} ${m}${t("minutes")} ${t("remaining")}`;
  };

  const statusLabel = (s) => {
    const labels = [t("status_normal"), t("status_warning"), t("status_penalty"), t("status_removed")];
    return labels[s] || "-";
  };

  const handleCreate = async () => {
    await createGroup({
      contribution:      form.contribution,
      maxMembers:        form.maxMembers,
      cycleIntervalDays: form.cycleDays,
      enrollmentHours:   form.enrollHours,
    });
    setSubTab("my");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={s.pageTitle}>{t("tab_custom")}</div>
        <button onClick={refresh} disabled={loading} style={s.refreshBtn}>↻ {t("refresh")}</button>
      </div>

      <div style={s.desc}>{t("custom_desc")}</div>

      <div style={s.subTabBar}>
        <button onClick={() => setSubTab("list")} style={{ ...s.subTab, ...(subTab === "list" ? s.subTabActive : {}) }}>
          {t("all_rooms")} ({allGroups.length})
        </button>
        <button onClick={() => setSubTab("create")} style={{ ...s.subTab, ...(subTab === "create" ? s.subTabActive : {}) }}>
          {t("create_room")}
        </button>
        <button onClick={() => setSubTab("my")} style={{ ...s.subTab, ...(subTab === "my" ? s.subTabActive : {}) }}>
          {t("my_room_tab")} ({myGroups.length})
        </button>
      </div>

      {subTab === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {allGroups.length === 0 ? (
            <div style={s.empty}>{t("no_custom_rooms_list")}</div>
          ) : (
            allGroups.map((g, i) => {
              const isMe = g.organizer?.toLowerCase() === account?.toLowerCase();
              const alreadyIn = myGroups.some(m => m.groupAddr === g.groupAddr);
              return (
                <div key={i} style={s.groupCard}>
                  <div style={s.groupHeader}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ ...s.stateBadge, color: STATE_COLOR[g.stateName] || "#aaa" }}>
                        {g.stateName}
                      </span>
                      <span style={{ color: "#1a1a2e", fontWeight: 700, fontSize: 15 }}>
                        {fmt(g.contributionAmount)} HHUSD/{t("cycle")}
                      </span>
                      <span style={{ color: "#bbb", fontSize: 12 }}>
                        {t("max")} {g.maxMembers}{t("people")}
                      </span>
                      {isMe && (
                        <span style={{ ...s.badge, background: "#f5f0ff", color: "#9B72FF" }}>
                          {t("im_organizer")}
                        </span>
                      )}
                    </div>
                    {g.state === 0 && !alreadyIn && !isMe && (
                      <button
                        onClick={() => joinGroup(g.groupAddr, g.contributionAmount, g.maxMembers)}
                        disabled={loading}
                        style={s.joinBtn}
                      >
                        {t("join_btn")}
                      </button>
                    )}
                    {alreadyIn && (
                      <span style={{ color: "#30D158", fontSize: 13, fontWeight: 700 }}>✓ {t("participating")}</span>
                    )}
                  </div>

                  <div style={s.detailGrid}>
                    <DetailItem label={t("member_count")} value={`${g.memberCount} / ${g.maxMembers}${t("people")}`} />
                    <DetailItem label={t("organizer")} value={short(g.organizer)} />
                    {g.state === 0 && g.enrollmentDeadline && (
                      <DetailItem label={t("enroll_close")} value={timeLeft(g.enrollmentDeadline)} />
                    )}
                    <DetailItem label={t("room_addr")} value={short(g.groupAddr)} />
                  </div>

                  <div style={s.progressBg}>
                    <div style={{
                      ...s.progressFill,
                      width: `${(g.memberCount / g.maxMembers) * 100}%`,
                      background: g.memberCount >= g.maxMembers
                        ? "linear-gradient(90deg,#FF9500,#FFB340)"
                        : "linear-gradient(90deg,#6C47FF,#9B72FF)",
                    }} />
                    <span style={s.progressLabel}>{g.memberCount}/{g.maxMembers}{t("people")}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {subTab === "create" && (
        <div style={s.createForm}>
          <div style={s.formTitle}>{t("create_form_title")}</div>
          <div style={s.formDesc}>{t("create_form_desc")}</div>

          <div style={s.formGrid}>
            <FormField label={t("form_contribution")} desc={t("form_contribution_desc")}>
              <input type="number" min="1" value={form.contribution} onChange={setF("contribution")}
                style={s.input} placeholder="50" />
            </FormField>
            <FormField label={t("form_max_members")} desc={t("form_max_members_desc")}>
              <input type="number" min="2" max="29" value={form.maxMembers} onChange={setF("maxMembers")}
                style={s.input} placeholder="10" />
            </FormField>
            <FormField label={t("form_cycle_days")} desc={t("form_cycle_days_desc")}>
              <input type="number" min="1" value={form.cycleDays} onChange={setF("cycleDays")}
                style={s.input} placeholder="7" />
            </FormField>
            <FormField label={t("form_enroll_hours")} desc={t("form_enroll_hours_desc")}>
              <input type="number" min="1" value={form.enrollHours} onChange={setF("enrollHours")}
                style={s.input} placeholder="48" />
            </FormField>
          </div>

          <div style={s.collateralPreview}>
            <span style={{ color: "#aaa", fontSize: 13 }}>{t("required_collateral")}:</span>
            <span style={{ color: "#FF9500", fontSize: 20, fontWeight: 800, marginLeft: 12 }}>
              {requiredCollateral()} HHUSD
            </span>
            <span style={{ color: "#ccc", fontSize: 12, marginLeft: 8 }}>
              ({form.contribution} × {form.maxMembers}{t("people")} × 140%)
            </span>
          </div>

          <button onClick={handleCreate} disabled={loading} style={s.createBtn}>
            {loading ? t("creating") : t("create_and_join")}
          </button>
        </div>
      )}

      {subTab === "my" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {myGroups.length === 0 ? (
            <div style={s.empty}>{t("no_custom_rooms")}</div>
          ) : (
            myGroups.map((g, i) => (
              <div key={i} style={s.myCard}>
                <div style={s.groupHeader}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ ...s.stateBadge, color: STATE_COLOR[g.stateName] || "#aaa" }}>
                      {g.stateName}
                    </span>
                    <span style={{ color: "#1a1a2e", fontWeight: 700 }}>
                      {fmt(g.contributionAmount)} HHUSD/{t("cycle")}
                    </span>
                    {g.isOrganizer && (
                      <span style={{ ...s.badge, background: "#f5f0ff", color: "#9B72FF" }}>{t("organizer")}</span>
                    )}
                  </div>
                </div>

                <div style={s.detailGrid}>
                  <DetailItem label={t("join_order")} value={`${g.joinOrder}${t("num_suffix")}`} />
                  <DetailItem label={t("position")} value={g.position > 0 ? `${g.position}${t("num_suffix")}` : t("unassigned")} />
                  <DetailItem label={t("status")} value={statusLabel(g.status)} />
                  <DetailItem label={t("member_count")} value={`${g.memberCount}/${g.maxMembers}${t("people")}`} />
                </div>

                {g.isOrganizer && g.state === 0 && (
                  <div style={s.actionRow}>
                    <button onClick={() => closeEnrollment(g.groupAddr)} disabled={loading} style={s.orangeBtn}>
                      {t("early_close")}
                    </button>
                    <input
                      placeholder={t("kick_placeholder")}
                      value={kickInput[g.groupAddr] || ""}
                      onChange={e => setKickInput(k => ({ ...k, [g.groupAddr]: e.target.value }))}
                      style={{ ...s.input, flex: 1 }}
                    />
                    <button
                      onClick={() => kickMember(g.groupAddr, kickInput[g.groupAddr])}
                      disabled={loading || !kickInput[g.groupAddr]}
                      style={s.redBtn}
                    >
                      {t("kick")}
                    </button>
                    <button
                      onClick={() => cancelGroup(g.groupAddr, "organizer cancel")}
                      disabled={loading}
                      style={s.redBtn}
                    >
                      {t("cancel_room")}
                    </button>
                  </div>
                )}

                {g.state === 1 && g.position === 0 && (
                  <div style={s.actionRow}>
                    <input
                      type="number" min="1" max={g.maxMembers}
                      placeholder={t("pos_placeholder")}
                      value={posInput[g.groupAddr] || ""}
                      onChange={e => setPosInput(p => ({ ...p, [g.groupAddr]: e.target.value }))}
                      style={s.input}
                    />
                    <button
                      onClick={() => selectPosition(g.groupAddr, Number(posInput[g.groupAddr]))}
                      disabled={loading || !posInput[g.groupAddr]}
                      style={s.greenBtn}
                    >
                      {t("select_pos")}
                    </button>
                  </div>
                )}

                {g.state === 2 && (
                  <button
                    onClick={() => contribute(g.groupAddr, g.contributionAmount)}
                    disabled={loading}
                    style={{ ...s.greenBtn, alignSelf: "flex-start" }}
                  >
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

function DetailItem({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ color: "#bbb", fontSize: 11 }}>{label}</span>
      <span style={{ color: "#1a1a2e", fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function FormField({ label, desc, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ color: "#1a1a2e", fontSize: 13, fontWeight: 700 }}>{label}</div>
      {desc && <div style={{ color: "#bbb", fontSize: 11 }}>{desc}</div>}
      {children}
    </div>
  );
}

const s = {
  pageTitle: { fontSize: 20, fontWeight: 800, color: "#1a1a2e" },
  desc: { color: "#aaa", fontSize: 13, marginBottom: 20, lineHeight: 1.7 },
  refreshBtn: {
    background: "#f5f3ff", border: "1px solid #e0d9ff", color: "#6C47FF",
    padding: "7px 16px", borderRadius: 50, cursor: "pointer", fontSize: 13, fontWeight: 600,
  },
  subTabBar: { display: "flex", gap: 8, marginBottom: 18 },
  subTab: {
    background: "#fff", border: "1.5px solid #e8e4f7", color: "#aaa",
    padding: "7px 18px", borderRadius: 50, cursor: "pointer", fontSize: 13, fontWeight: 600,
    transition: "all 0.15s",
  },
  subTabActive: { borderColor: "#9B72FF", color: "#9B72FF", background: "#f5f0ff" },
  groupCard: {
    background: "#fff", border: "1px solid #f0ecff", borderRadius: 18,
    padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12,
    boxShadow: "0 2px 16px rgba(108,71,255,0.07)",
  },
  myCard: {
    background: "#fff", border: "1.5px solid #e8e0ff", borderRadius: 18,
    padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12,
    boxShadow: "0 2px 16px rgba(155,114,255,0.1)",
  },
  groupHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  stateBadge: { fontSize: 12, fontWeight: 700 },
  badge: { fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700 },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 },
  progressBg: {
    background: "#f5f3ff", borderRadius: 50, height: 20, position: "relative", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 50, transition: "width 0.3s" },
  progressLabel: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, color: "#fff", fontWeight: 700,
    textShadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
  joinBtn: {
    background: "linear-gradient(135deg,#9B72FF,#6C47FF)", color: "#fff", border: "none",
    padding: "10px 20px", borderRadius: 50, cursor: "pointer", fontWeight: 700, fontSize: 13,
    boxShadow: "0 2px 12px rgba(108,71,255,0.25)",
  },
  actionRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  input: {
    background: "#fafafa", border: "1.5px solid #e0d9ff", color: "#1a1a2e",
    padding: "9px 13px", borderRadius: 12, fontSize: 14, width: 120, outline: "none",
  },
  greenBtn: {
    background: "linear-gradient(135deg,#30D158,#34C759)", color: "#fff", border: "none",
    padding: "10px 20px", borderRadius: 50, cursor: "pointer", fontWeight: 700, fontSize: 13,
    boxShadow: "0 2px 10px rgba(48,209,88,0.3)",
  },
  orangeBtn: {
    background: "linear-gradient(135deg,#FF9500,#FFB340)", color: "#fff", border: "none",
    padding: "10px 20px", borderRadius: 50, cursor: "pointer", fontWeight: 700, fontSize: 13,
    boxShadow: "0 2px 10px rgba(255,149,0,0.3)",
  },
  redBtn: {
    background: "linear-gradient(135deg,#FF453A,#FF6B6B)", color: "#fff", border: "none",
    padding: "10px 18px", borderRadius: 50, cursor: "pointer", fontWeight: 700, fontSize: 13,
    boxShadow: "0 2px 10px rgba(255,69,58,0.3)",
  },
  createForm: {
    background: "#fff", border: "1.5px solid #e8e0ff", borderRadius: 20, padding: "28px",
    boxShadow: "0 4px 24px rgba(108,71,255,0.1)",
  },
  formTitle: { fontSize: 17, fontWeight: 800, color: "#6C47FF", marginBottom: 8 },
  formDesc:  { color: "#aaa", fontSize: 13, marginBottom: 22 },
  formGrid:  { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 20, marginBottom: 22 },
  collateralPreview: {
    background: "#fff9f0", border: "1.5px solid #ffe4b0", borderRadius: 14,
    padding: "16px 20px", marginBottom: 22, display: "flex", alignItems: "center",
  },
  createBtn: {
    background: "linear-gradient(135deg,#6C47FF,#9B72FF)", color: "#fff", border: "none",
    padding: "13px 32px", borderRadius: 50, cursor: "pointer", fontWeight: 800, fontSize: 15,
    boxShadow: "0 4px 20px rgba(108,71,255,0.35)",
  },
  empty: { color: "#ccc", fontSize: 14, padding: "40px 0", textAlign: "center" },
};