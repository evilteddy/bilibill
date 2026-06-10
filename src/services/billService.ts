// 对应 iOS BillService.swift
// 使用 firebase/firestore/lite（纯 REST，不依赖 WebChannel）
// onSnapshot 实时监听改为一次性 fetch，返回 no-op unsubscribe，API 对页面兼容

import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy,
} from 'firebase/firestore/lite'
import { db } from '../utils/firebase'
import { equalSplits } from '../utils/balance'
import type { Bill } from '../models/types'
import type { CurrencyCode } from '../utils/format'

function docToBill(id: string, d: Record<string, any>): Bill {
  return {
    id,
    groupID: d.groupID ?? '',
    title: d.title ?? '',
    currency: d.currency ?? 'CNY',
    totalAmount: d.totalAmount ?? 0,
    paidByUID: d.paidByUID ?? '',
    splitMode: d.splitMode ?? 'equal',
    participantUIDs: d.participantUIDs ?? [],
    splits: d.splits ?? [],
    status: d.status ?? 'open',
    notes: d.notes,
    receiptURL: d.receiptURL,
    createdBy: d.createdBy ?? '',
    createdAt: d.createdAt ?? 0,
    settledAt: d.settledAt,
  }
}

/** 拉取群组的账单列表（一次性） */
export async function fetchBills(groupID: string): Promise<Bill[]> {
  const q = query(
    collection(db, 'groups', groupID, 'bills'),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => docToBill(d.id, d.data()))
}

/**
 * 监听群组账单（lite：一次性拉取，立即回调）
 * 返回 no-op unsubscribe，API 与原 onSnapshot 版本兼容
 */
export function startListeningBills(
  groupID: string,
  onChange: (bills: Bill[]) => void
): () => void {
  fetchBills(groupID)
    .then(onChange)
    .catch(err => console.error('[billService] fetchBills error:', err))
  return () => {}
}

/** 创建平分账单（OCR 识别入口也使用此函数，通过 splitMode 区分来源） */
export async function createEqualBill(params: {
  groupID: string
  title: string
  currency: CurrencyCode
  totalAmount: number
  paidByUID: string
  participantUIDs: string[]
  notes?: string
  createdBy: string
  /** 账单来源；手动录入为 'equal'，拍照识别为 'ocr_equal'，默认 'equal' */
  splitMode?: import('../models/types').SplitMode
}): Promise<Bill> {
  const id = `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const splits = equalSplits(params.totalAmount, params.paidByUID, params.participantUIDs)
  const now = Date.now() / 1000

  const bill: Bill = {
    id,
    groupID: params.groupID,
    title: params.title,
    currency: params.currency,
    totalAmount: params.totalAmount,
    paidByUID: params.paidByUID,
    splitMode: params.splitMode ?? 'equal',
    participantUIDs: params.participantUIDs,
    splits,
    status: 'open',
    createdBy: params.createdBy,
    createdAt: now,
    ...(params.notes ? { notes: params.notes } : {}),
  }

  await setDoc(doc(db, 'groups', params.groupID, 'bills', id), bill)
  return bill
}

/** 读取单个账单 */
export async function getBill(groupID: string, billID: string): Promise<Bill | null> {
  const snap = await getDoc(doc(db, 'groups', groupID, 'bills', billID))
  if (!snap.exists()) return null
  return docToBill(snap.id, snap.data())
}

/** 更新账单（仅提交人，权限由 UI 限制）：重新计算平分明细 */
export async function updateBill(params: {
  groupID: string
  billID: string
  title: string
  currency: CurrencyCode
  totalAmount: number
  paidByUID: string
  participantUIDs: string[]
  notes?: string
}): Promise<void> {
  const splits = equalSplits(params.totalAmount, params.paidByUID, params.participantUIDs)
  await updateDoc(doc(db, 'groups', params.groupID, 'bills', params.billID), {
    title: params.title,
    currency: params.currency,
    totalAmount: params.totalAmount,
    paidByUID: params.paidByUID,
    participantUIDs: params.participantUIDs,
    splits,
    notes: params.notes ?? '',
  })
}

/** 一键结清所有未结算账单 */
export async function settleAllBills(groupID: string, bills: Bill[]): Promise<void> {
  const openBills = bills.filter(b => b.status === 'open')
  if (openBills.length === 0) return
  const now = Date.now() / 1000
  await Promise.all(
    openBills.map(bill =>
      updateDoc(doc(db, 'groups', groupID, 'bills', bill.id), {
        status: 'settled',
        settledAt: now,
      })
    )
  )
}

/** 删除账单 */
export async function deleteBill(groupID: string, billID: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupID, 'bills', billID))
}

/** 获取某成员在账单中的应付金额 */
export function amountForUID(bill: Bill, uid: string): number {
  return bill.splits.find(s => s.uid === uid)?.amount ?? 0
}
