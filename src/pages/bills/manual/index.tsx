import { useState, useEffect } from 'react'
import { View, Text, Input, Button, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { groupStore, authStore } from '../../../store'
import { createEqualBill, getBill, updateBill } from '../../../services/billService'
import { ALL_CURRENCIES, currencyName, toStorageAmount, formatAmount, storageMultiplier } from '../../../utils/format'
import AuthGate from '../../../components/AuthGate'
import type { CurrencyCode } from '../../../utils/format'
import type { BillGroup } from '../../../models/types'
import './index.css'

export default function ManualBillPage() {
  return (
    <AuthGate guestTip='请登录后录入账单'>
      <ManualBillContent />
    </AuthGate>
  )
}

function ManualBillContent() {
  const router = useRouter()
  const groupID = router.params.groupID as string
  const billID = router.params.billID as string | undefined
  const isEdit = !!billID
  const group = groupStore.getGroup(groupID)
  const currentUID = authStore.currentUser?.id ?? ''

  const [title, setTitle] = useState('')
  const [amountText, setAmountText] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>(group?.defaultCurrency ?? 'CNY')
  const [paidByUID, setPaidByUID] = useState(currentUID)
  // 默认全选所有成员参与分账
  const [selectedUIDs, setSelectedUIDs] = useState<Set<string>>(() => new Set(group?.memberIDs ?? [currentUID]))
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  // 默认折叠付款人选择（一般录入者即付款人）
  const [showPayerPicker, setShowPayerPicker] = useState(false)

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: isEdit ? '编辑账单' : '手动录入' })
    if (!isEdit) return
    // 编辑模式：回填已有账单
    getBill(groupID, billID!)
      .then(bill => {
        if (!bill) return
        setTitle(bill.title)
        setCurrency(bill.currency)
        setAmountText(String(bill.totalAmount / storageMultiplier(bill.currency)))
        setPaidByUID(bill.paidByUID)
        setSelectedUIDs(new Set(bill.participantUIDs))
        setNotes(bill.notes ?? '')
      })
      .catch(() => Taro.showToast({ title: '加载账单失败', icon: 'none' }))
  }, [])

  const totalCents = amountText ? toStorageAmount(parseFloat(amountText) || 0, currency) : 0
  const perPersonCents = selectedUIDs.size > 0 ? Math.floor(totalCents / selectedUIDs.size) : 0
  const isValid = title.trim() && totalCents > 0 && paidByUID && selectedUIDs.size > 0

  function toggleMember(uid: string) {
    setSelectedUIDs(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  async function handleSave() {
    if (!isValid || !authStore.currentUser) return
    setLoading(true)
    try {
      if (isEdit) {
        await updateBill({
          groupID,
          billID: billID!,
          title: title.trim(),
          currency,
          totalAmount: totalCents,
          paidByUID,
          participantUIDs: Array.from(selectedUIDs),
          notes: notes.trim() || undefined,
        })
      } else {
        await createEqualBill({
          groupID,
          title: title.trim(),
          currency,
          totalAmount: totalCents,
          paidByUID,
          participantUIDs: Array.from(selectedUIDs),
          notes: notes.trim() || undefined,
          createdBy: authStore.currentUser.id,
        })
      }
      Taro.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (e: any) {
      Taro.showToast({ title: e.message ?? '保存失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  if (!group) return <View><Text>加载中...</Text></View>

  return (
    <View className='manual-container'>
      <ScrollView scrollY className='manual-scroll'>
        {/* 账单信息 */}
        <View className='form-section'>
          <Text className='section-title'>账单信息</Text>

          <View className='form-row'>
            <Text className='form-label'>标题</Text>
            <Input
              className='form-input'
              placeholder='如：超市购物'
              value={title}
              onInput={e => setTitle(e.detail.value)}
            />
          </View>

          <View className='form-row amount-row'>
            <Text
              className='currency-tag'
              onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}
            >
              {currency} ›
            </Text>
            <Input
              className='amount-input'
              type='digit'
              placeholder='0.00'
              value={amountText}
              onInput={e => setAmountText(e.detail.value)}
            />
          </View>

          {showCurrencyPicker && (
            <ScrollView scrollY className='currency-list'>
              {ALL_CURRENCIES.map(c => (
                <Text
                  key={c}
                  className={`currency-option ${c === currency ? 'currency-option-selected' : ''}`}
                  onClick={() => { setCurrency(c); setShowCurrencyPicker(false) }}
                >
                  {c}  {currencyName(c)}
                </Text>
              ))}
            </ScrollView>
          )}
        </View>

        {/* 付款人（默认折叠，点击可切换） */}
        <View className='form-section'>
          <View className='section-header' onClick={() => setShowPayerPicker(v => !v)}>
            <Text className='section-title'>付款人</Text>
            <Text className='payer-current'>
              {(() => {
                const name = group.memberDetails[paidByUID]?.displayName ?? paidByUID
                return paidByUID === currentUID ? `我（${name}）` : name
              })()}
              <Text className='payer-toggle'>{showPayerPicker ? ' 收起' : ' 更改'}</Text>
            </Text>
          </View>

          {showPayerPicker && group.memberIDs.map(uid => {
            const member = group.memberDetails[uid]
            const name = member?.displayName ?? uid
            return (
              <View
                key={uid}
                className={`member-row ${paidByUID === uid ? 'member-row-selected' : ''}`}
                onClick={() => { setPaidByUID(uid); setShowPayerPicker(false) }}
              >
                <View className='member-avatar'>
                  <Text>{name.slice(0, 1)}</Text>
                </View>
                <Text className='member-name'>
                  {uid === currentUID ? `我（${name}）` : name}
                </Text>
                {paidByUID === uid && <Text className='check-icon'>✓</Text>}
              </View>
            )
          })}
        </View>

        {/* 参与分账 */}
        <View className='form-section'>
          <Text className='section-title'>参与分账</Text>
          {group.memberIDs.map(uid => {
            const member = group.memberDetails[uid]
            const name = member?.displayName ?? uid
            const isSelected = selectedUIDs.has(uid)
            return (
              <View key={uid} className='member-row' onClick={() => toggleMember(uid)}>
                <View className={`check-box ${isSelected ? 'check-box-checked' : ''}`}>
                  {isSelected && <Text className='check-inner'>✓</Text>}
                </View>
                <Text className='member-name'>
                  {uid === currentUID ? `我（${name}）` : name}
                </Text>
                {isSelected && totalCents > 0 && (
                  <Text className='per-person'>{formatAmount(perPersonCents, currency)}</Text>
                )}
              </View>
            )
          })}

          <View className='select-all-row'>
            <Text
              className='select-all-btn'
              onClick={() => setSelectedUIDs(new Set(group.memberIDs))}
            >全选</Text>
            {selectedUIDs.size > 0 && totalCents > 0 && (
              <Text className='per-person-summary'>
                每人 {formatAmount(perPersonCents, currency)}
              </Text>
            )}
          </View>
        </View>

        {/* 备注 */}
        <View className='form-section'>
          <Text className='section-title'>备注（可选）</Text>
          <Input
            className='form-input'
            placeholder='添加备注...'
            value={notes}
            onInput={e => setNotes(e.detail.value)}
          />
        </View>
      </ScrollView>

      <View className='manual-footer'>
        <Button
          className='btn-save'
          loading={loading}
          disabled={!isValid || loading}
          onClick={handleSave}
        >
          {isEdit ? '保存修改' : '保存账单'}
        </Button>
      </View>
    </View>
  )
}
