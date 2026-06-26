import { useState } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";

const STATE_COLOR = {
  ENROLLING: "#6C47FF", POSITION_SELECTION: "#FF9500",
  ACTIVE: "#30D158", COMPLETED: "#999", CANCELLED: "#FF453A",
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={s.pageTitle}>{t("tab_auto")}</div>
        <button onClick={refresh} disabled={loading} style={s.refreshBtn}>↻ {t("refresh")}</button>
      </div>

      <div style={s.desc}>{t("auto_desc")}</div>

      <div style={s.subTabBar}>
        <button onClick={() => setSubTab("tiers")} style={{ ...s.subTab, ...(subTab === "tiers" ? s.subTabActive : {}) }}>
          {t("tier_status")}
        </button>
        <button onClick={() => setSubTab("my")} style={{ ...s.subTab, ...(subTab === "my" ? s.subTabActive : {}) }}>
          {t("my_room_tab")} ({myGroups.length})
        </button>
      </div>

      {subTab === "tiers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {activeInfos.map((info, i) => (
            <div key={i} style={s.tierCard}>
              <div style={s.tierHeader}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={s.tierBadge}>{TIER_LABELS[i]}</span>
                  {info.groupAddr !== "0x0000000000000000000000000000000000000000" ? (
                    <span style={{ ...s.stateBadge, color: STATE_COLOR[info.stateName] || "#aaa" }}>
                      {info.stateName}
                    </span>
                  ) : (
                    <span style={{ color: "#ccc", fontSize: 13 }}>{t("no_room")}</span>
                  )}
                  {info.totalGroups > 0 && (
                    <span style={{ color: "#bbb", fontSize: 12 }}>{t("total_created")} {info.totalGroups}{t("rooms_created")}</span>
                  )}
                </div>
                <button
                  onClick={() => join(i)}
                  disabled={loading}
                  style={{ ...s.joinBtn, opacity: loading ? 0.5 : 1 }}
                >
                  {t("join_btn")} ({TIER_LABELS[i]})
                </button>
              </div>

              {info.groupAddr !== "0x0000000000000000000000000000000000000000" && (
                <div style={s.tierDetail}>
                  <div style={s.detailGrid}>
                    <DetailItem label={t("member_count")} value={`${info.memberCount} / 28${t("people")}`} />
                    <DetailItem label={t("countdown")} value={info.countdownStarted ? t("countdown_started") : t("waiting")} />
                    {info.countdownStarted && info.enrollmentDeadline && (
                      <DetailItem label={t("enroll_close")} value={timeLeft(info.enrollmentDeadline)} />
                    )}
                    <DetailItem label={t("room_addr")} value={short(info.groupAddr)} />
                  </div>
                  <div style={s.progressBg}>
                    <div style={{
                      ...s.progressFill,
                      width: `${(info.memberCount / 28) * 100}%`,
                      background: info.memberCount >= 10
                        ? "linear-gradient(90deg,#30D158,#34C759)"
                        : "linear-gradient(90deg,#6C47FF,#9B72FF)",
                    }} />
                    <span style={s.progressLabel}>
                      {info.memberCount}/28{t("people")}
                      {info.memberCount >= 10 && ` (${t("countdown_possible")})`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {subTab === "my" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {myGroups.length === 0 ? (
            <div style={s.empty}>{t("no_auto_rooms")}</div>
          ) : (
            myGroups.map((g, i) => (
              <div key={i} style={s.myGroupCard}>
                <div style={s.tierHeader}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={s.tierBadge}>{g.tierLabel}</span>
                    <span style={{ ...s.stateBadge, color: STATE_COLOR[g.stateName] || "#aaa" }}>
                      {g.stateName}
                    </span>
                    <span style={{ color: "#ccc", fontSize: 12 }}>{short(g.groupAddr)}</span>
                  </div>
                </div>

                <div style={s.detailGrid}>
                  <DetailItem label={t("join_order")} value={`${g.joinOrder}${t("num_suffix")}`} />
                  <DetailItem label={t("position")} value={g.position > 0 ? `${g.position}${t("num_suffix")}` : t("unassigned")} />
                  <DetailItem label={t("member_count")} value={`${g.memberCount}${t("people")}`} />
                </div>

                {g.state === 1 && g.position === 0 && (
                  <div style={s.actionRow}>
                    <input
                      type="number" min="1" max={g.memberCount}
                      placeholder={t("pos_placeholder")}
                      value={posInput[g.groupAddr] || ""}
                      onChange={e => setPosInput(p => ({ ...p, [g.groupAddr]: e.target.value }))}
                      style={s.input}
                    />
                    <button
                      onClick={() => selectPosition(g.groupAddr, Number(posInput[g.groupAddr]))}
                      disabled={loading || !posInput[g.groupAddr]}
                      style={s.actionBtn}
                    >
                      {t("select_pos")}
                    </button>
                  </div>
                )}

                {g.state === 2 && (
                  <button
                    onClick={() => contribute(g.groupAddr)}
                    disabled={loading}
                    style={{ ...s.actionBtn, marginTop: 10 }}
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
  subTabActive: { borderColor: "#6C47FF", color: "#6C47FF", background: "#f0ecff" },
  tierCard: {
    background: "#fff", border: "1px solid #f0ecff", borderRadius: 18,
    overflow: "hidden", boxShadow: "0 2px 16px rgba(108,71,255,0.07)",
  },
  myGroupCard: {
    background: "#fff", border: "1px solid #f0ecff", borderRadius: 18,
    padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12,
    boxShadow: "0 2px 16px rgba(108,71,255,0.07)",
  },
  tierHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 22px",
  },
  tierDetail: { padding: "0 22px 18px", display: "flex", flexDirection: "column", gap: 14 },
  tierBadge: {
    background: "#f0ecff", color: "#6C47FF", fontSize: 13,
    padding: "5px 14px", borderRadius: 50, fontWeight: 700,
  },
  stateBadge: { fontSize: 12, fontWeight: 700 },
  joinBtn: {
    background: "linear-gradient(135deg,#6C47FF,#9B72FF)", color: "#fff", border: "none",
    padding: "10px 20px", borderRadius: 50, cursor: "pointer", fontWeight: 700, fontSize: 13,
    boxShadow: "0 2px 12px rgba(108,71,255,0.25)",
  },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 },
  progressBg: {
    background: "#f5f3ff", borderRadius: 50, height: 22, position: "relative", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 50, transition: "width 0.3s" },
  progressLabel: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, color: "#fff", fontWeight: 700,
    textShadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
  actionRow: { display: "flex", gap: 10, alignItems: "center" },
  input: {
    background: "#fafafa", border: "1.5px solid #e0d9ff", color: "#1a1a2e",
    padding: "9px 13px", borderRadius: 12, fontSize: 14, width: 120, outline: "none",
  },
  actionBtn: {
    background: "linear-gradient(135deg,#30D158,#34C759)", color: "#fff", border: "none",
    padding: "10px 20px", borderRadius: 50, cursor: "pointer", fontWeight: 700, fontSize: 13,
    boxShadow: "0 2px 10px rgba(48,209,88,0.3)",
  },
  empty: { color: "#ccc", fontSize: 14, padding: "40px 0", textAlign: "center" },
};