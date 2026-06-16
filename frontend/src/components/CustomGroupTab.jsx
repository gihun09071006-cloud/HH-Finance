import { useState } from "react";

const STATE_COLOR = {
  ENROLLING: "#7EB8F7", POSITION_SELECTION: "#F7C97E",
  ACTIVE: "#A8F77E", COMPLETED: "#888", CANCELLED: "#F77E7E",
};

const STATUS_LABEL = ["정상", "경고", "패널티", "제거됨"];

export default function CustomGroupTab({
  account, loading, fmt, short,
  allGroups, openGroups, myGroups,
  createGroup, joinGroup, kickMember, closeEnrollment, cancelGroup,
  selectPosition, contribute, refresh,
}) {
  const [subTab, setSubTab] = useState("list");  // "list" | "create" | "my"
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
    if (diff <= 0) return "마감됨";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}시간 ${m}분 남음`;
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
        <div style={s.pageTitle}>커스텀방</div>
        <button onClick={refresh} disabled={loading} style={s.refreshBtn}>↻ 새로고침</button>
      </div>

      <div style={s.desc}>
        계장(방장)이 직접 인원, 기여금, 납입 기한을 설정하는 계모임 방입니다.
        방 생성 시 담보가 선 디파짓되며, 계장이 멤버를 직접 관리할 수 있습니다.
      </div>

      {/* 서브탭 */}
      <div style={s.subTabBar}>
        <button onClick={() => setSubTab("list")} style={{ ...s.subTab, ...(subTab === "list" ? s.subTabActive : {}) }}>
          전체 방 ({allGroups.length})
        </button>
        <button onClick={() => setSubTab("create")} style={{ ...s.subTab, ...(subTab === "create" ? s.subTabActive : {}) }}>
          방 만들기
        </button>
        <button onClick={() => setSubTab("my")} style={{ ...s.subTab, ...(subTab === "my" ? s.subTabActive : {}) }}>
          내 방 ({myGroups.length})
        </button>
      </div>

      {/* ── 전체 방 목록 ── */}
      {subTab === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {allGroups.length === 0 ? (
            <div style={s.empty}>생성된 방이 없습니다. 방을 먼저 만들어보세요.</div>
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
                        {fmt(g.contributionAmount)} HHUSD/회차
                      </span>
                      <span style={{ color: "#666", fontSize: 12 }}>
                        최대 {g.maxMembers}명
                      </span>
                      {isMe && (
                        <span style={{ ...s.badge, background: "#2a1a4a", color: "#C8A8F7" }}>
                          내가 계장
                        </span>
                      )}
                    </div>
                    {g.state === 0 && !alreadyIn && !isMe && (
                      <button
                        onClick={() => joinGroup(g.groupAddr, g.contributionAmount, g.maxMembers)}
                        disabled={loading}
                        style={s.joinBtn}
                      >
                        참가
                      </button>
                    )}
                    {alreadyIn && (
                      <span style={{ color: "#A8F77E", fontSize: 13 }}>✓ 참가 중</span>
                    )}
                  </div>

                  <div style={s.detailGrid}>
                    <DetailItem label="현재 인원" value={`${g.memberCount} / ${g.maxMembers}명`} />
                    <DetailItem label="계장" value={short(g.organizer)} />
                    {g.state === 0 && g.enrollmentDeadline && (
                      <DetailItem label="모집 마감" value={timeLeft(g.enrollmentDeadline)} />
                    )}
                    <DetailItem label="방 주소" value={short(g.groupAddr)} />
                  </div>

                  {/* 인원 바 */}
                  <div style={s.progressBg}>
                    <div style={{
                      ...s.progressFill,
                      width: `${(g.memberCount / g.maxMembers) * 100}%`,
                      background: g.memberCount >= g.maxMembers ? "#F7C97E" : "#7EB8F7",
                    }} />
                    <span style={s.progressLabel}>{g.memberCount}/{g.maxMembers}명</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── 방 만들기 ── */}
      {subTab === "create" && (
        <div style={s.createForm}>
          <div style={s.formTitle}>새 계모임 방 만들기</div>
          <div style={s.formDesc}>
            방을 만들면 계장으로서 담보가 즉시 잠깁니다 (담보 선 디파짓).
          </div>

          <div style={s.formGrid}>
            <FormField label="사이클당 기여금 (HHUSD)" desc="매 회차 납입할 금액">
              <input type="number" min="1" value={form.contribution} onChange={setF("contribution")}
                style={s.input} placeholder="예: 50" />
            </FormField>

            <FormField label="최대 인원" desc="2 ~ 29명">
              <input type="number" min="2" max="29" value={form.maxMembers} onChange={setF("maxMembers")}
                style={s.input} placeholder="예: 10" />
            </FormField>

            <FormField label="납입 기한 (일)" desc="각 회차 납입 기한">
              <input type="number" min="1" value={form.cycleDays} onChange={setF("cycleDays")}
                style={s.input} placeholder="예: 7" />
            </FormField>

            <FormField label="모집 기간 (시간)" desc="방 오픈 후 참가 가능 시간">
              <input type="number" min="1" value={form.enrollHours} onChange={setF("enrollHours")}
                style={s.input} placeholder="예: 48" />
            </FormField>
          </div>

          <div style={s.collateralPreview}>
            <span style={{ color: "#888", fontSize: 13 }}>필요 담보 (140%):</span>
            <span style={{ color: "#F7C97E", fontSize: 18, fontWeight: 700, marginLeft: 12 }}>
              {requiredCollateral()} HHUSD
            </span>
            <span style={{ color: "#555", fontSize: 12, marginLeft: 8 }}>
              ({form.contribution} × {form.maxMembers}명 × 140%)
            </span>
          </div>

          <button onClick={handleCreate} disabled={loading} style={s.createBtn}>
            {loading ? "생성 중..." : "방 만들기 + 계장으로 참가"}
          </button>
        </div>
      )}

      {/* ── 내 방 ── */}
      {subTab === "my" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {myGroups.length === 0 ? (
            <div style={s.empty}>참여 중인 커스텀방이 없습니다.</div>
          ) : (
            myGroups.map((g, i) => (
              <div key={i} style={s.myCard}>
                <div style={s.groupHeader}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ ...s.stateBadge, color: STATE_COLOR[g.stateName] || "#aaa" }}>
                      {g.stateName}
                    </span>
                    <span style={{ color: "#eee", fontWeight: 600 }}>
                      {fmt(g.contributionAmount)} HHUSD/회차
                    </span>
                    {g.isOrganizer && (
                      <span style={{ ...s.badge, background: "#2a1a4a", color: "#C8A8F7" }}>계장</span>
                    )}
                  </div>
                </div>

                <div style={s.detailGrid}>
                  <DetailItem label="입장순서" value={`${g.joinOrder}번`} />
                  <DetailItem label="순번" value={g.position > 0 ? `${g.position}번` : "미배정"} />
                  <DetailItem label="상태" value={STATUS_LABEL[g.status] || "-"} />
                  <DetailItem label="인원" value={`${g.memberCount}/${g.maxMembers}명`} />
                </div>

                {/* 계장 관리 버튼 */}
                {g.isOrganizer && g.state === 0 && (
                  <div style={s.actionRow}>
                    <button onClick={() => closeEnrollment(g.groupAddr)} disabled={loading} style={s.orangeBtn}>
                      조기 모집 마감
                    </button>
                    <input
                      placeholder="강퇴할 주소"
                      value={kickInput[g.groupAddr] || ""}
                      onChange={e => setKickInput(k => ({ ...k, [g.groupAddr]: e.target.value }))}
                      style={{ ...s.input, flex: 1 }}
                    />
                    <button
                      onClick={() => kickMember(g.groupAddr, kickInput[g.groupAddr])}
                      disabled={loading || !kickInput[g.groupAddr]}
                      style={s.redBtn}
                    >
                      강퇴
                    </button>
                    <button
                      onClick={() => cancelGroup(g.groupAddr, "계장 취소")}
                      disabled={loading}
                      style={s.redBtn}
                    >
                      방 취소
                    </button>
                  </div>
                )}

                {/* 순번 선택 */}
                {g.state === 1 && g.position === 0 && (
                  <div style={s.actionRow}>
                    <input
                      type="number" min="1" max={g.maxMembers}
                      placeholder="순번 입력"
                      value={posInput[g.groupAddr] || ""}
                      onChange={e => setPosInput(p => ({ ...p, [g.groupAddr]: e.target.value }))}
                      style={s.input}
                    />
                    <button
                      onClick={() => selectPosition(g.groupAddr, Number(posInput[g.groupAddr]))}
                      disabled={loading || !posInput[g.groupAddr]}
                      style={s.greenBtn}
                    >
                      순번 선택
                    </button>
                  </div>
                )}

                {/* 납입 */}
                {g.state === 2 && (
                  <button
                    onClick={() => contribute(g.groupAddr, g.contributionAmount)}
                    disabled={loading}
                    style={{ ...s.greenBtn, alignSelf: "flex-start" }}
                  >
                    이번 회차 납입
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
