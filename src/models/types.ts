// 对应 iOS Core/Models，与 Firestore 数据结构完全一致

import type { CurrencyCode } from '../utils/format'

// ─── 用户 ────────────────────────────────────────────────

export interface AppUser {
  id: string
  displayName: string
  avatarURL?: string
  email?: string
  phone?: string
  wechatOpenID?: string
  preferredCurrency: CurrencyCode
  createdAt: number
}

export interface MemberSummary {
  uid: string
  displayName: string
  avatarURL?: string
}

// ─── 群组 ────────────────────────────────────────────────

export interface BillGroup {
  id: string
  name: string
  emoji: string            // SF Symbol 名称（iOS）或图标 key
  defaultCurrency: CurrencyCode
  memberIDs: string[]
  memberDetails: Record<string, MemberSummary>
  createdBy: string
  inviteCode: string
  createdAt: number
  updatedAt: number
}

// ─── 账单 ────────────────────────────────────────────────

export type SplitMode = 'equal' | 'ocr_claim' | 'ocr_assign' | 'ocr_equal'
export type BillStatus = 'open' | 'settled'

export interface Split {
  uid: string
  amount: number   // 分
  itemIDs?: string[]
}

export interface Bill {
  id: string
  groupID: string
  title: string
  currency: CurrencyCode
  totalAmount: number    // 分
  paidByUID: string
  splitMode: SplitMode
  participantUIDs: string[]
  splits: Split[]
  status: BillStatus
  notes?: string
  receiptURL?: string
  createdBy: string
  createdAt: number
  settledAt?: number
}

// ─── 条目（OCR 模式） ─────────────────────────────────────

export interface LineItem {
  id: string
  name: string
  quantity: number
  unitPrice: number      // 分
  totalPrice: number     // 分
  claimedByUID?: string
  assignedToUID?: string
}

// ─── 结算建议 ────────────────────────────────────────────

export interface SettlementSuggestion {
  fromUID: string
  toUID: string
  amount: number         // 分
}
