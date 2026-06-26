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
              style={{ ...ls.item, background: l.code === lang ? "#EDE9FF" : "transparent" }}
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
    background:"#F4F2FF", border:"none", color:"#5C3DE5",
    padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:13,
    whiteSpace:"nowrap", fontWeight:600, letterSpacing:0.2,
  },
  dropdown: {
    position:"absolute", right:0, top:"calc(100% + 6px)", zIndex:999,
    background:"#fff", border:"1.5px solid #EBEBF0", borderRadius:12,
    minWidth:160, boxShadow:"0 8px 32px rgba(0,0,0,0.12)",
    maxHeight:320, overflowY:"auto",
  },
  item: {
    padding:"9px 14px", cursor:"pointer", fontSize:13, color:"#3D3B54",
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
    totalUsers: 0, totalPool: "0", totalGroups: 0, activeGroups: 0,
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
    let totalUsers = 0, totalPoolWei = 0n, totalGroups = 0, activeGroups = 0;
    for (const info of autoAll) {
      totalUsers  += info.memberCount || 0;
      totalGroups += info.totalGroups || 0;
      if (info.state === 2) activeGroups++;
      const tierAmts = [10, 20, 50, 100, 200];
      const contrib  = BigInt(tierAmts[info.tierIndex] || 0) * BigInt(1e18);
      totalPoolWei  += contrib * BigInt(info.memberCount || 0) * 28n;
    }
    for (const g of customAll) {
      totalUsers  += g.memberCount || 0;
      totalGroups += 1;
      if (g.state === 2) activeGroups++;
      try {
        const contrib = BigInt(Math.round(parseFloat(g.contributionAmount || "0") * 1e18));
        totalPoolWei += contrib * BigInt(g.memberCount || 0);
      } catch {}
    }
    setPlatformStats({
      totalUsers,
      totalPool: (Number(totalPoolWei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 }),
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
    <div style={s.connectRoot}>
      <div style={{ position:"absolute", top:16, right:20 }}><LangSwitcher /></div>
      <div style={s.connectWrap}>
        <div style={s.connectCard}>
          <div style={s.logoMark}>◆</div>
          <div style={s.connectTitle}>HH Finance</div>
          <div style={s.connectSub}>Decentralized Rotating Credit Protocol</div>
          <div style={s.connectDesc}>Auto Room · Custom Room · Collateral System</div>
          {error && <div style={s.errBox}>{error}</div>}
          <button onClick={connect} disabled={loading} style={s.connectBtn}>
            {loading ? t("connecting") : `🦊 ${t("connect_wallet")}`}
          </button>
          <div style={s.connectNet}>
            {t("chain")}: {ADDRESSES.network} (ID: {ADDRESSES.chainId})
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={s.logoMark2}>◆</span>
          <span style={s.brandName}>HH Finance</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <LangSwitcher />
          <span style={s.chainBadge}>Chain {chainId}</span>
          <div style={s.walletBadge}>
            <span style={{ color:"#00C48C", fontSize:8, marginRight:6 }}>●</span>
            <span style={{ color:"#0F0A2E", fontSize:13, fontWeight:600, fontFamily:"monospace" }}>{short(account)}</span>
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
        {tab === "auto"      && <AutoGroupTab  {...sharedProps} {...autoGroup} />}
        {tab === "custom"    && <CustomGroupTab {...sharedProps} {...customGroup} />}
        {tab === "whitepaper" && <WhitepaperTab />}
      </div>
    </div>
  );
}

export default function App() {
  return <LanguageProvider><AppInner /></LanguageProvider>;
}

const s = {
  root: {
    minHeight:"100vh", background:"#F6F5FE",
    color:"#0F0A2E", fontFamily:"'Inter','Segoe UI',sans-serif",
  },
  connectRoot: {
    minHeight:"100vh",
    background:"radial-gradient(ellipse at 30% 40%, #EDE9FF 0%, #F6F5FE 55%, #E8FBF4 100%)",
    fontFamily:"'Inter','Segoe UI',sans-serif", position:"relative",
  },
  connectWrap: {
    display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh",
  },
  connectCard: {
    background:"#fff", borderRadius:24, padding:"52px 60px",
    display:"flex", flexDirection:"column", alignItems:"center",
    boxShadow:"0 8px 48px rgba(92,61,229,0.12), 0 1px 2px rgba(0,0,0,0.04)",
    border:"1.5px solid #EBEBF0", minWidth:380,
  },
  logoMark:    { fontSize:36, color:"#5C3DE5", marginBottom:20, lineHeight:1 },
  connectTitle:{ fontSize:30, fontWeight:900, color:"#0F0A2E", letterSpacing:-1.5, marginBottom:8 },
  connectSub:  { color:"#7B7A8E", fontSize:14, marginBottom:6 },
  connectDesc: { color:"#C0BFD4", fontSize:12, marginBottom:36 },
  errBox: {
    background:"#FFF1F0", border:"1.5px solid #FFCCC7", borderRadius:10,
    padding:"10px 16px", color:"#CF1322", fontSize:13, marginBottom:16,
    width:"100%", boxSizing:"border-box", textAlign:"center",
  },
  connectBtn: {
    background:"linear-gradient(135deg,#5C3DE5,#8B6DFF)", color:"#fff", border:"none",
    padding:"14px 48px", borderRadius:12, cursor:"pointer", fontWeight:700, fontSize:15,
    letterSpacing:0.3, boxShadow:"0 6px 24px rgba(92,61,229,0.35)", width:"100%",
  },
  connectNet:  { color:"#C0BFD4", fontSize:11, marginTop:20 },
  header: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"0 32px", height:64, background:"#fff",
    borderBottom:"1.5px solid #EBEBF0", position:"sticky", top:0, zIndex:100,
    boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
  },
  logoMark2:   { fontSize:18, color:"#5C3DE5" },
  brandName:   { fontWeight:800, fontSize:17, color:"#0F0A2E", letterSpacing:-0.5 },
  chainBadge:  {
    background:"#F4F2FF", color:"#7B7A8E",
    fontSize:12, padding:"5px 12px", borderRadius:8, fontWeight:600,
  },
  walletBadge: {
    background:"#F8F8FC", border:"1.5px solid #EBEBF0",
    borderRadius:10, padding:"7px 14px", display:"flex", alignItems:"center",
  },
  tabBar: {
    display:"flex", gap:4, padding:"10px 28px",
    background:"#fff", borderBottom:"1.5px solid #EBEBF0",
  },
  tabBtn: {
    background:"transparent", border:"none", color:"#9B9BAE",
    padding:"8px 18px", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:600,
    transition:"all 0.15s",
  },
  tabActive:   { background:"#EDE9FF", color:"#5C3DE5" },
  content:     { padding:"32px", maxWidth:1100, margin:"0 auto" },
  errorBanner: {
    background:"#FFF1F0", border:"1px solid #FFCCC7", borderRadius:10,
    padding:"10px 20px", color:"#CF1322", margin:"12px 32px 0",
  },
  successBanner: {
    background:"#F6FFED", border:"1px solid #B7EB8F", borderRadius:10,
    padding:"10px 20px", color:"#389E0D", margin:"12px 32px 0",
  },
  infoBanner: {
    background:"#EDE9FF", border:"1px solid #C9B8FF", borderRadius:10,
    padding:"10px 20px", color:"#5C3DE5", margin:"12px 32px 0",
  },
};