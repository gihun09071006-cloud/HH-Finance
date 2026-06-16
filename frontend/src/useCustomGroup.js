/**
 * CustomGroupFactory 연동 훅
 */
import { useState, useCallback } from "react";
import { ethers } from "ethers";
import CUSTOM_FACTORY_ABI from "./abi/CustomGroupFactory.json";
import CUSTOM_GROUP_ABI   from "./abi/CustomGroup.json";
import ADDRESSES          from "./deployedAddresses.json";

const ADDR = ADDRESSES.contracts;
const GROUP_STATE = ["ENROLLING", "POSITION_SELECTION", "ACTIVE", "COMPLETED", "CANCELLED"];

export function useCustomGroup(signer, account, hhusdContract, onTx, refreshBalances) {
  const [allGroups, setAllGroups]   = useState([]);  // GroupInfo[]
  const [openGroups, setOpenGroups] = useState([]);  // ENROLLING만
  const [myGroups, setMyGroups]     = useState([]);  // 내가 속한 방

  const factory = signer && ADDR.CustomGroupFactory
    ? new ethers.Contract(ADDR.CustomGroupFactory, CUSTOM_FACTORY_ABI, signer)
    : null;

  const refresh = useCallback(async () => {
    if (!factory || !account) return;
    try {
      const infos = await factory.getAllGroupInfos();
      const mapped = infos.map(info => ({
        groupAddr:          info.groupAddr,
        organizer:          info.organizer,
        contributionAmount: ethers.formatEther(info.contributionAmount),
        maxMembers:         Number(info.maxMembers),
        memberCount:        Number(info.memberCount),
        enrollmentDeadline: Number(info.enrollmentDeadline),
        state:              Number(info.state),
        stateName:          GROUP_STATE[Number(info.state)],
      }));
      setAllGroups(mapped);
      setOpenGroups(mapped.filter(g => g.state === 0));

      // 내가 속한 방
      const mine = [];
      for (const info of infos) {
        const g = new ethers.Contract(info.groupAddr, CUSTOM_GROUP_ABI, signer);
        const m = await g.getMember(account).catch(() => null);
        if (m && m.wallet.toLowerCase() === account.toLowerCase()) {
          mine.push({
            ...mapped.find(x => x.groupAddr === info.groupAddr),
            joinOrder: Number(m.joinOrder),
            position:  Number(m.position),
            status:    Number(m.status),
            isOrganizer: info.organizer.toLowerCase() === account.toLowerCase(),
          });
        }
      }
      setMyGroups(mine);
    } catch (e) { console.error("customGroup refresh:", e); }
  }, [factory, account, signer]);

  const _afterTx = async () => {
    await refresh();
    if (refreshBalances) await refreshBalances();
  };

  // 방 생성 (계장 = msg.sender)
  const createGroup = async ({ contribution, maxMembers, cycleIntervalDays, enrollmentHours }) => {
    if (!factory) return;
    const contribWei = ethers.parseEther(String(contribution));
    const maxM       = BigInt(maxMembers);
    const cycleWei   = BigInt(cycleIntervalDays) * 24n * 3600n;
    const enrollWei  = BigInt(enrollmentHours)   * 3600n;
    await onTx(() => factory.createGroup(contribWei, maxM, cycleWei, enrollWei));
    await _afterTx();
  };

  // 기존 방 참가
  const joinGroup = async (groupAddr) => {
    if (!factory) return;
    await onTx(() => factory.joinGroup(groupAddr));
    await _afterTx();
  };

  // 계장: 강퇴
  const kickMember = async (groupAddr, userAddr) => {
    const g = new ethers.Contract(groupAddr, CUSTOM_GROUP_ABI, signer);
    await onTx(() => g.kickMember(userAddr));
    await _afterTx();
  };

  // 계장: 마감
  const closeEnrollment = async (groupAddr) => {
    const g = new ethers.Contract(groupAddr, CUSTOM_GROUP_ABI, signer);
    await onTx(() => g.closeEnrollment());
    await _afterTx();
  };

  // 계장: 취소
  const cancelGroup = async (groupAddr, reason) => {
    const g = new ethers.Contract(groupAddr, CUSTOM_GROUP_ABI, signer);
    await onTx(() => g.cancelGroup(reason));
    await _afterTx();
  };

  // 순번 선택
  const selectPosition = async (groupAddr, position) => {
    const g = new ethers.Contract(groupAddr, CUSTOM_GROUP_ABI, signer);
    await onTx(() => g.selectPosition(position));
    await _afterTx();
  };

  // 납입
  const contribute = async (groupAddr) => {
    const g = new ethers.Contract(groupAddr, CUSTOM_GROUP_ABI, signer);
    await onTx(() => g.contribute());
    await _afterTx();
  };

  return {
    allGroups, openGroups, myGroups,
    refresh, createGroup, joinGroup,
    kickMember, closeEnrollment, cancelGroup,
    selectPosition, contribute,
    factoryAddr: ADDR.CustomGroupFactory,
  };
}
