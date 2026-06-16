import { useState } from "react";

const STATE_COLOR = {
  ENROLLING: "#7EB8F7", POSITION_SELECTION: "#F7C97E",
  ACTIVE: "#A8F77E", COMPLETED: "#888", CANCELLED: "#F77E7E",
};

export default function AutoGroupTab({
  account, loading, fmt, short,
  activeInfos, myGroups, TIER_LABELS, TIER_AMOUNTS,
  join, selectPosition, contribute, refresh,
}) {
  const [posInput, setPosInput] = useState({});  // groupAddr → position 입력값
  const [subTab, setSubTab]     = useState("tiers"); // "tiers" | "my"

  const deadline = (ts) => {
    if (!ts) return "-";
    const d = new Date(ts * 1000);
    return d.toLocaleString("ko-KR");
  };

  const timeLeft = (ts) => {
    if (!ts) return "";
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "마감됨";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}시간 ${m}분 남음`;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={s.pageTitle}>자동화방</div>
        <button onClick={refresh} disabled={loading} style={s.refreshBtn}>↻ 새로고침</button>
      </div>

      <div style={s.desc}>
        10~28명이 모이면 자동 진행되는 계모임 방입니다.
        10명 입장 시 24시간 카운트다운이 시작되며, 이후 12시간 순번 선택 창이 열립니다.
      </div>

      {/* 서브탭 */}
      <div style={s.subTabBar}>
        <button onClick={() => setSubTab("tiers")} style={{ ...s.subTab, ...(subTab === "tiers" ? s.subTabActive : {}) }}>
          티어별 현황
        </button>
        <button onClick={() => setSubTab("my")} style={{ ...s.subTab, ...(subTab === "my" ? s.subTabActive : {}) }}>
          내 방 ({myGroups.length})
        </button>
      </div>

      {/* ── 티어별 현황 ── */}
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
                    <span style={{ color: "#444", fontSize: 13 }}>방 없음</span>
                  )}
                  {info.totalGroups > 0 && (
                    <span style={{ color: "#555", fontSize: 12 }}>총 {info.totalGroups}개 방 생성됨</span>
                  )}
                </div>
                <button
                  onClick={() => join(i)}
                  disabled={loading}
                  style={{ ...s.joinBtn, opacity: loading ? 0.5 : 1 }}
                >
                  참가 ({TIER_LABELS[i]})
                </button>
              </div>

              {info.groupAddr !== "0x0000000000000000000000000000000000000000" && (
                <div style={s.tierDetail}>
                  <div style={s.detailGrid}>
                    <DetailItem label="현재 인원" value={`${info.memberCount} / 28명`} />
                    <DetailItem label="카운트다운" value={info.countdownStarted ? "시작됨" : "대기 중"} />
                    {info.countdownStarted && info.enrollmentDeadline && (
                      <DetailItem label="모집 마감" value={timeLeft(info.enrollmentDeadline)} />
                    )}
                    <DetailItem label="방 주소" value={short(info.groupAddr)} />
                  </div>
                  {/* 인원 바 */}
                  <div style={s.progressBg}>
                    <div style={{
                      ...s.progressFill,
                      width: `${(info.memberCount / 28) * 100}%`,
                      background: info.memberCount >= 10 ? "#A8F77E" : "#7EB8F7",
                    }} />
                    <span style={s.progressLabel}>
                      {info.memberCount}/28명
                      {info.memberCount >= 10 && " (카운트다운 가능)"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 내 방 ── */}
      {subTab === "my" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {myGroups.length === 0 ? (
            <div style={s.empty}>참여 중인 자동화방이 없습니다.</div>
          ) : (
            myGroups.map((g, i) => (
              <div key={i} style={s.myGroupCard}>
                <div style={s.tierHeader}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={s.tierBadge}>{g.tierLabel}</span>
                    <span style={{ ...s.stateBadge, color: STATE_COLOR[g.stateName] || "#aaa" }}>
                      {g.stateName}
                    </span>
                    <span style={{ color: "#666", fontSize: 12 }}>{short(g.groupAddr)}</span>
                  </div>
                </div>

                <div style={s.detailGrid}>
                  <DetailItem label="입장순서" value={`${g.joinOrder}번`} />
                  <DetailItem label="순번" value={g.position > 0 ? `${g.position}번` : "미배정"} />
                  <DetailItem label="현재 인원" value={`${g.memberCount}명`} />
                </div>

                {/* 순번 선택 (POSITION_SELECTION 상태) */}
                {g.state === 1 && g.position === 0 && (
                  <div style={s.actionRow}>
                    <input
                      type="number" min="1" max={g.memberCount}
                      placeholder="순번 입력"
                      value={posInput[g.groupAddr] || ""}
                      onChange={e => setPosInput(p => ({ ...p, [g.groupAddr]: e.target.value }))}
                      style={s.input}
                    />
                    <button
                      onClick={() => selectPosition(g.groupAddr, Number(posInput[g.groupAddr]))}
                      disabled={loading || !posInput[g.groupAddr]}
                      style={s.actionBtn}
                    >
                      순번 선택
                    </button>
                  </div>
                )}

                {/* 납입 (ACTIVE 상태) */}
                {g.state === 2 && (
                  <button
                    onClick={() => contribute(g.groupAddr)}
                    disabled={loading}
                    style={{ ...s.actionBtn, marginTop: 10 }}
                  >
                    이번 달 납입하기
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
  subTabActive: { borderColor: "#7EB8F7", color: "#7EB8F7", background: "#0a1820" },
  tierCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden" },
  myGroupCard: {
    background: "#111", border: "1px solid #1e1e1e", borderRadius: 12,
    padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12,
  },
  tierHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 20px",
  },
  tierDetail: { padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 12 },
  tierBadge: {
    background: "#1a2a3a", color: "#7EB8F7", fontSize: 13,
    padding: "4px 12px", borderRadius: 20, fontWeight: 700,
  },
  stateBadge: { fontSize: 12, fontWeight: 600 },
  joinBtn: {
    background: "#7EB8F7", color: "#111", border: "none",
    padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
  },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 },
  progressBg: {
    background: "#1a1a1a", borderRadius: 20, height: 22, position: "relative", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 20, transition: "width 0.3s" },
  progressLabel: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, color: "#111", fontWeight: 700,
  },
  actionRow: { display: "flex", gap: 10, alignItems: "center" },
  input: {
    background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#eee",
    padding: "8px 12px", borderRadius: 8, fontSize: 14, width: 120,
  },
  actionBtn: {
    background: "#A8F77E", color: "#111", border: "none",
    padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
  },
  empty: { color: "#444", fontSize: 14, padding: "32px 0", textAlign: "center" },
};
