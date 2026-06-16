/**
 * HH Finance 컨트랙트 연동 훅
 * MetaMask → ethers.js → 컨트랙트 호출
 */
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

import HHUSD_ABI        from "./abi/HHUSD.json";
import TREASURY_ABI     from "./abi/TreasuryV2.json";
import VAULT_ABI        from "./abi/CollateralVault.json";
import REGISTRY_ABI     from "./abi/GroupRegistry.json";
import GROUP_ABI        from "./abi/PublicGroupVRF.json";
import ADDRESSES        from "./deployedAddresses.json";

const ADDR = ADDRESSES.contracts;

const GROUP_STATE = ["ENROLLING", "POSITION_SELECTION", "PENDING_VRF", "ACTIVE", "COMPLETED", "CANCELLED"];
const MEMBER_STATUS = ["ACTIVE", "WARNED", "PENALIZED", "REMOVED"];

export function useHHFinance() {
  const [provider, setProvider]     = useState(null);
  const [signer, setSigner]         = useState(null);
  const [account, setAccount]       = useState(null);
  const [chainId, setChainId]       = useState(null);
  const [contracts, setContracts]   = useState(null);

  const [hhusdBal, setHhusdBal]     = useState("0");
  const [lockedCol, setLockedCol]   = useState("0");
  const [groupInfo, setGroupInfo]   = useState(null);
  const [memberInfo, setMemberInfo] = useState(null);
  const [payoutSchedule, setPayoutSchedule] = useState([]);

  const [loading, setLoading]       = useState(false);
  const [txHash, setTxHash]         = useState(null);
  const [error, setError]           = useState(null);

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
        hhusd:    new ethers.Contract(ADDR.HHUSD,           HHUSD_ABI,    sign),
        treasury: new ethers.Contract(ADDR.TreasuryV2,      TREASURY_ABI, sign),
        vault:    new ethers.Contract(ADDR.CollateralVault,  VAULT_ABI,    sign),
        registry: new ethers.Contract(ADDR.GroupRegistry,   REGISTRY_ABI, sign),
        group:    new ethers.Contract(ADDR.PublicGroupVRF,   GROUP_ABI,    sign),
        usdt:     new ethers.Contract(ADDR.MockUSDT, [
          "function balanceOf(address) view returns (uint256)",
          "function approve(address,uint256) returns (bool)",
          "function mint(address,uint256)",
          "function allowance(address,address) view returns (uint256)",
        ], sign),
      };

      setProvider(prov); setSigner(sign); setAccount(addr);
      setChainId(Number(net.chainId)); setContracts(c);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  // ── 데이터 새로고침 ───────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!contracts || !account) return;
    try {
      const [hBal, lCol] = await Promise.all([
        contracts.hhusd.balanceOf(account),
        contracts.vault.getCollateralBalance(account),
      ]);
      setHhusdBal(ethers.formatEther(hBal));
      setLockedCol(ethers.formatEther(lCol));

      // 그룹 정보
      const [state, cycle, totalCycles, contribution, memberCount] =
        await contracts.group.getGroupInfo();
      setGroupInfo({
        state: Number(state), stateName: GROUP_STATE[Number(state)],
        cycle: Number(cycle), totalCycles: Number(totalCycles),
        contribution: ethers.formatEther(contribution),
        memberCount: Number(memberCount),
      });

      // 내 멤버 정보
      try {
        const m = await contracts.group.getMember(account);
        if (m.wallet !== ethers.ZeroAddress) {
          setMemberInfo({
            position: Number(m.position),
            collateral: ethers.formatEther(m.collateral),
            status: MEMBER_STATUS[Number(m.status)],
            missedPayments: Number(m.missedPayments),
            hasReceivedPayout: m.hasReceivedPayout,
          });
        } else {
          setMemberInfo(null);
        }
      } catch { setMemberInfo(null); }

      // 지급 스케줄
      try {
        const schedule = await contracts.group.getPayoutSchedule();
        setPayoutSchedule(schedule);
      } catch { setPayoutSchedule([]); }

    } catch (e) { console.error("refresh:", e); }
  }, [contracts, account]);

  useEffect(() => { if (contracts && account) refresh(); }, [contracts, account, refresh]);

  // ── 트랜잭션 헬퍼 ────────────────────────────────────────────────────────
  const send = async (fn) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const tx = await fn();
      setTxHash(tx.hash);
      await tx.wait();
      await refresh();
    } catch (e) {
      setError(e.reason || e.message);
    } finally { setLoading(false); }
  };

  // ── 액션들 ────────────────────────────────────────────────────────────────
  const mintTestUSDT = (amount) => send(async () => {
    return contracts.usdt.mint(account, ethers.parseEther(String(amount)));
  });

  const depositUSDT = (amount) => send(async () => {
    const parsed = ethers.parseEther(String(amount));
    const allowance = await contracts.usdt.allowance(account, ADDR.TreasuryV2);
    if (allowance < parsed) {
      const appTx = await contracts.usdt.approve(ADDR.TreasuryV2, ethers.MaxUint256);
      await appTx.wait();
    }
    return contracts.treasury.depositUSDT(parsed);
  });

  const redeemHHUSD = (amount) => send(async () => {
    return contracts.treasury.redeemHHUSD(ethers.parseEther(String(amount)));
  });

  const joinGroup = () => send(async () => {
    return contracts.group.joinGroup();
  });

  const contribute = () => send(async () => {
    return contracts.group.contribute();
  });

  const topUpCollateral = (amount) => send(async () => {
    const parsed = ethers.parseEther(String(amount));
    return contracts.group.topUpCollateral(parsed);
  });

  const getUSDTBalance = async () => {
    if (!contracts || !account) return "0";
    const bal = await contracts.usdt.balanceOf(account);
    return ethers.formatEther(bal);
  };

  return {
    account, chainId, loading, txHash, error,
    hhusdBal, lockedCol, groupInfo, memberInfo, payoutSchedule,
    connect, refresh, mintTestUSDT, depositUSDT, redeemHHUSD,
    joinGroup, contribute, topUpCollateral, getUSDTBalance,
    ADDR,
  };
}
