// 对应 iOS 的 BalanceCalculator.swift，逻辑完全一致

import type { Bill, Split, SettlementSuggestion } from '../models/types'
import type { CurrencyCode } from './format'
import { storageMultiplier } from './format'

/** 计算群组内每个成员的净余额（分）
 *  正 = 别人欠我，负 = 我欠别人
 */
export function netBalances(bills: Bill[]): Record<string, number> {
  const balances: Record<string, number> = {}

  for (const bill of bills) {
    if (bill.status !== 'open') continue

    // 付款人获得信用
    balances[bill.paidByUID] = (balances[bill.paidByUID] ?? 0) + bill.totalAmount

    // 每个参与者被扣除应付份额
    for (const split of bill.splits) {
      balances[split.uid] = (balances[split.uid] ?? 0) - split.amount
    }
  }

  return balances
}

/** 生成最少转账次数的还款建议（贪心算法） */
export function settlementSuggestions(balances: Record<string, number>): SettlementSuggestion[] {
  const creditors: Array<{ uid: string; amount: number }> = []
  const debtors: Array<{ uid: string; amount: number }> = []

  for (const [uid, amount] of Object.entries(balances)) {
    if (amount > 0) creditors.push({ uid, amount })
    else if (amount < 0) debtors.push({ uid, amount: -amount })
  }

  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const suggestions: SettlementSuggestion[] = []
  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const settle = Math.min(creditors[ci].amount, debtors[di].amount)
    if (settle > 0) {
      suggestions.push({
        fromUID: debtors[di].uid,
        toUID: creditors[ci].uid,
        amount: settle,
      })
    }
    creditors[ci].amount -= settle
    debtors[di].amount -= settle
    if (creditors[ci].amount === 0) ci++
    if (debtors[di].amount === 0) di++
  }

  return suggestions
}

/**
 * 多币种账单：将所有金额换算成 targetCurrency 后计算净余额。
 *
 * displayRates[src] = "1 src = X targetCurrency"（即用户可见的汇率）
 * 由于存储单位（分）因币种而异，换算时需通过 storageMultiplier 正规化：
 *   convertedStorage = (storedAmount / mult(src)) * displayRates[src] * mult(target)
 */
export function netBalancesWithConversion(
  bills: Bill[],
  targetCurrency: CurrencyCode,
  displayRates: Partial<Record<CurrencyCode, number>>
): Record<string, number> {
  const balances: Record<string, number> = {}
  const targetMult = storageMultiplier(targetCurrency)

  for (const bill of bills) {
    if (bill.status !== 'open') continue

    const srcMult = storageMultiplier(bill.currency)
    const rate = bill.currency === targetCurrency ? 1 : (displayRates[bill.currency] ?? 1)

    const convertedTotal = Math.round((bill.totalAmount / srcMult) * rate * targetMult)
    balances[bill.paidByUID] = (balances[bill.paidByUID] ?? 0) + convertedTotal

    for (const split of bill.splits) {
      const convertedSplit = Math.round((split.amount / srcMult) * rate * targetMult)
      balances[split.uid] = (balances[split.uid] ?? 0) - convertedSplit
    }
  }

  return balances
}

/** 平分，处理余数（对应 iOS equalSplits） */
export function equalSplits(
  totalAmount: number,
  _paidByUID: string,
  participantUIDs: string[]
): Split[] {
  if (participantUIDs.length === 0) return []
  const count = participantUIDs.length
  const base = Math.floor(totalAmount / count)
  const remainder = totalAmount % count

  return participantUIDs.map((uid, index) => ({
    uid,
    amount: base + (index < remainder ? 1 : 0),
  }))
}
