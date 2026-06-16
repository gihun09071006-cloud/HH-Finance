import { useState } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";

const STATE_COLOR = {
  ENROLLING: "#7EB8F7", POSITION_SELECTION: "#F7C97E",
  ACTIVE: "#A8F77E", COMPLETED: "#888", CANCELLED: "#F77E7E",
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
                      <span style={{ color: "#eee", fontWeight: 600, fontSize: 15 }}>
                        {fmt(g.contributionAmount)} HHUSD/{t("cycle")}
                      </span>
                      <span style={{ color: "#666", fontSize: 12 }}>
                        {t("max")} {g.maxMembers}{t("people")}
                      </span>
                      {isMe && (
                        <span style={{ ...s.badge, background: "#2a1a4a", color: "#C8A8F7" }}>
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
                      <span style={{ color: "#A8F77E", fontSize: 13 }}>✓ {t("participating")}</span>
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
                      background: g.memberCount >= g.maxMembers ? "#F7C97E" : "#7EB8F7",
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
            <span style={{ color: "#888", fontSize: 13 }}>{t("required_collateral")}:</span>
            <span style={{ color: "#F7C97E", fontSize: 18, fontWeight: 700, marginLeft: 12 }}>
              {requiredCollateral()} HHUSD
            </span>
            <span style={{ color: "#555", fontSize: 12, marginLeft: 8 }}>
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
                    <span style={{ color: "#eee", fontWeight: 600 }}>
                      {fmt(g.contributionAmount)} HHUSD/{t("cycle")}
                    </span>
                    {g.isOrganizer && (
                      <span style={{ ...s.badge, background: "#2a1a4a", color: "#C8A8F7" }}>{t("organizer")}</span>
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
      <span style={{ color: "#555", fontSize: 11 }}>{label}</span>
      <span style={{ color: "#ccc", fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function FormField({ label, desc, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ color: "#bbb", fontSize: 13, fontWeight: 600 }}>{label}</div>
      {desc && <div style={{ color: "#555", fontSize: 11 }}>{desc}</div>}
      {children}
    </div>
  );
}

const s = {
  pageTitle: { fontSize: 18, fontWeight: 700, color: "#eee" },
  desc: { color: "#666", fontSize: 13, marginBottom: 20, lineHeight: 1.6 },
  refreshBtn: {
    background: "none", border: "1px solid #2a2a2a", color: "#666",
    padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
  },
  subTabBar: { display: "flex", gap: 8, marginBottom: 18 },
  subTab: {
    background: "none", border: "1px solid #2a2a2a", color: "#666",
    padding: "6px 16px", borderRadius: 20, cursor: "pointer", fontSize: 13,
  },
  subTabActive: { borderColor: "#C8A8F7", color: "#C8A8F7", background: "#1a0a2a" },
  groupCard: {
    background: "#111", border: "1px solid #1e1e1e", borderRadius: 12,
    padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12,
  },
  myCard: {
    background: "#111", border: "1px solid #2a1a4a", borderRadius: 12,
    padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12,
  },
  groupHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  stateBadge: { fontSize: 12, fontWeight: 700 },
  badge: { fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600 },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 },
  progressBg: {
    background: "#1a1a1a", borderRadius: 20, height: 20, position: "relative", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 20, transition: "width 0.3s" },
  progressLabel: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, color: "#111", fontWeight: 700,
  },
  joinBtn: {
    background: "#C8A8F7", color: "#111", border: "none",
    padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
  },
  actionRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  input: {
    background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#eee",
    padding: "8px 12px", borderRadius: 8, fontSize: 14, width: 120,
  },
  greenBtn: {
    background: "#A8F77E", color: "#111", border: "none",
    padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
  },
  orangeBtn: {
    background: "#F7C97E", color: "#111", border: "none",
    padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
  },
  redBtn: {
    background: "#F77E7E", color: "#111", border: "none",
    padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
  },
  createForm: {
    background: "#111", border: "1px solid #2a1a4a", borderRadius: 12, padding: "24px",
  },
  formTitle: { fontSize: 16, fontWeight: 700, color: "#C8A8F7", marginBottom: 8 },
  formDesc:  { color: "#666", fontSize: 13, marginBottom: 20 },
  formGrid:  { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 18, marginBottom: 20 },
  collateralPreview: {
    background: "#1a1020", border: "1px solid #3a2a5a", borderRadius: 8,
    padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center",
  },
  createBtn: {
    background: "#C8A8F7", color: "#111", border: "none",
    padding: "12px 28px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 15,
  },
  empty: { color: "#444", fontSize: 14, padding: "32px 0", textAlign: "center" },
};
