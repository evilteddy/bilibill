import { useState, useEffect } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import { groupStore } from '../../../store'
import { regenerateInviteCode } from '../../../services/groupService'
import AuthGate from '../../../components/AuthGate'
import './index.css'

export default function InvitePage() {
  return (
    <AuthGate guestTip='请登录后邀请成员'>
      <InviteContent />
    </AuthGate>
  )
}

function InviteContent() {
  const router = useRouter()
  const groupID = router.params.groupID as string
  const [group, setGroup] = useState(groupStore.getGroup(groupID))
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: '邀请成员' })
    const unsub = groupStore.onGroupsChange(() => setGroup(groupStore.getGroup(groupID)))
    return unsub
  }, [groupID])

  // 自定义分享内容（点击右上角"..."→分享 或 openType='share' 按钮时触发）
  useShareAppMessage(() => ({
    title: `加入「${group?.name ?? '群组'}」，一起记账分账`,
    path: `/pages/groups/join/index?code=${group?.inviteCode ?? ''}`,
  }))

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await regenerateInviteCode(groupID)
      Taro.showToast({ title: '已刷新', icon: 'success' })
    } catch {
      Taro.showToast({ title: '刷新失败', icon: 'none' })
    } finally {
      setRefreshing(false)
    }
  }

  function handleCopy() {
    Taro.setClipboardData({
      data: group?.inviteCode ?? '',
      success: () => Taro.showToast({ title: '已复制', icon: 'success' }),
    })
  }

  if (!group) return <View><Text>加载中...</Text></View>

  return (
    <View className='invite-container'>
      <View className='invite-card'>
        <Text className='invite-group-name'>{group.name}</Text>
        <Text className='invite-label'>邀请码</Text>
        <Text className='invite-code' onClick={handleCopy}>{group.inviteCode}</Text>
        <Text className='invite-hint'>将邀请码或链接发给好友，即可加入群组</Text>

        {/* openType='share' 直接唤起微信分享面板，选择群聊即可分享小程序卡片 */}
        <Button className='btn-share' openType='share'>
          分享到微信群
        </Button>
        <Button className='btn-copy' onClick={handleCopy}>复制邀请码</Button>
        <Button
          className='btn-refresh'
          loading={refreshing}
          onClick={handleRefresh}
        >
          刷新邀请码
        </Button>
      </View>
    </View>
  )
}
