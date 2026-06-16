import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

import HHUSD_ABI   from "./abi/HHUSD.json";
import VAULT_ABI   from "./abi/CollateralVault.json";
import ADDRESSES   from "./deployedAddresses.json";

import { useAutoGroup }   from "./useAutoGroup.js";
import { useCustomGroup } from "./useCustomGroup.js";
import { LanguageProvider, useLang } from "./i18n/LanguageContext.jsx";
import { LANGUAGES } from "./i18n/translations.js";

import AutoGroupTab    from "./components/AutoGroupTab.jsx";
import CustomGroupTab  from "./components/CustomGroupTab.jsx";
import DashboardTab    from "./components/DashboardTab.jsx";
import WhitepaperTab   from "./components/WhitepaperTab.jsx";

const ADDR = ADDRESSES.contracts;

// 탭 레이블은 useLang 훅으로 동적 처리

// 언어 선택기 컴포넌트
function LangSwitcher() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const cur = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <div style={{ position:"relative" }}>
      <button onClick={() => setOpen(o => !o)} style={ls.btn}>
        {cur.flag} {cur.label} ▾
      </button>
      {open && (
        <div style={ls.dropdown} onMouseLeave={() => setOpen(false)}>
          {LANGUAGES.map(l => (
            <div key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              style={{ ...ls.item, background: l.code === lang ? "#1a2a3a" : "transparent" }}
            >
              {l.flag} {l.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ls = {
  btn: {
    background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#bbb",
    padding:"6px 12px", borderRadius:8, cursor:"pointer", fontSize:13,
    whiteSpace:"nowrap",
  },
  dropdown: {
    position:"absolute", right:0, top:"calc(100% + 4px)", zIndex:999,
    background:"#111", border:"1px solid #2a2a2a", borderRadius:10,
    minWidth:160, boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
    maxHeight:320, overflowY:"auto",
  },
  item: {
    padding:"8px 14px", cursor:"pointer", fontSize:13, color:"#ccc",
    display:"flex", alignItems:"center", gap:8,
  },
};

function AppInner() {
  const { t } = useLang();
  const [provider,  setProvider]  = useState(null);
  const [signer,    setSigner]    = useState(null);
  const [account,   setAccount]   = useState(null);
  const [chainId,   setChainId]   = useState(null);
  const [contracts, setContracts] = useState(null);

  const [hhusdBal,  setHhusdBal]  = useState("0");
  const [lockedCol, setLockedCol] = useState("0");
  const [usdtBal,   setUsdtBal]   = useState("0");

  // 플랫폼 전체 통계
  const [platformStats, setPlatformStats] = useState({
    totalUsers:    0,   // 전체 방 멤버 수 합산
    totalPool:     "0", // 전체 계 금액 합산 (HHUSD)
    totalGroups:   0,   // 전체 방 수
    activeGroups:  0,   // 진행 중인 방 수 (ACTIVE)
  });

  const [loading, setLoading] = useState(false);
  const [txHash,  setTxHash]  = useState(null);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState("dashboard");

  const TABS = [
    { id:"dashboard",  label: t("tab_dashboard") },
    { id:"auto",       label: t("tab_auto") },
    { id:"custom",     label: t("tab_custom") },
    { id:"whitepaper", label: t("tab_whitepaper") },
  ];

  // ── 트랜잭션 헬퍼 ────────────────────────────────────────────────────────
  const onTx = useCallback(async (fn) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const tx = await fn();
      setTxHash(tx.hash);
      await tx.wait();
    } catch (e) {
      setError(e.reason || e.shortMessage || e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 지갑 연결 ────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!window.ethereum) { setError("MetaMask를 설치해주세요"); return; }
    try {
      setLoading(true);
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();
      const addr = await sign.getAddress();
      const net  = await prov.getNetwork();

      const c = {
        hhusd: new ethers.Contract(ADDR.HHUSD,          HHUSD_ABI, sign),
        vault: new ethers.Contract(ADDR.CollateralVault, VAULT_ABI, sign),
        usdt:  new ethers.Contract(ADDR.MockUSDT, [
          "function balanceOf(address) view returns (uint256)",
          "function approve(address,uint256) returns (bool)",
          "function mint(address,uint256)",
          "function allowance(address,address) view returns (uint256)",
        ], sign),
      };

      setProvider(prov); setSigner(sign);
      setAccount(addr); setChainId(Number(net.chainId));
      setContracts(c);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  // ── 잔액 새로고침 ─────────────────────────────────────────────────────────
  const refreshBalances = useCallback(async () => {
    if (!contracts || !account) return;
    try {
      const [h, l, u] = await Promise.all([
        contracts.hhusd.balanceOf(account),
        contracts.vault.getCollateralBalance(account),
        contracts.usdt.balanceOf(account),
      ]);
      setHhusdBal(ethers.formatEther(h));
      setLockedCol(ethers.formatEther(l));
      setUsdtBal(ethers.formatEther(u));
    } catch (e) { console.error(e); }
  }, [contracts, account]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  // ── 그룹 훅 ──────────────────────────────────────────────────────────────
  const autoGroup   = useAutoGroup(signer, account, contracts?.vault, contracts?.hhusd, onTx);
  const customGroup = useCustomGroup(signer, account, contracts?.hhusd, onTx);

  useEffect(() => {
    if (account) { autoGroup.refresh(); customGroup.refresh(); }
  }, [account]);

  // ── 플랫폼 통계 집계 ─────────────────────────────────────────────────────
  useEffect(() => {
    // autoGroup.activeInfos + customGroup.allGroups 로부터 집계
    const autoAll  = autoGroup.activeInfos  || [];
    const customAll = customGroup.allGroups || [];

    let totalUsers   = 0;
    let totalPoolWei = 0n;
    let totalGroups  = 0;
    let activeGroups = 0;

    // 자동화방: activeInfos는 티어별 현재 활성방만 보여줌
    // 정확한 totalGroups는 autoGroup.activeInfos[i].totalGroups 합산
    for (const info of autoAll) {
      totalUsers  += info.memberCount || 0;
      totalGroups += info.totalGroups || 0;
      if (info.state === 2) activeGroups++; // ACTIVE
      // 계 금액 = contributionAmount × totalCycles × memberCount (근사)
      const tierAmts = [10, 20, 50, 100, 200];
      const contrib  = BigInt(tierAmts[info.tierIndex] || 0) * BigInt(1e18);
      const members  = BigInt(info.memberCount || 0);
      totalPoolWei  += contrib * members * 28n; // 28 사이클 기준
    }

    // 커스텀방
    for (const g of customAll) {
      totalUsers  += g.memberCount || 0;
      totalGroups += 1;
      if (g.state === 2) activeGroups++;
      // 계 금액 = contributionAmount × maxMembers × memberCount (실납입 기준)
      try {
        const contrib = BigInt(Math.round(parseFloat(g.contributionAmount || "0") * 1e18));
        const members = BigInt(g.memberCount || 0);
        totalPoolWei += contrib * members;
      } catch {}
    }

    setPlatformStats({
      totalUsers,
      totalPool:    (Number(totalPoolWei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 }),
      totalGroups,
      activeGroups,
    });
  }, [autoGroup.activeInfos, customGroup.allGroups]);

  // ── 유틸 ─────────────────────────────────────────────────────────────────
  const mintHHUSD = async (amount) => {
    if (!contracts) return;
    await onTx(() => contracts.usdt.mint(account, ethers.parseEther(String(amount))));
    await refreshBalances();
  };

  const fmt   = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const short = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : "";

  // ── 공통 props ───────────────────────────────────────────────────────────
  const sharedProps = {
    account, loading, txHash, error,
    hhusdBal, lockedCol, usdtBal,
    refreshBalances, fmt, short, onTx,
    contracts,
  };

  // ── 미연결 화면 ───────────────────────────────────────────────────────────
  if (!account) return (
    <div style={s.root}>
      <div style={{ position:"absolute", top:16, right:20 }}><LangSwitcher /></div>
      <div style={s.center}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>💎</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: "#7EB8F7", marginBottom: 8 }}>
          HH Finance
        </div>
        <div style={{ color: "#aaa", marginBottom: 8 }}>
          Decentralized Rotating Credit Protocol
        </div>
        <div style={{ color: "#555", fontSize: 13, marginBottom: 32 }}>
          Auto Room · Custom Room · Collateral System
        </div>
        {error && <div style={s.error}>{error}</div>}
        <button onClick={connect} disabled={loading}
          style={{ ...s.btn, background: "#7EB8F7", fontSize: 16, padding: "14px 48px" }}>
          {loading ? t("connecting") : `🦊 ${t("connect_wallet")}`}
        </button>
        <div style={{ color: "#444", fontSize: 12, marginTop: 20 }}>
          {t("chain")}: {ADDRESSES.network} (ID: {ADDRESSES.chainId})
        </div>
      </div>
    </div>
  );

  return (
    <div style={s.root}>
      {/* 헤더 */}
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>💎</span>
          <span style={{ fontWeight: 700, fontSize: 17, color: "#7EB8F7" }}>HH Finance</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LangSwitcher />
          <span style={{ color: "#444", fontSize: 12 }}>Chain: {chainId}</span>
          <div style={s.walletBadge}>
            <span style={{ color: "#A8F77E", marginRight: 6 }}>●</span>
            <span style={{ color: "#eee", fontSize: 13 }}>{short(account)}</span>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div style={s.tabBar}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...s.tabBtn, ...(tab === t.id ? s.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 알림 */}
      {error  && <div style={s.error}>⚠ {error}</div>}
      {txHash && <div style={s.success}>✓ TX: {short(txHash)}</div>}
      {loading && <div style={s.info}>⏳ 트랜잭션 처리 중...</div>}

      {/* 탭 내용 */}
      <div style={s.content}>
        {tab === "dashboard" && (
          <DashboardTab
            {...sharedProps}
            mintHHUSD={mintHHUSD}
            autoMyGroups={autoGroup.myGroups}
            customMyGroups={customGroup.myGroups}
            platformStats={platformStats}
          />
        )}
        {tab === "auto" && (
          <AutoGroupTab
            {...sharedProps}
            {...autoGroup}
          />
        )}
        {tab === "custom" && (
          <CustomGroupTab
            {...sharedProps}
            {...customGroup}
          />
        )}
        {tab === "whitepaper" && <WhitepaperTab />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}

// ── 스타일 ──────────────────────────────────────────────────────────────────
const s = {
  root: {
    minHeight: "100vh", background: "#0d0d0d",
    color: "#eee", fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  center: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: "100vh",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 24px", borderBottom: "1px solid #1e1e1e",
    background: "#111",
  },
  tabBar: {
    display: "flex", gap: 4, padding: "12px 24px",
    borderBottom: "1px solid #1a1a1a", background: "#0f0f0f",
  },
  tabBtn: {
    background: "none", border: "1px solid #2a2a2a",
    color: "#888", padding: "7px 18px", borderRadius: 8,
    cursor: "pointer", fontSize: 14, fontWeight: 500,
    transition: "all 0.15s",
  },
  tabActive: {
    background: "#1a2a3a", borderColor: "#7EB8F7", color: "#7EB8F7",
  },
  walletBadge: {
    background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center",
  },
  content: { padding: "24px", maxWidth: 1100, margin: "0 auto" },
  btn: {
    border: "none", borderRadius: 8, color: "#111",
    padding: "10px 20px", cursor: "pointer", fontWeight: 700,
    fontSize: 14, transition: "opacity 0.15s",
  },
  error:   { background: "#2a1010", border: "1px solid #5a2020", borderRadius: 8, padding: "10px 16px", color: "#f88", marginBottom: 12 },
  success: { background: "#102a10", border: "1px solid #205a20", borderRadius: 8, padding: "10px 16px", color: "#8f8", marginBottom: 12 },
  info:    { background: "#1a1a2a", border: "1px solid #2a2a5a", borderRadius: 8, padding: "10px 16px", color: "#88f", marginBottom: 12 },
};
