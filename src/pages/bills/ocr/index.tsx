/**
 * 拍照识别账单页面
 *
 * 流程：
 *   idle       → 用户拍照/选图
 *   recognizing → 调用 LLM 识别（最多重试 3 次）
 *   review     → 展示识别结果，填写付款人/参与者/标题，点击"确认记账"
 *   saving     → 写入 Firestore，跳回群组详情
 */

import { useState, useEffect } from 'react'
import { View, Text, Image, ScrollView, Input, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { groupStore, authStore } from '../../../store'
import { createEqualBill } from '../../../services/billService'
import { recognizeBill } from '../../../services/ocrService'
import { toStorageAmount, formatAmount } from '../../../utils/format'
import AuthGate from '../../../components/AuthGate'
import type { CurrencyCode } from '../../../utils/format'
import type { OcrResult } from '../../../services/ocrService'
import './index.css'

type PageState = 'idle' | 'recognizing' | 'review' | 'saving'

export default function OcrBillPage() {
  return (
    <AuthGate guestTip='请登录后录入账单'>
      <OcrBillContent />
    </AuthGate>
  )
}

function OcrBillContent() {
  const router = useRouter()
  const groupID = router.params.groupID as string
  const group = groupStore.getGroup(groupID)
  const currentUID = authStore.currentUser?.id ?? ''

  // ─── 状态 ──────────────────────────────────────────────
  const [pageState, setPageState] = useState<PageState>('idle')
  const [imagePath, setImagePath] = useState('')
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Review 表单
  const [title, setTitle] = useState('拍照账单')
  const [paidByUID, setPaidByUID] = useState(currentUID)
  // 默认全选所有成员参与分账
  const [selectedUIDs, setSelectedUIDs] = useState<Set<string>>(() => new Set(group?.memberIDs ?? [currentUID]))
  const [notes, setNotes] = useState('')
  // 默认折叠付款人选择（一般录入者即付款人）
  const [showPayerPicker, setShowPayerPicker] = useState(false)

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: '拍照识别' })
  }, [])

  // ─── 选图 ───────────────────────────────────────────────
  async function handleChooseImage() {
    try {
      const res = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        camera: 'back',
      })
      const path = res.tempFiles[0]?.tempFilePath
      if (!path) return
      setImagePath(path)
      setOcrResult(null)
      setErrorMsg('')
      setPageState('idle')
    } catch {
      // 用户取消，不处理
    }
  }

  // ─── 识别 ───────────────────────────────────────────────
  async function handleRecognize() {
    if (!imagePath) return
    setPageState('recognizing')
    setErrorMsg('')
    try {
      const result = await recognizeBill(imagePath)
      setOcrResult(result)
      // 根据识别结果预填货币（若与群组默认货币不同，保留识别结果）
      setPageState('review')
    } catch (e: any) {
      setErrorMsg(e?.message ?? '识别失败，请重试')
      setPageState('idle')
    }
  }

  // ─── 切换参与人 ──────────────────────────────────────────
  function toggleMember(uid: string) {
    setSelectedUIDs(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  // ─── 确认记账 ────────────────────────────────────────────
  async function handleConfirm() {
    if (!ocrResult || !authStore.currentUser || !group) return
    if (selectedUIDs.size === 0) {
      Taro.showToast({ title: '请至少选一位参与者', icon: 'none' })
      return
    }

    setPageState('saving')
    try {
      const currency: CurrencyCode = ocrResult.currency
      const totalCents = toStorageAmount(ocrResult.totalAmount, currency)

      await createEqualBill({
        groupID,
        title: title.trim() || '拍照账单',
        currency,
        totalAmount: totalCents,
        paidByUID,
        participantUIDs: Array.from(selectedUIDs),
        notes: notes.trim() || undefined,
        createdBy: authStore.currentUser.id,
        splitMode: 'ocr_equal',
      })

      Taro.showToast({ title: '记账成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (e: any) {
      Taro.showToast({ title: e?.message ?? '保存失败', icon: 'none' })
      setPageState('review')
    }
  }

  if (!group) return <View><Text>加载中...</Text></View>

  // ─── 渲染：idle / recognizing ────────────────────────────
  if (pageState === 'idle' || pageState === 'recognizing') {
    return (
      <View className='ocr-container'>
        {/* 图片预览区 */}
        <View className='ocr-image-area' onClick={handleChooseImage}>
          {imagePath ? (
            <Image className='ocr-preview-img' src={imagePath} mode='aspectFit' />
          ) : (
            <View className='ocr-placeholder'>
              <Text className='ocr-placeholder-icon'>📷</Text>
              <Text className='ocr-placeholder-text'>点击拍照或选择账单图片</Text>
            </View>
          )}
        </View>

        {/* 错误提示 */}
        {errorMsg ? (
          <View className='ocr-error-box'>
            <Text className='ocr-error-text'>{errorMsg}</Text>
          </View>
        ) : null}

        {/* 操作按钮 */}
        <View className='ocr-action-bar'>
          <Button className='btn-choose' onClick={handleChooseImage}>
            {imagePath ? '重新选图' : '选择图片'}
          </Button>
          {imagePath && (
            <Button
              className='btn-recognize'
              loading={pageState === 'recognizing'}
              disabled={pageState === 'recognizing'}
              onClick={handleRecognize}
            >
              {pageState === 'recognizing' ? '识别中...' : '识别账单'}
            </Button>
          )}
        </View>

        {pageState === 'recognizing' && (
          <View className='ocr-hint'>
            <Text className='ocr-hint-text'>正在分析账单，最多重试 3 次，请稍候...</Text>
          </View>
        )}
      </View>
    )
  }

  // ─── 渲染：review / saving ───────────────────────────────
  const result = ocrResult!
  const currency = result.currency
  const totalCents = toStorageAmount(result.totalAmount, currency)
  const perPersonCents = selectedUIDs.size > 0 ? Math.floor(totalCents / selectedUIDs.size) : 0

  return (
    <View className='ocr-container'>
      <ScrollView scrollY className='ocr-scroll'>

        {/* 识别结果：条目列表 */}
        <View className='form-section'>
          <Text className='section-title'>识别明细</Text>
          {result.items.map((item, idx) => (
            <View key={idx} className='item-row'>
              <View className='item-info'>
                <Text className='item-name'>{item.name}</Text>
                <Text className='item-qty'>× {item.quantity}</Text>
              </View>
              <View className='item-prices'>
                <Text className='item-total'>{formatAmount(toStorageAmount(item.totalPrice, currency), currency)}</Text>
                <Text className='item-unit'>单价 {formatAmount(toStorageAmount(item.unitPrice, currency), currency)}</Text>
              </View>
            </View>
          ))}
          <View className='item-total-row'>
            <Text className='item-total-label'>识别总计</Text>
            <Text className='item-total-amount'>{formatAmount(totalCents, currency)}</Text>
          </View>
        </View>

        {/* 账单信息 */}
        <View className='form-section'>
          <Text className='section-title'>账单信息</Text>
          <View className='form-row'>
            <Text className='form-label'>标题</Text>
            <Input
              className='form-input'
              value={title}
              onInput={e => setTitle(e.detail.value)}
              placeholder='账单标题'
            />
          </View>
          <View className='form-row'>
            <Text className='form-label'>货币</Text>
            <Text className='form-value'>{currency}</Text>
          </View>
          <View className='form-row'>
            <Text className='form-label'>总金额</Text>
            <Text className='form-amount'>{formatAmount(totalCents, currency)}</Text>
          </View>
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
            {selectedUIDs.size > 0 && (
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

        {/* 重新拍照入口 */}
        <View className='re-take-row'>
          <Text className='re-take-btn' onClick={() => { setPageState('idle'); setOcrResult(null) }}>
            重新拍照识别
          </Text>
        </View>

      </ScrollView>

      <View className='ocr-footer'>
        <Button
          className='btn-confirm'
          loading={pageState === 'saving'}
          disabled={pageState === 'saving' || selectedUIDs.size === 0}
          onClick={handleConfirm}
        >
          确认记账
        </Button>
      </View>
    </View>
  )
}
