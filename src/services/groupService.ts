// 对应 iOS GroupService.swift
// 使用 firebase/firestore/lite（纯 REST，不依赖 WebChannel）
// onSnapshot 实时监听改为一次性 fetch，API 对页面完全兼容

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query,
  where, arrayUnion,
} from 'firebase/firestore/lite'
import { db } from '../utils/firebase'
import { groupStore } from '../store'
import type { BillGroup, AppUser } from '../models/types'
import type { CurrencyCode } from '../utils/format'

/** 拉取当前用户的群组列表，更新 groupStore */
async function fetchGroups(uid: string): Promise<void> {
  const q = query(collection(db, 'groups'), where('memberIDs', 'array-contains', uid))
  const snapshot = await getDocs(q)
  const groups: BillGroup[] = snapshot.docs
    .map(d => docToGroup(d.id, d.data()))
    .sort((a, b) => b.createdAt - a.createdAt)
  groupStore.setGroups(groups)
}

/** 开始监听当前用户的群组列表（lite：一次性拉取，在后台执行） */
export function startListeningGroups(uid: string): void {
  fetchGroups(uid).catch(err => console.error('[groupService] fetchGroups error:', err))
}

/** 停止监听（lite 模式无需操作） */
export function stopListeningGroups(): void {}

function docToGroup(id: string, d: Record<string, any>): BillGroup {
  return {
    id,
    name: d.name ?? '',
    emoji: d.emoji ?? 'yensign.circle.fill',
    defaultCurrency: d.defaultCurrency ?? 'CNY',
    memberIDs: d.memberIDs ?? [],
    memberDetails: d.memberDetails ?? {},
    createdBy: d.createdBy ?? '',
    inviteCode: d.inviteCode ?? '',
    createdAt: d.createdAt ?? 0,
    updatedAt: d.updatedAt ?? 0,
  }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** 创建群组 */
export async function createGroup(
  name: string,
  currency: CurrencyCode,
  currentUser: AppUser
): Promise<BillGroup> {
  const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const now = Date.now() / 1000
  const inviteCode = generateInviteCode()

  const group: BillGroup = {
    id,
    name,
    emoji: 'yensign.circle.fill',
    defaultCurrency: currency,
    memberIDs: [currentUser.id],
    memberDetails: {
      [currentUser.id]: {
        uid: currentUser.id,
        displayName: currentUser.displayName,
        ...(currentUser.avatarURL ? { avatarURL: currentUser.avatarURL } : {}),
      },
    },
    createdBy: currentUser.id,
    inviteCode,
    createdAt: now,
    updatedAt: now,
  }

  await setDoc(doc(db, 'groups', id), group)

  await setDoc(doc(db, 'groups', id, 'members', currentUser.id), {
    uid: currentUser.id,
    displayName: currentUser.displayName,
    avatarURL: currentUser.avatarURL ?? null,
    joinedAt: now,
    role: 'owner',
  })

  return group
}

/** 通过邀请码加入群组 */
export async function joinGroup(inviteCode: string, currentUser: AppUser): Promise<BillGroup> {
  const q = query(collection(db, 'groups'), where('inviteCode', '==', inviteCode.toUpperCase()))
  const snapshot = await getDocs(q)

  if (snapshot.empty) throw new Error('邀请码无效或已过期')

  const groupDoc = snapshot.docs[0]
  const groupData = groupDoc.data()

  if (groupData.memberIDs?.includes(currentUser.id)) {
    return docToGroup(groupDoc.id, groupData)
  }

  const groupRef = doc(db, 'groups', groupDoc.id)
  await updateDoc(groupRef, {
    memberIDs: arrayUnion(currentUser.id),
    [`memberDetails.${currentUser.id}`]: {
      uid: currentUser.id,
      displayName: currentUser.displayName,
      avatarURL: currentUser.avatarURL ?? null,
    },
  })

  await setDoc(doc(db, 'groups', groupDoc.id, 'members', currentUser.id), {
    uid: currentUser.id,
    displayName: currentUser.displayName,
    avatarURL: currentUser.avatarURL ?? null,
    joinedAt: Date.now() / 1000,
    role: 'member',
  })

  const updated = await getDoc(groupRef)
  return docToGroup(updated.id, updated.data()!)
}

/** 更新群组默认货币（仅群主调用，权限由 UI 限制） */
export async function updateGroupCurrency(groupID: string, currency: CurrencyCode): Promise<void> {
  await updateDoc(doc(db, 'groups', groupID), { defaultCurrency: currency })
  const updated = groupStore.groups.map(g =>
    g.id === groupID ? { ...g, defaultCurrency: currency } : g
  )
  groupStore.setGroups(updated)
}

/** 刷新邀请码 */
export async function regenerateInviteCode(groupID: string): Promise<string> {
  const code = generateInviteCode()
  await updateDoc(doc(db, 'groups', groupID), { inviteCode: code })
  return code
}
