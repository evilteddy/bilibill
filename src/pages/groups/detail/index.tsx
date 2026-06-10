import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Button, Input } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { groupStore, authStore } from '../../../store'
import { startListeningBills, settleAllBills, amountForUID } from '../../../services/billService'
import { updateGroupCurrency } from '../../../services/groupService'
import { netBalances, netBalancesWithConversion, settlementSuggestions } from '../../../utils/balance'
import { formatAmount, currencyName, currencySymbol, ALL_CURRENCIES } from '../../../utils/format'
import { fetchExchangeRates } from '../../../utils/currencyRate'
import AuthGate from '../../../components/AuthGate'
import type { Bill, BillGroup } from '../../../models/types'
import type { CurrencyCode } from '../../../utils/format'
import './index.css'

export default function GroupDetailPage() {
  return (
    <AuthGate guestTip='请登录后查看群组'>
      <GroupDetailContent />
    </AuthGate>
  )
}

// ─── 汇率持久化（本地存储，按群组 ID 隔离） ──────────────────

interface StoredRates {
  targetCurrency: CurrencyCode
  confirmedRates: Partial<Record<CurrencyCode, number>>
  confirmedAt: number
}

function loadStoredRates(groupID: string): StoredRates | null {
  try {
    const raw = Taro.getStorageSync(`rates_${groupID}`)
    return raw ? (raw as StoredRates) : null
  } catch {
    return null
  }
}

function saveStoredRates(groupID: string, data: StoredRates): void {
  try {
    Taro.setStorageSync(`rates_${groupID}`, data)
  } catch {}
}

function clearStoredRates(groupID: string): void {
  try {
    Taro.removeStorageSync(`rates_${groupID}`)
  } catch {}
}

function GroupDetailContent() {
  const router = useRouter()
  const groupID = router.params.groupID as string

  const [group, setGroup] = useState<BillGroup | undefined>(groupStore.getGroup(groupID))
  const [bills, setBills] = useState<Bill[]>([])
  const [tab, setTab] = useState<'bills' | 'members'>('bills')
  const [settling, setSettling] = useState(false)
  const [fabExpanded, setFabExpanded] = useState(false)

  // 货币转换状态
  // 用 lazy initializer（() => ...）读取本地存储：React 保证该函数只在首次渲染时执行一次，
  // 比 useState(expr) / useRef(expr) 更可靠——后两者每次渲染都会对 expr 求值。
  const [showRateModal, setShowRateModal] = useState(false)
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesConfirmed, setRatesConfirmed] = useState<boolean>(() => {
    const s = loadStoredRates(groupID)
    return s !== null
  })
  const [targetCurrency, setTargetCurrency] = useState<CurrencyCode | null>(() => {
    const s = loadStoredRates(groupID)
    return s?.targetCurrency ?? null
  })
  /** 编辑中的汇率字符串：key = sourceCurrency，value = "1 src = X target" */
  const [editableRates, setEditableRates] = useState<Record<string, string>>({})
  /** 已确认的汇率：key = sourceCurrency，value = 数值 */
  const [confirmedRates, setConfirmedRates] = useState<Partial<Record<CurrencyCode, number>>>(() => {
    const s = loadStoredRates(groupID)
    return s?.confirmedRates ?? {}
  })
  const [rateFetchedAt, setRateFetchedAt] = useState<number | null>(null)

  const currentUID = authStore.currentUser?.id ?? ''
  const openBills = bills.filter(b => b.status === 'open')

  // 检测是否存在多币种
  const billCurrencies = [...new Set(openBills.map(b => b.currency))] as CurrencyCode[]
  const hasMultipleCurrencies = billCurrencies.length > 1

  // 根据是否已确认汇率选择余额计算方式
  const effectiveTarget = targetCurrency ?? group?.defaultCurrency ?? 'CNY'
  const balances = ratesConfirmed
    ? netBalancesWithConversion(openBills, effectiveTarget, confirmedRates)
    : netBalances(openBills)
  const suggestions = settlementSuggestions(balances)

  // 余额展示用的货币：多币种且已换算则用目标货币，否则用群组默认货币
  const displayCurrency: CurrencyCode = (ratesConfirmed ? effectiveTarget : group?.defaultCurrency) ?? 'CNY'

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: group?.name ?? '群组详情' })

    const unsubGroups = groupStore.onGroupsChange(() => {
      setGroup(groupStore.getGroup(groupID))
    })
    const unsubBills = startListeningBills(groupID, setBills)

    return () => {
      unsubGroups()
      unsubBills()
    }
  }, [groupID])

  useDidShow(() => {
    startListeningBills(groupID, setBills)
  })

  // ─── 货币转换逻辑 ─────────────────────────────────────────

  async function handleOpenRateModal() {
    const base = targetCurrency ?? group?.defaultCurrency ?? 'CNY' as CurrencyCode
    setShowRateModal(true)
    setRatesLoading(true)
    try {
      const result = await fetchExchangeRates(base)
      setRateFetchedAt(result.fetchedAt)

      // 为账单中出现的非目标货币初始化可编辑汇率
      const initEditable: Record<string, string> = {}
      for (const cur of billCurrencies) {
        if (cur !== base) {
          const rate = result.displayRates[cur] ?? 1
          initEditable[cur] = rate.toFixed(4)
        }
      }
      setEditableRates(initEditable)
      setTargetCurrency(base)
    } catch (e: any) {
      Taro.showToast({ title: e?.message ?? '汇率获取失败', icon: 'none' })
      setShowRateModal(false)
    } finally {
      setRatesLoading(false)
    }
  }

  function handleConfirmRates() {
    const rates: Partial<Record<CurrencyCode, number>> = {}
    for (const [cur, rateStr] of Object.entries(editableRates)) {
      const rate = parseFloat(rateStr)
      if (!isNaN(rate) && rate > 0) {
        rates[cur as CurrencyCode] = rate
      }
    }
    setConfirmedRates(rates)
    setRatesConfirmed(true)
    setShowRateModal(false)
    saveStoredRates(groupID, {
      targetCurrency: effectiveTarget,
      confirmedRates: rates,
      confirmedAt: Date.now(),
    })
  }

  function handleResetRates() {
    setRatesConfirmed(false)
    setConfirmedRates({})
    clearStoredRates(groupID)
  }

  // ─── 结清逻辑 ─────────────────────────────────────────────

  async function handleSettleAll() {
    if (suggestions.length === 0) return
    Taro.showModal({
      title: '确认结算',
      content: `将标记 ${openBills.length} 笔账单为已结清，此操作不可撤销。`,
      confirmText: '一键结清',
      confirmColor: '#ff3b30',
      success: async ({ confirm }) => {
        if (!confirm) return
        setSettling(true)
        try {
          await settleAllBills(groupID, bills)
          startListeningBills(groupID, setBills)
          Taro.showToast({ title: '结算成功', icon: 'success' })
        } catch {
          Taro.showToast({ title: '结算失败，请重试', icon: 'none' })
        } finally {
          setSettling(false)
        }
      },
    })
  }

  if (!group) return <View className='loading'><Text>加载中...</Text></View>

  return (
    <View className='detail-container'>
      {/* 结算汇总卡片 */}
      {openBills.length > 0 && (
        <View className='settlement-card'>
          <View className='settlement-header'>
            <Text className='settlement-title'>待结算汇总</Text>
            <View className='settlement-header-right'>
              <Text className='settlement-count'>{openBills.length} 笔账单</Text>
              {hasMultipleCurrencies && (
                <View
                  className={`currency-convert-btn ${ratesConfirmed ? 'currency-convert-btn-active' : ''}`}
                  onClick={ratesConfirmed ? handleResetRates : handleOpenRateModal}
                >
                  <Text className='currency-convert-btn-text'>
                    {ratesConfirmed ? `已换算为 ${effectiveTarget}` : '货币转换'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* 多币种提示（未换算时） */}
          {hasMultipleCurrencies && !ratesConfirmed && (
            <View className='multi-currency-notice'>
              <Text className='multi-currency-notice-text'>
                账单含多种货币（{billCurrencies.join('、')}），金额合计仅供参考，建议换算后查看
              </Text>
            </View>
          )}

          {suggestions.length === 0 ? (
            <Text className='settlement-clear'>各成员已结清</Text>
          ) : (
            <View className='suggestions'>
              {suggestions.map((s, i) => {
                const from = group.memberDetails[s.fromUID]?.displayName ?? s.fromUID
                const to = group.memberDetails[s.toUID]?.displayName ?? s.toUID
                return (
                  <View key={i} className='suggestion-row'>
                    <Text className='suggestion-from'>{from}</Text>
                    <Text className='suggestion-arrow'> 付给 </Text>
                    <Text className='suggestion-to'>{to}</Text>
                    <Text className='suggestion-amount'>
                      {formatAmount(s.amount, displayCurrency)}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}

          <Button
            className={`settle-btn ${suggestions.length === 0 ? 'settle-btn-disabled' : ''}`}
            loading={settling}
            disabled={suggestions.length === 0 || settling}
            onClick={handleSettleAll}
          >
            {settling ? '结算中...' : '一键结清所有欠款'}
          </Button>
        </View>
      )}

      {/* Tab 切换 */}
      <View className='tab-bar'>
        <Text
          className={`tab-item ${tab === 'bills' ? 'tab-active' : ''}`}
          onClick={() => setTab('bills')}
        >账单</Text>
        <Text
          className={`tab-item ${tab === 'members' ? 'tab-active' : ''}`}
          onClick={() => setTab('members')}
        >成员</Text>
      </View>

      {tab === 'bills' ? (
        <BillsList bills={bills} group={group} currentUID={currentUID} />
      ) : (
        <MembersList group={group} balances={balances} displayCurrency={displayCurrency} currentUID={currentUID} />
      )}

      {/* FAB 展开菜单遮罩 */}
      {fabExpanded && (
        <View className='fab-overlay' onClick={() => setFabExpanded(false)} />
      )}

      {/* FAB 展开后的选项 */}
      {fabExpanded && (
        <View className='fab-menu'>
          <View
            className='fab-menu-item'
            onClick={() => {
              setFabExpanded(false)
              Taro.navigateTo({ url: `/pages/bills/ocr/index?groupID=${groupID}` })
            }}
          >
            <View className='fab-menu-icon ocr-icon'>
              <Text>📷</Text>
            </View>
            <Text className='fab-menu-label'>拍照识别</Text>
          </View>
          <View
            className='fab-menu-item'
            onClick={() => {
              setFabExpanded(false)
              Taro.navigateTo({ url: `/pages/bills/manual/index?groupID=${groupID}` })
            }}
          >
            <View className='fab-menu-icon manual-icon'>
              <Text>✏️</Text>
            </View>
            <Text className='fab-menu-label'>手动录入</Text>
          </View>
          <View
            className='fab-menu-item'
            onClick={() => {
              setFabExpanded(false)
              Taro.navigateTo({ url: `/pages/groups/invite/index?groupID=${groupID}` })
            }}
          >
            <View className='fab-menu-icon invite-icon'>
              <Text>👥</Text>
            </View>
            <Text className='fab-menu-label'>邀请成员</Text>
          </View>
        </View>
      )}

      {/* 主 FAB 按钮 */}
      <View
        className={`fab ${fabExpanded ? 'fab-active' : ''}`}
        onClick={() => setFabExpanded(prev => !prev)}
      >
        <Text className={`fab-icon ${fabExpanded ? 'fab-icon-rotated' : ''}`}>+</Text>
      </View>

      {/* 汇率确认弹窗 */}
      {showRateModal && (
        <RateModal
          targetCurrency={effectiveTarget}
          sourceCurrencies={billCurrencies.filter(c => c !== effectiveTarget)}
          editableRates={editableRates}
          loading={ratesLoading}
          fetchedAt={rateFetchedAt}
          onRateChange={(cur, val) => setEditableRates(prev => ({ ...prev, [cur]: val }))}
          onConfirm={handleConfirmRates}
          onCancel={() => setShowRateModal(false)}
        />
      )}
    </View>
  )
}

// ─── 汇率弹窗 ─────────────────────────────────────────────

interface RateModalProps {
  targetCurrency: CurrencyCode
  sourceCurrencies: CurrencyCode[]
  editableRates: Record<string, string>
  loading: boolean
  fetchedAt: number | null
  onRateChange: (cur: string, val: string) => void
  onConfirm: () => void
  onCancel: () => void
}

function RateModal({
  targetCurrency,
  sourceCurrencies,
  editableRates,
  loading,
  fetchedAt,
  onRateChange,
  onConfirm,
  onCancel,
}: RateModalProps) {
  const fetchTimeStr = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <View className='rate-modal-overlay' onClick={onCancel}>
      <View className='rate-modal' onClick={e => e.stopPropagation()}>
        <View className='rate-modal-header'>
          <Text className='rate-modal-title'>货币转换</Text>
          <Text className='rate-modal-close' onClick={onCancel}>×</Text>
        </View>

        <View className='rate-modal-meta'>
          <Text className='rate-modal-target'>
            目标货币：{currencyName(targetCurrency)}（{targetCurrency}）
          </Text>
          {fetchTimeStr && !loading && (
            <Text className='rate-modal-time'>汇率更新于 {fetchTimeStr}</Text>
          )}
        </View>

        {loading ? (
          <View className='rate-modal-loading'>
            <Text className='rate-modal-loading-text'>正在获取实时汇率...</Text>
          </View>
        ) : (
          <>
            <View className='rate-rows'>
              {sourceCurrencies.map(cur => (
                <View key={cur} className='rate-row'>
                  <Text className='rate-row-label'>
                    1 {currencySymbol(cur)} ({cur}) =
                  </Text>
                  <Input
                    className='rate-row-input'
                    type='digit'
                    value={editableRates[cur] ?? ''}
                    onInput={e => onRateChange(cur, e.detail.value)}
                  />
                  <Text className='rate-row-unit'>
                    {currencySymbol(targetCurrency)} {targetCurrency}
                  </Text>
                </View>
              ))}
            </View>

            <Text className='rate-modal-hint'>可手动修改汇率，点击"确认"后重新计算结算金额</Text>

            <View className='rate-modal-actions'>
              <View className='rate-modal-btn rate-cancel-btn' onClick={onCancel}>
                <Text className='rate-modal-btn-text'>取消</Text>
              </View>
              <View className='rate-modal-btn rate-confirm-btn' onClick={onConfirm}>
                <Text className='rate-modal-btn-text rate-confirm-text'>确认汇率</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  )
}

// ─── 账单列表 ─────────────────────────────────────────────

function BillsList({ bills, group, currentUID }: { bills: Bill[]; group: BillGroup; currentUID: string }) {
  const [showSettled, setShowSettled] = useState(false)

  if (bills.length === 0) {
    return (
      <View className='empty-bills'>
        <Text className='empty-bills-text'>暂无账单，点击下方 + 添加</Text>
      </View>
    )
  }

  const activeBills = bills.filter(b => b.status !== 'settled')
  const settledBills = bills.filter(b => b.status === 'settled')

  function renderBill(bill: Bill) {
    const myAmount = amountForUID(bill, currentUID)
    const isPayer = bill.paidByUID === currentUID
    // 作为付款人，别人合计欠你的金额（总额减去自己应摊的部分）
    const owedToMe = bill.totalAmount - myAmount
    return (
      <View
        key={bill.id}
        className='bill-row'
        onClick={() =>
          Taro.navigateTo({
            url: `/pages/bills/detail/index?groupID=${group.id}&billID=${bill.id}`,
          })
        }
      >
        <View className={`bill-icon ${bill.status === 'settled' ? 'bill-icon-settled' : ''}`}>
          <Text>¥</Text>
        </View>
        <View className='bill-info'>
          <Text className={`bill-title ${bill.status === 'settled' ? 'bill-title-settled' : ''}`}>
            {bill.title}
          </Text>
        </View>
        <View className='bill-amount-col'>
          <Text className={`bill-total ${bill.status === 'settled' ? 'bill-total-settled' : ''}`}>
            {formatAmount(bill.totalAmount, bill.currency)}
          </Text>
          {bill.status === 'settled' ? (
            <Text className='bill-tag-settled'>已结清</Text>
          ) : isPayer ? (
            owedToMe > 0 ? (
              <Text className='bill-tag-receive'>
                ↙ 应收 {formatAmount(owedToMe, bill.currency)}
              </Text>
            ) : (
              <Text className='bill-tag-settled'>你付款</Text>
            )
          ) : myAmount > 0 ? (
            <Text className='bill-tag-owe'>
              ↗ 应付 {formatAmount(myAmount, bill.currency)}
            </Text>
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <ScrollView scrollY className='bills-scroll'>
      {activeBills.map(renderBill)}

      {settledBills.length > 0 && (
        <>
          <View className='settled-header' onClick={() => setShowSettled(v => !v)}>
            <Text className='settled-header-text'>已结清（{settledBills.length}）</Text>
            <Text className='settled-header-toggle'>{showSettled ? '收起 ▲' : '展开 ▼'}</Text>
          </View>
          {showSettled && settledBills.map(renderBill)}
        </>
      )}
    </ScrollView>
  )
}

// ─── 成员列表 ─────────────────────────────────────────────

function MembersList({
  group,
  balances,
  displayCurrency,
  currentUID,
}: {
  group: BillGroup
  balances: Record<string, number>
  displayCurrency: CurrencyCode
  currentUID: string
}) {
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const isOwner = currentUID === group.createdBy

  async function handleSelectCurrency(c: CurrencyCode) {
    setShowCurrencyPicker(false)
    if (c === group.defaultCurrency) return
    try {
      await updateGroupCurrency(group.id, c)
      Taro.showToast({ title: '默认货币已更新', icon: 'success' })
    } catch {
      Taro.showToast({ title: '更新失败，请重试', icon: 'none' })
    }
  }

  return (
    <ScrollView scrollY className='members-scroll'>
      {/* 群组默认货币（仅群主可改） */}
      <View className='group-setting-card'>
        <View
          className='group-setting-row'
          onClick={isOwner ? () => setShowCurrencyPicker(v => !v) : undefined}
        >
          <Text className='group-setting-label'>默认货币</Text>
          <Text className='group-setting-value'>
            {group.defaultCurrency} {currencyName(group.defaultCurrency)}
            {isOwner && (
              <Text className='group-setting-toggle'>{showCurrencyPicker ? ' 收起' : ' 更改'}</Text>
            )}
          </Text>
        </View>
        {isOwner && showCurrencyPicker && (
          <ScrollView scrollY className='currency-list'>
            {ALL_CURRENCIES.map(c => (
              <Text
                key={c}
                className={`currency-option ${c === group.defaultCurrency ? 'currency-option-selected' : ''}`}
                onClick={() => handleSelectCurrency(c)}
              >
                {c}  {currencyName(c)}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>

      {group.memberIDs.map(uid => {
        const member = group.memberDetails[uid]
        const net = balances[uid] ?? 0
        return (
          <View key={uid} className='member-row'>
            <View className='member-avatar'>
              <Text className='member-avatar-text'>
                {(member?.displayName ?? uid).slice(0, 1)}
              </Text>
            </View>
            <View className='member-info'>
              <Text className='member-name'>{member?.displayName ?? uid}</Text>
              {uid === group.createdBy && (
                <Text className='member-owner-tag'>群主</Text>
              )}
            </View>
            <View className='member-balance'>
              {net !== 0 ? (
                <>
                  <Text className={`member-amount ${net > 0 ? 'text-green' : 'text-red'}`}>
                    {formatAmount(Math.abs(net), displayCurrency)}
                  </Text>
                  <Text className='member-balance-label'>{net > 0 ? '应收' : '应付'}</Text>
                </>
              ) : (
                <Text className='member-settled'>已结清</Text>
              )}
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}
