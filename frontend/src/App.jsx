import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

import HHUSD_ABI   from "./abi/HHUSD.json";
import VAULT_ABI   from "./abi/CollateralVault.json";
import TREASURY_ABI from "./abi/TreasuryV2.json";
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
              style={{ ...ls.item, background: l.code === lang ? "#f0ecff" : "transparent" }}
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
    background:"#fff", border:"1px solid #e0d9ff", color:"#6C47FF",
    padding:"6px 12px", borderRadius:50, cursor:"pointer", fontSize:13,
    whiteSpace:"nowrap", fontWeight:600,
  },
  dropdown: {
    position:"absolute", right:0, top:"calc(100% + 4px)", zIndex:999,
    background:"#fff", border:"1px solid #e0d9ff", borderRadius:14,
    minWidth:160, boxShadow:"0 8px 32px rgba(108,71,255,0.15)",
    maxHeight:320, overflowY:"auto",
  },
  item: {
    padding:"8px 14px", cursor:"pointer", fontSize:13, color:"#444",
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

  const [platformStats, setPlatformStats] = useState({
    totalUsers:    0,
    totalPool:     "0",
    totalGroups:   0,
    activeGroups:  0,
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
        hhusd:    new ethers.Contract(ADDR.HHUSD,          HHUSD_ABI,    sign),
        vault:    new ethers.Contract(ADDR.CollateralVault, VAULT_ABI,    sign),
        treasury: new ethers.Contract(ADDR.TreasuryV2,      TREASURY_ABI, sign),
        usdt:     new ethers.Contract(ADDR.MockUSDT, [
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

  const autoGroup   = useAutoGroup(signer, account, contracts?.vault, contracts?.hhusd, onTx, refreshBalances);
  const customGroup = useCustomGroup(signer, account, contracts?.hhusd, onTx, refreshBalances);

  useEffect(() => {
    if (account) { autoGroup.refresh(); customGroup.refresh(); }
  }, [account]);

  useEffect(() => {
    const autoAll   = autoGroup.activeInfos  || [];
    const customAll = customGroup.allGroups || [];

    let totalUsers   = 0;
    let totalPoolWei = 0n;
    let totalGroups  = 0;
    let activeGroups = 0;

    for (const info of autoAll) {
      totalUsers  += info.memberCount || 0;
      totalGroups += info.totalGroups || 0;
      if (info.state === 2) activeGroups++;
      const tierAmts = [10, 20, 50, 100, 200];
      const contrib  = BigInt(tierAmts[info.tierIndex] || 0) * BigInt(1e18);
      const members  = BigInt(info.memberCount || 0);
      totalPoolWei  += contrib * members * 28n;
    }

    for (const g of customAll) {
      totalUsers  += g.memberCount || 0;
      totalGroups += 1;
      if (g.state === 2) activeGroups++;
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

  const mintMockUSDT = async (amount) => {
    if (!contracts) return;
    await onTx(() => contracts.usdt.mint(account, ethers.parseEther(String(amount))));
    await refreshBalances();
  };

  const fmt   = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const short = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : "";

  const sharedProps = {
    account, loading, txHash, error,
    hhusdBal, lockedCol, usdtBal,
    refreshBalances, fmt, short, onTx,
    contracts, ethers,
  };

  if (!account) return (
    <div style={s.root}>
      <div style={{ position:"absolute", top:60, left:80, width:18, height:18, borderRadius:"50%", background:"#FF9500", opacity:0.7 }} />
      <div style={{ position:"absolute", top:120, right:120, width:12, height:12, borderRadius:"50%", background:"#FFD60A", opacity:0.6 }} />
      <div style={{ position:"absolute", bottom:180, left:140, width:14, height:14, transform:"rotate(45deg)", background:"#6C47FF", opacity:0.3 }} />
      <div style={{ position:"absolute", bottom:100, right:80, width:20, height:20, borderRadius:"50%", background:"#30D158", opacity:0.5 }} />
      <div style={{ position:"absolute", top:16, right:20 }}><LangSwitcher /></div>
      <div style={s.center}>
        <div style={s.logoWrap}>
          <div style={{ fontSize: 48, lineHeight:1 }}>💎</div>
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#6C47FF", marginBottom: 6, letterSpacing:-0.5 }}>
          HH Finance
        </div>
        <div style={{ color: "#666", marginBottom: 6, fontSize:15 }}>
          Decentralized Rotating Credit Protocol
        </div>
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 40 }}>
          Auto Room · Custom Room · Collateral System
        </div>
        {error && <div style={s.error}>{error}</div>}
        <button onClick={connect} disabled={loading}
          style={{ ...s.btn, background: "linear-gradient(135deg,#6C47FF,#9B72FF)", color:"#fff", fontSize: 16, padding: "14px 52px", borderRadius:50, boxShadow:"0 4px 20px rgba(108,71,255,0.35)" }}>
          {loading ? t("connecting") : `🦊 ${t("connect_wallet")}`}
        </button>
        <div style={{ color: "#bbb", fontSize: 12, marginTop: 24 }}>
          {t("chain")}: {ADDRESSES.network} (ID: {ADDRESSES.chainId})
        </div>
      </div>
    </div>
  );

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>💎</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#6C47FF" }}>HH Finance</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LangSwitcher />
          <span style={{ color: "#bbb", fontSize: 12 }}>Chain: {chainId}</span>
          <div style={s.walletBadge}>
            <span style={{ color: "#30D158", marginRight: 6 }}>●</span>
            <span style={{ color: "#1a1a2e", fontSize: 13, fontWeight:600 }}>{short(account)}</span>
          </div>
        </div>
      </div>

      <div style={s.tabBar}>
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            style={{ ...s.tabBtn, ...(tab === tb.id ? s.tabActive : {}) }}>
            {tb.label}
          </button>
        ))}
      </div>

      {error  && <div style={s.errorBanner}>⚠ {error}</div>}
      {txHash && <div style={s.successBanner}>✓ TX: {short(txHash)}</div>}
      {loading && <div style={s.infoBanner}>⏳ 트랜잭션 처리 중...</div>}

      <div style={s.content}>
        {tab === "dashboard" && (
          <DashboardTab
            {...sharedProps}
            mintMockUSDT={mintMockUSDT}
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

const s = {
  root: {
    minHeight: "100vh", background: "#FAFAFA",
    color: "#1a1a2e", fontFamily: "'Inter', 'Segoe UI', sans-serif",
    position: "relative",
  },
  center: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: "100vh",
  },
  logoWrap: {
    width: 80, height: 80, borderRadius: 24,
    background: "linear-gradient(135deg,#f0ecff,#e8e0ff)",
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 20, boxShadow: "0 4px 20px rgba(108,71,255,0.15)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 28px", borderBottom: "1px solid #f0ecff",
    background: "#fff", boxShadow: "0 1px 8px rgba(108,71,255,0.06)",
  },
  tabBar: {
    display: "flex", gap: 0, padding: "0 28px",
    borderBottom: "2px solid #f0ecff", background: "#fff",
  },
  tabBtn: {
    background: "none", border: "none", borderBottom: "3px solid transparent",
    color: "#999", padding: "14px 20px", marginBottom: -2,
    cursor: "pointer", fontSize: 14, fontWeight: 600,
    transition: "all 0.15s",
  },
  tabActive: {
    borderBottomColor: "#6C47FF", color: "#6C47FF",
  },
  walletBadge: {
    background: "#f5f3ff", border: "1px solid #e0d9ff",
    borderRadius: 50, padding: "6px 14px", display: "flex", alignItems: "center",
  },
  content: { padding: "28px", maxWidth: 1100, margin: "0 auto" },
  btn: {
    border: "none", borderRadius: 50, color: "#fff",
    padding: "10px 24px", cursor: "pointer", fontWeight: 700,
    fontSize: 14, transition: "opacity 0.15s",
  },
  errorBanner: {
    background: "#fff0f0", border: "1px solid #ffd0d0", borderRadius: 10,
    padding: "10px 20px", color: "#c0392b", margin: "12px 28px 0",
  },
  successBanner: {
    background: "#f0fff4", border: "1px solid #b7ebc4", borderRadius: 10,
    padding: "10px 20px", color: "#27ae60", margin: "12px 28px 0",
  },
  infoBanner: {
    background: "#f5f3ff", border: "1px solid #d5ccff", borderRadius: 10,
    padding: "10px 20px", color: "#6C47FF", margin: "12px 28px 0",
  },
};