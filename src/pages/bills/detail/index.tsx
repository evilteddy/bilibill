import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { groupStore, authStore } from '../../../store'
import { startListeningBills } from '../../../services/billService'
import { formatAmount, relativeDisplay } from '../../../utils/format'
import AuthGate from '../../../components/AuthGate'
import type { Bill } from '../../../models/types'
import './index.css'

export default function BillDetailPage() {
  return (
    <AuthGate guestTip='请登录后查看账单'>
      <BillDetailContent />
    </AuthGate>
  )
}

function BillDetailContent() {
  const router = useRouter()
  const groupID = router.params.groupID as string
  const billID = router.params.billID as string
  const group = groupStore.getGroup(groupID)
  const [bills, setBills] = useState<Bill[]>([])

  const bill = bills.find(b => b.id === billID)

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: '账单详情' })
    const unsub = startListeningBills(groupID, setBills)
    return unsub
  }, [groupID])

  if (!bill || !group) {
    return (
      <View className='loading'>
        <Text>加载中...</Text>
      </View>
    )
  }

  const currentUID = authStore.currentUser?.id ?? ''
  const payer = group.memberDetails[bill.paidByUID]
  const canEdit = bill.createdBy === currentUID && bill.status !== 'settled'

  return (
    <ScrollView scrollY className='detail-scroll'>
      {/* 总金额 */}
      <View className='amount-card'>
        <Text className='amount-label'>账单总额</Text>
        <Text className='amount-value'>
          {formatAmount(bill.totalAmount, bill.currency)}
        </Text>
        <Text className='amount-title'>{bill.title}</Text>
        <View className={`status-badge ${bill.status === 'settled' ? 'status-settled' : 'status-open'}`}>
          <Text>{bill.status === 'settled' ? '已结清' : '未结清'}</Text>
        </View>
      </View>

      {/* 基本信息 */}
      <View className='info-card'>
        <View className='info-row'>
          <Text className='info-label'>付款人</Text>
          <Text className='info-value'>{payer?.displayName ?? bill.paidByUID}</Text>
        </View>
        <View className='info-row'>
          <Text className='info-label'>分账方式</Text>
          <Text className='info-value'>平均分摊</Text>
        </View>
        <View className='info-row'>
          <Text className='info-label'>创建时间</Text>
          <Text className='info-value'>{relativeDisplay(bill.createdAt)}</Text>
        </View>
        {bill.notes && (
          <View className='info-row'>
            <Text className='info-label'>备注</Text>
            <Text className='info-value'>{bill.notes}</Text>
          </View>
        )}
      </View>

      {/* 分账明细 */}
      <View className='splits-card'>
        <Text className='splits-title'>分账明细</Text>
        {bill.splits.map(split => {
          const member = group.memberDetails[split.uid]
          const isSelf = split.uid === currentUID
          const isPayer = split.uid === bill.paidByUID
          return (
            <View key={split.uid} className='split-row'>
              <View className='split-avatar'>
                <Text>{(member?.displayName ?? split.uid).slice(0, 1)}</Text>
              </View>
              <Text className='split-name'>
                {isSelf ? `我（${member?.displayName ?? split.uid}）` : member?.displayName ?? split.uid}
              </Text>
              {isPayer && <Text className='payer-tag'>付款</Text>}
              <Text className={`split-amount ${isSelf && !isPayer ? 'text-red' : ''}`}>
                {formatAmount(split.amount, bill.currency)}
              </Text>
            </View>
          )
        })}
      </View>

      {canEdit && (
        <Button
          className='btn-edit-bill'
          onClick={() =>
            Taro.navigateTo({
              url: `/pages/bills/manual/index?groupID=${group.id}&billID=${bill.id}`,
            })
          }
        >
          编辑账单
        </Button>
      )}
    </ScrollView>
  )
}
