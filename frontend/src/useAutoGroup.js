/**
 * AutoGroupFactory 연동 훅
 */
import { useState, useCallback } from "react";
import { ethers } from "ethers";
import AUTO_FACTORY_ABI from "./abi/AutoGroupFactory.json";
import AUTO_GROUP_ABI   from "./abi/AutoGroup.json";
import ADDRESSES        from "./deployedAddresses.json";

const ADDR = ADDRESSES.contracts;

const TIER_AMOUNTS  = [10, 20, 50, 100, 200];
const TIER_LABELS   = ["10 HHUSD", "20 HHUSD", "50 HHUSD", "100 HHUSD", "200 HHUSD"];
const GROUP_STATE   = ["ENROLLING", "POSITION_SELECTION", "ACTIVE", "COMPLETED", "CANCELLED"];

export function useAutoGroup(signer, account, vaultContract, hhusdContract, onTx) {
  const [tierStatus, setTierStatus]   = useState(null);   // getAllTierStatus
  const [activeInfos, setActiveInfos] = useState([]);     // 5개 티어 각 활성방 정보
  const [myGroups, setMyGroups]       = useState([]);     // 내가 속한 방들

  const factory = signer && ADDR.AutoGroupFactory
    ? new ethers.Contract(ADDR.AutoGroupFactory, AUTO_FACTORY_ABI, signer)
    : null;

  const refresh = useCallback(async () => {
    if (!factory || !account) return;
    try {
      const [groups, counts, totals] = await factory.getAllTierStatus();
      setTierStatus({ groups, counts, totals });

      // 각 티어 활성방 상세 정보
      const infos = await Promise.all(
        Array.from({ length: 5 }, (_, i) => factory.getActiveGroupInfo(i))
      );
      setActiveInfos(infos.map((info, i) => ({
        tierIndex:         i,
        tierLabel:         TIER_LABELS[i],
        groupAddr:         info.groupAddr,
        memberCount:       Number(info.memberCount),
        countdownStarted:  info.countdownStarted,
        enrollmentDeadline: Number(info.enrollmentDeadline),
        state:             Number(info.state),
        stateName:         GROUP_STATE[Number(info.state)],
        totalGroups:       Number(totals[i]),
      })));

      // 내가 속한 방 탐색
      if (account) {
        const mine = [];
        for (let t = 0; t < 5; t++) {
          const allAddrs = await factory.getAllGroups(t);
          for (const addr of allAddrs) {
            const g = new ethers.Contract(addr, AUTO_GROUP_ABI, signer);
            const m = await g.getMember(account);
            if (m.wallet.toLowerCase() === account.toLowerCase()) {
              const info = await g.getGroupInfo().catch(() => null);
              mine.push({
                groupAddr:    addr,
                tierIndex:    t,
                tierLabel:    TIER_LABELS[t],
                joinOrder:    Number(m.joinOrder),
                position:     Number(m.position),
                status:       Number(m.status),
                memberCount:  info ? Number(info._memberCount) : 0,
                state:        info ? Number(info._state) : 0,
                stateName:    info ? GROUP_STATE[Number(info._state)] : "UNKNOWN",
              });
            }
          }
        }
        setMyGroups(mine);
      }
    } catch (e) { console.error("autoGroup refresh:", e); }
  }, [factory, account, signer]);

  // 티어 참가
  const join = async (tierIndex) => {
    if (!factory || !hhusdContract) return;
    const contribution = ethers.parseEther(String(TIER_AMOUNTS[tierIndex]));
    const cycles       = 28n;
    const required     = contribution * cycles * 14000n / 10000n;

    const vaultAddr = ADDR.CollateralVault;
    const allowance = await hhusdContract.allowance(account, vaultAddr);
    if (allowance < required) {
      await onTx(() => hhusdContract.approve(vaultAddr, ethers.MaxUint256));
    }
    await onTx(() => factory.join(tierIndex));
    await refresh();
  };

  // 순번 선택
  const selectPosition = async (groupAddr, position) => {
    const g = new ethers.Contract(groupAddr, AUTO_GROUP_ABI, signer);
    await onTx(() => g.selectPosition(position));
    await refresh();
  };

  // 납입 (contribute)
  const contribute = async (groupAddr) => {
    const g = new ethers.Contract(groupAddr, AUTO_GROUP_ABI, signer);
    const contribution = await g.contributionAmount();
    const vaultAddr    = ADDR.CollateralVault;
    const allowance    = await hhusdContract.allowance(account, vaultAddr);
    if (allowance < contribution) {
      await onTx(() => hhusdContract.approve(vaultAddr, ethers.MaxUint256));
    }
    await onTx(() => g.contribute());
    await refresh();
  };

  return {
    tierStatus, activeInfos, myGroups,
    TIER_LABELS, TIER_AMOUNTS,
    refresh, join, selectPosition, contribute,
    factoryAddr: ADDR.AutoGroupFactory,
  };
}
