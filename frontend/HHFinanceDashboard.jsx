import { useState, useEffect } from "react";

// ── Mock Data ──────────────────────────────────────────────────────────────────
const MOCK_USER = {
  address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  hhusdBalance: 2840.0,
  usdtBalance: 1200.0,
  lockedCollateral: 1000.0,
  referralEarned: 42.5,
};

const MOCK_GROUPS = [
  {
    id: 1, template: "100 USDT × 10 Cycles", state: "ACTIVE",
    contribution: 100, cycles: 10, currentCycle: 4,
    members: 12, maxMembers: 20, myPosition: 7,
    nextPayout: "2026-06-06", nextRecipient: "0x3fA0...9c2B",
    progressPct: 40,
  },
  {
    id: 2, template: "50 USDT × 10 Cycles", state: "ENROLLING",
    contribution: 50, cycles: 10, currentCycle: 0,
    members: 7, maxMembers: 20, myPosition: null,
    nextPayout: null, nextRecipient: null,
    progressPct: 0,
    enrollmentEnds: "2026-06-01",
  },
  {
    id: 3, template: "20 USDT × 10 Cycles", state: "COMPLETED",
    contribution: 20, cycles: 10, currentCycle: 10,
    members: 10, maxMembers: 10, myPosition: 3,
    nextPayout: null, nextRecipient: null,
    progressPct: 100,
  },
];

const PUBLIC_TEMPLATES = [
  { id: 0, amount: 10, cycles: 10, interval: "Weekly", collateral: "100%", color: "#7EB8F7" },
  { id: 1, amount: 20, cycles: 10, interval: "Weekly", collateral: "100%", color: "#F7C97E" },
  { id: 2, amount: 50, cycles: 10, interval: "Weekly", collateral: "100%", color: "#A8F77E" },
  { id: 3, amount: 100, cycles: 10, interval: "Weekly", collateral: "100%", color: "#F77E7E" },
];

const PAYOUT_SCHEDULE = [
  { cycle: 1, recipient: "0xAa1b...3C4D", date: "2026-03-15", status: "paid" },
  { cycle: 2, recipient: "0x19Fe...7E8F", date: "2026-03-22", status: "paid" },
  { cycle: 3, recipient: "0xBb2C...1A2B", date: "2026-03-29", status: "paid" },
  { cycle: 4, recipient: "0xCc3D...5E6F", date: "2026-04-05", status: "active" },
  { cycle: 5, recipient: "0xDd4E...9A0B", date: "2026-04-12", status: "upcoming" },
  { cycle: 6, recipient: "0xEe5F...3C4D", date: "2026-04-19", status: "upcoming" },
  { cycle: 7, recipient: "0x71C7...976F", date: "2026-04-26", status: "mine" },
  { cycle: 8, recipient: "0xFf6G...7E8F", date: "2026-05-03", status: "upcoming" },
  { cycle: 9, recipient: "0xGg7H...1A2B", date: "2026-05-10", status: "upcoming" },
  { cycle: 10, recipient: "0xHh8I...5E6F", date: "2026-05-17", status: "upcoming" },
];

// ── Icons ──────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 16 }) => {
  const icons = {
    wallet:   "M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2 4h2v2H4v-2zm4 0h2v2H8v-2z",
    arrow:    "M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4",
    group:    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    shield:   "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    chart:    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    plus:     "M12 4v16m8-8H4",
    check:    "M5 13l4 4L19 7",
    clock:    "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    key:      "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
    link:     "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
    copy:     "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
    home:     "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name]} />
    </svg>
  );
};

// ── StatCard ───────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, accent, icon }) => (
  <div style={{
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${accent}30`,
    borderRadius: 16,
    padding: "20px 24px",
    position: "relative",
    overflow: "hidden",
  }}>
    <div style={{
      position: "absolute", top: -20, right: -20,
      width: 80, height: 80, borderRadius: "50%",
      background: `${accent}18`,
    }} />
    <div style={{ color: accent, marginBottom: 8, opacity: 0.9 }}>
      <Icon name={icon} size={18} />
    </div>
    <div style={{ fontSize: 13, color: "#8899AA", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {label}
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, color: "#EEF2FF", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em" }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 12, color: "#667788", marginTop: 4 }}>{sub}</div>}
  </div>
);

// ── GroupCard ──────────────────────────────────────────────────────────────────
const GroupCard = ({ group, onClick }) => {
  const stateColor = {
    ACTIVE: "#4ADE80", ENROLLING: "#FBBF24", COMPLETED: "#818CF8", CANCELLED: "#F87171"
  };
  const color = stateColor[group.state] || "#8899AA";
  return (
    <div onClick={() => onClick(group)} style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: "20px 22px",
      cursor: "pointer",
      transition: "all 0.2s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = `${color}60`}
    onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#EEF2FF" }}>{group.template}</div>
          <div style={{ fontSize: 12, color: "#667788", marginTop: 3 }}>Group #{group.id}</div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, color: color,
          background: `${color}20`, padding: "3px 10px", borderRadius: 20,
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}>{group.state}</span>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8899AA", marginBottom: 6 }}>
          <span>Cycle {group.currentCycle}/{group.cycles}</span>
          <span>{group.progressPct}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
          <div style={{
            height: "100%", width: `${group.progressPct}%`,
            background: `linear-gradient(90deg, ${color}80, ${color})`,
            borderRadius: 4, transition: "width 0.6s ease",
          }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ fontSize: 12, color: "#8899AA" }}>
          <span style={{ color: "#AAB8CC" }}>{group.members}</span>/{group.maxMembers} members
        </div>
        {group.myPosition && (
          <div style={{ fontSize: 12, color: "#8899AA" }}>
            My position: <span style={{ color: color }}>#{group.myPosition}</span>
          </div>
        )}
        {group.state === "ENROLLING" && group.enrollmentEnds && (
          <div style={{ fontSize: 12, color: "#FBBF24" }}>
            Ends {group.enrollmentEnds}
          </div>
        )}
      </div>
    </div>
  );
};

// ── DepositModal ───────────────────────────────────────────────────────────────
const DepositModal = ({ onClose }) => {
  const [tab, setTab] = useState("deposit");
  const [amount, setAmount] = useState("");
  const fee = amount ? (parseFloat(amount) * 0.025).toFixed(2) : "0.00";
  const net = amount ? (parseFloat(amount) * 0.975).toFixed(2) : "0.00";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0F1722", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 20, padding: 28, width: 380, maxWidth: "90vw",
      }}>
        <div style={{ display: "flex", gap: 2, marginBottom: 24, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 4 }}>
          {["deposit", "redeem"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
              background: tab === t ? "rgba(120,160,255,0.2)" : "transparent",
              color: tab === t ? "#7EA8FF" : "#667788",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              cursor: "pointer", textTransform: "capitalize", letterSpacing: "0.03em",
              transition: "all 0.2s",
            }}>{t}</button>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#667788", letterSpacing: "0.04em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
            {tab === "deposit" ? "USDT Amount" : "HHUSD Amount"}
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="number" placeholder="0.00" value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{
                width: "100%", padding: "12px 56px 12px 16px",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, color: "#EEF2FF", fontFamily: "'DM Mono', monospace",
                fontSize: 16, outline: "none", boxSizing: "border-box",
              }}
            />
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#667788", fontWeight: 600 }}>
              {tab === "deposit" ? "USDT" : "HHUSD"}
            </span>
          </div>
        </div>

        {/* Fee breakdown */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          {[
            ["Protocol Fee (2.5%)", `${fee}`],
            [tab === "deposit" ? "HHUSD Received" : "USDT Received", net],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: "#667788" }}>{k}</span>
              <span style={{ color: "#EEF2FF", fontFamily: "'DM Mono', monospace" }}>{v}</span>
            </div>
          ))}
        </div>

        <button style={{
          width: "100%", padding: "13px 0",
          background: "linear-gradient(135deg, #3B6FEA, #6B3BEA)",
          border: "none", borderRadius: 12, color: "#fff",
          fontFamily: "inherit", fontSize: 14, fontWeight: 700,
          cursor: "pointer", letterSpacing: "0.03em",
        }}>
          {tab === "deposit" ? "Deposit USDT" : "Redeem HHUSD"}
        </button>
      </div>
    </div>
  );
};

// ── JoinGroupModal ─────────────────────────────────────────────────────────────
const JoinGroupModal = ({ onClose }) => {
  const [view, setView] = useState("browse"); // browse | create-private
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0F1722", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 20, padding: 28, width: 480, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#EEF2FF", marginBottom: 20 }}>
          Join a Group
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["browse", "Public Groups"], ["create-private", "Create Private"]].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: view === v ? "rgba(120,160,255,0.2)" : "rgba(255,255,255,0.05)",
              color: view === v ? "#7EA8FF" : "#667788",
              fontFamily: "inherit", fontSize: 13, cursor: "pointer", fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>

        {view === "browse" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {PUBLIC_TEMPLATES.map(t => (
              <div key={t.id} onClick={() => setSelectedTemplate(t.id)} style={{
                background: selectedTemplate === t.id ? `${t.color}15` : "rgba(255,255,255,0.03)",
                border: `1px solid ${selectedTemplate === t.id ? t.color : "rgba(255,255,255,0.08)"}`,
                borderRadius: 14, padding: 16, cursor: "pointer", transition: "all 0.2s",
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: t.color, fontFamily: "'DM Mono', monospace" }}>
                  ${t.amount}
                </div>
                <div style={{ fontSize: 12, color: "#8899AA", marginTop: 4 }}>
                  {t.cycles} cycles · {t.interval}
                </div>
                <div style={{ fontSize: 11, color: "#556677", marginTop: 6 }}>
                  Collateral {t.collateral}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "create-private" && (
          <div>
            {[
              ["Contribution (USDT)", "e.g. 100"],
              ["Total Cycles", "e.g. 10"],
              ["Max Members", "2–50"],
            ].map(([label, ph]) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: "#667788", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
                <input placeholder={ph} style={{
                  width: "100%", padding: "10px 14px",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10, color: "#EEF2FF", fontFamily: "'DM Mono', monospace",
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                }} />
              </div>
            ))}
          </div>
        )}

        <button style={{
          width: "100%", marginTop: 20, padding: "13px 0",
          background: "linear-gradient(135deg, #3B6FEA, #6B3BEA)",
          border: "none", borderRadius: 12, color: "#fff",
          fontFamily: "inherit", fontSize: 14, fontWeight: 700,
          cursor: "pointer", letterSpacing: "0.03em",
        }}>
          {view === "browse" ? "Join Selected Group" : "Create Private Group"}
        </button>
      </div>
    </div>
  );
};

// ── GroupDetail ────────────────────────────────────────────────────────────────
const GroupDetail = ({ group, onBack }) => (
  <div>
    <button onClick={onBack} style={{
      background: "none", border: "none", color: "#7EA8FF",
      fontFamily: "inherit", fontSize: 13, cursor: "pointer", padding: 0,
      marginBottom: 20, display: "flex", alignItems: "center", gap: 6,
    }}>
      ← Back to Groups
    </button>

    <div style={{ fontSize: 22, fontWeight: 700, color: "#EEF2FF", marginBottom: 4 }}>
      {group.template}
    </div>
    <div style={{ fontSize: 13, color: "#667788", marginBottom: 24 }}>Group #{group.id}</div>

    {/* Payout Schedule */}
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#AAB8CC", marginBottom: 16 }}>
        Payout Schedule
      </div>
      {PAYOUT_SCHEDULE.map(item => {
        const colors = { paid: "#4ADE80", active: "#FBBF24", mine: "#818CF8", upcoming: "#4A5568" };
        const c = colors[item.status];
        return (
          <div key={item.cycle} style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: `${c}20`, border: `1px solid ${c}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: c, flexShrink: 0,
            }}>{item.cycle}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: item.status === "mine" ? "#818CF8" : "#AAB8CC", fontFamily: "'DM Mono', monospace" }}>
                {item.recipient} {item.status === "mine" && "← YOU"}
              </div>
              <div style={{ fontSize: 11, color: "#556677" }}>{item.date}</div>
            </div>
            <div style={{
              fontSize: 11, fontWeight: 600, color: c,
              background: `${c}15`, padding: "2px 8px", borderRadius: 6,
              textTransform: "uppercase",
            }}>{item.status}</div>
          </div>
        );
      })}
    </div>
  </div>
);

// ── Main App ───────────────────────────────────────────────────────────────────
export default function HHFinanceDashboard() {
  const [tab, setTab] = useState("overview");
  const [showDeposit, setShowDeposit] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [copied, setCopied] = useState(false);

  const referralLink = `https://hhfinance.app/ref/${MOCK_USER.address.slice(2, 10)}`;

  const copyReferral = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItems = [
    { id: "overview", icon: "home", label: "Overview" },
    { id: "groups", icon: "group", label: "My Groups" },
    { id: "referral", icon: "link", label: "Referral" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080E18",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: "#EEF2FF",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      {/* Ambient background */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 60% 40% at 20% 20%, rgba(60,120,255,0.08) 0%, transparent 60%), radial-gradient(ellipse 50% 35% at 80% 80%, rgba(120,60,255,0.06) 0%, transparent 60%)",
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "20px 0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: "linear-gradient(135deg, #3B6FEA, #6B3BEA)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "#fff",
            }}>H</div>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>HH Finance</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.05)", borderRadius: 10,
            padding: "7px 12px", border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80" }} />
            <span style={{ fontSize: 12, color: "#8899AA", fontFamily: "'DM Mono', monospace" }}>
              {MOCK_USER.address.slice(0, 6)}…{MOCK_USER.address.slice(-4)}
            </span>
          </div>
        </div>

        {/* Nav */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28 }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => { setTab(n.id); setSelectedGroup(null); }} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", borderRadius: 10, border: "none",
              background: tab === n.id ? "rgba(120,160,255,0.15)" : "transparent",
              color: tab === n.id ? "#7EA8FF" : "#667788",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s",
              borderBottom: tab === n.id ? "1px solid rgba(120,160,255,0.3)" : "1px solid transparent",
            }}>
              <Icon name={n.icon} size={14} />
              {n.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
              <StatCard label="HHUSD Balance" value={MOCK_USER.hhusdBalance.toLocaleString()} sub="≈ $2,840.00" accent="#7EA8FF" icon="wallet" />
              <StatCard label="USDT Available" value={MOCK_USER.usdtBalance.toLocaleString()} sub="Ready to deposit" accent="#F7C97E" icon="arrow" />
              <StatCard label="Locked Collateral" value={MOCK_USER.lockedCollateral.toLocaleString()} sub="In active groups" accent="#F77E7E" icon="shield" />
              <StatCard label="Referral Earned" value={`$${MOCK_USER.referralEarned}`} sub="All time" accent="#4ADE80" icon="chart" />
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
              <button onClick={() => setShowDeposit(true)} style={{
                flex: 1, padding: "13px 0",
                background: "linear-gradient(135deg, #3B6FEA, #6B3BEA)",
                border: "none", borderRadius: 12, color: "#fff",
                fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8,
              }}>
                <Icon name="arrow" size={16} /> Deposit / Redeem
              </button>
              <button onClick={() => setShowJoin(true)} style={{
                flex: 1, padding: "13px 0",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12, color: "#EEF2FF",
                fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8,
              }}>
                <Icon name="plus" size={16} /> Join Group
              </button>
            </div>

            {/* Active groups preview */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#8899AA", marginBottom: 14, letterSpacing: "0.03em", textTransform: "uppercase" }}>
                Active Groups
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {MOCK_GROUPS.filter(g => g.state === "ACTIVE" || g.state === "ENROLLING").map(g => (
                  <GroupCard key={g.id} group={g} onClick={g => { setSelectedGroup(g); setTab("groups"); }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── GROUPS TAB ───────────────────────────────────────────────────── */}
        {tab === "groups" && (
          <div>
            {selectedGroup ? (
              <GroupDetail group={selectedGroup} onBack={() => setSelectedGroup(null)} />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#EEF2FF" }}>My Groups</div>
                  <button onClick={() => setShowJoin(true)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", background: "rgba(60,111,234,0.2)",
                    border: "1px solid rgba(60,111,234,0.4)", borderRadius: 10,
                    color: "#7EA8FF", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                  }}>
                    <Icon name="plus" size={14} /> Join Group
                  </button>
                </div>
                <div style={{ display: "grid", gap: 14 }}>
                  {MOCK_GROUPS.map(g => (
                    <GroupCard key={g.id} group={g} onClick={setSelectedGroup} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── REFERRAL TAB ─────────────────────────────────────────────────── */}
        {tab === "referral" && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#EEF2FF", marginBottom: 8 }}>
              Referral Program
            </div>
            <div style={{ fontSize: 13, color: "#667788", marginBottom: 28 }}>
              Earn 1% of every deposit made by users you refer. Permanently.
            </div>

            {/* Referral link card */}
            <div style={{
              background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)",
              borderRadius: 16, padding: 24, marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, color: "#4ADE80", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Your Referral Link
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{
                  flex: 1, padding: "10px 14px",
                  background: "rgba(0,0,0,0.3)", borderRadius: 10,
                  fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#8899AA",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {referralLink}
                </div>
                <button onClick={copyReferral} style={{
                  padding: "10px 16px", background: "rgba(74,222,128,0.2)",
                  border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10,
                  color: "#4ADE80", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  whiteSpace: "nowrap",
                }}>
                  {copied ? <><Icon name="check" size={14} /> Copied!</> : <><Icon name="copy" size={14} /> Copy</>}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                ["Total Earned", "$42.50", "#4ADE80"],
                ["Referrals", "8 users", "#7EA8FF"],
                ["Pending", "$3.75", "#FBBF24"],
                ["1% on deposits", "Permanent", "#818CF8"],
              ].map(([label, val, color]) => (
                <div key={label} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 12, color: "#667788", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>

      {showDeposit && <DepositModal onClose={() => setShowDeposit(false)} />}
      {showJoin && <JoinGroupModal onClose={() => setShowJoin(false)} />}
    </div>
  );
}
