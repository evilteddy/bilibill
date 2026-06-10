/**
 * 实时汇率服务
 *
 * 使用 open.er-api.com 免费接口（无需 API Key，每月 1500 次）
 * WeChat 小程序需在开发者后台将以下域名加入 request 合法域名：
 *   https://open.er-api.com
 *
 * 约定：rates[sourceCurrency] = "1 个 sourceCurrency 等于多少 targetCurrency"
 * 例：targetCurrency = CNY，rates.USD = 7.25  → 1 USD = 7.25 CNY
 */

import Taro from '@tarojs/taro'
import type { CurrencyCode } from './format'

// ─── 内存缓存 ─────────────────────────────────────────────

interface CacheEntry {
  /** key: sourceCurrency，value: 1 source = X target */
  displayRates: Partial<Record<CurrencyCode, number>>
  fetchedAt: number
}

const cache: Record<string, CacheEntry> = {}
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟

// ─── 返回结构 ─────────────────────────────────────────────

export interface ExchangeRateResult {
  targetCurrency: CurrencyCode
  /** key: sourceCurrency，value: 1 source = X target */
  displayRates: Partial<Record<CurrencyCode, number>>
  fetchedAt: number
}

// ─── 核心接口 ─────────────────────────────────────────────

/**
 * 获取以 targetCurrency 为基准的汇率表。
 * 返回 displayRates，其中 displayRates[src] = "1 src = X target"。
 *
 * 5 分钟内重复调用使用内存缓存，不发网络请求。
 */
export async function fetchExchangeRates(targetCurrency: CurrencyCode): Promise<ExchangeRateResult> {
  const cached = cache[targetCurrency]
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { targetCurrency, displayRates: cached.displayRates, fetchedAt: cached.fetchedAt }
  }

  const response = await Taro.request({
    url: `https://open.er-api.com/v6/latest/${targetCurrency}`,
    method: 'GET',
  })

  if (response.statusCode !== 200) {
    throw new Error(`汇率获取失败：HTTP ${response.statusCode}`)
  }

  const data = response.data as any
  if (data?.result !== 'success') {
    throw new Error(`汇率获取失败：${data?.['error-type'] ?? '接口错误'}`)
  }

  // API 返回：base = targetCurrency，apiRates[src] = 1 target 换多少 src
  // 我们需要 displayRates[src] = 1 src 换多少 target = 1 / apiRates[src]
  const apiRates = data.rates as Record<string, number>
  const displayRates: Partial<Record<CurrencyCode, number>> = {}

  for (const [code, apiRate] of Object.entries(apiRates)) {
    if (apiRate > 0) {
      displayRates[code as CurrencyCode] = 1 / apiRate
    }
  }
  // targetCurrency 对自身汇率为 1
  displayRates[targetCurrency] = 1

  const fetchedAt = Date.now()
  cache[targetCurrency] = { displayRates, fetchedAt }

  return { targetCurrency, displayRates, fetchedAt }
}

/** 清除指定货币的缓存（用于强制刷新） */
export function invalidateRateCache(targetCurrency: CurrencyCode): void {
  delete cache[targetCurrency]
}
