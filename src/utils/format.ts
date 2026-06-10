// 对应 iOS 的 Currency.swift

export type CurrencyCode =
  | 'CNY' | 'USD' | 'EUR' | 'GBP' | 'JPY'
  | 'HKD' | 'SGD' | 'KRW' | 'AUD' | 'CAD'
  | 'TWD' | 'THB' | 'MYR' | 'VND'

const currencyMeta: Record<CurrencyCode, { symbol: string; name: string; zeroDecimal: boolean }> = {
  CNY: { symbol: '¥', name: '人民币', zeroDecimal: false },
  USD: { symbol: '$', name: '美元', zeroDecimal: false },
  EUR: { symbol: '€', name: '欧元', zeroDecimal: false },
  GBP: { symbol: '£', name: '英镑', zeroDecimal: false },
  JPY: { symbol: '¥', name: '日元', zeroDecimal: true },
  HKD: { symbol: 'HK$', name: '港币', zeroDecimal: false },
  SGD: { symbol: 'S$', name: '新加坡元', zeroDecimal: false },
  KRW: { symbol: '₩', name: '韩元', zeroDecimal: true },
  AUD: { symbol: 'A$', name: '澳元', zeroDecimal: false },
  CAD: { symbol: 'C$', name: '加元', zeroDecimal: false },
  TWD: { symbol: 'NT$', name: '新台币', zeroDecimal: false },
  THB: { symbol: '฿', name: '泰铢', zeroDecimal: false },
  MYR: { symbol: 'RM', name: '马币', zeroDecimal: false },
  VND: { symbol: '₫', name: '越南盾', zeroDecimal: true },
}

export const ALL_CURRENCIES = Object.keys(currencyMeta) as CurrencyCode[]

export function currencySymbol(code: CurrencyCode): string {
  return currencyMeta[code]?.symbol ?? code
}

export function currencyName(code: CurrencyCode): string {
  return currencyMeta[code]?.name ?? code
}

export function isZeroDecimal(code: CurrencyCode): boolean {
  return currencyMeta[code]?.zeroDecimal ?? false
}

export function storageMultiplier(code: CurrencyCode): number {
  return isZeroDecimal(code) ? 1 : 100
}

/** 将展示金额（元）转换为存储整数（分） */
export function toStorageAmount(displayAmount: number, code: CurrencyCode): number {
  return Math.round(displayAmount * storageMultiplier(code))
}

/** 将存储整数（分）转换为格式化字符串 */
export function formatAmount(storageAmount: number, code: CurrencyCode): string {
  const multi = storageMultiplier(code)
  const display = storageAmount / multi
  const sym = currencySymbol(code)
  return isZeroDecimal(code)
    ? `${sym}${Math.floor(display)}`
    : `${sym}${display.toFixed(2)}`
}

/** 日期相对展示，对应 iOS Date.relativeDisplay */
export function relativeDisplay(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = now - timestamp
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}天前`
  const d = new Date(timestamp * 1000)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
