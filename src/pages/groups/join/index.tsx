import { useState, useEffect } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { joinGroup } from '../../../services/groupService'
import { authStore, groupStore } from '../../../store'
import AuthGate from '../../../components/AuthGate'
import './index.css'

export default function JoinGroupPage() {
  return (
    <AuthGate guestTip='请登录后加入群组'>
      <JoinGroupContent />
    </AuthGate>
  )
}

function JoinGroupContent() {
  const router = useRouter()
  // 支持从分享链接直接带入邀请码（?code=XXXXXX）
  const [code, setCode] = useState((router.params.code ?? '').toUpperCase())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: '加入群组' })
  }, [])

  async function handleJoin() {
    if (code.trim().length !== 6) {
      Taro.showToast({ title: '邀请码为 6 位', icon: 'none' })
      return
    }
    const user = authStore.currentUser
    if (!user) return

    setLoading(true)
    try {
      const group = await joinGroup(code.trim(), user)
      // 立即写入 store，detail 页初始化时能直接拿到群组数据
      groupStore.setGroups([...groupStore.groups, group])
      Taro.showToast({ title: '加入成功', icon: 'success' })
      setTimeout(() => {
        Taro.navigateTo({ url: `/pages/groups/detail/index?groupID=${group.id}` })
      }, 800)
    } catch (e: any) {
      Taro.showToast({ title: e.message ?? '加入失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='join-container'>
      <View className='join-card'>
        <Text className='join-title'>输入邀请码</Text>
        <Text className='join-desc'>请输入 6 位邀请码加入群组</Text>

        <Input
          className='code-input'
          placeholder='如：ABCD12'
          value={code}
          maxlength={6}
          onInput={e => setCode(e.detail.value.toUpperCase())}
        />

        <Button
          className='btn-join'
          loading={loading}
          disabled={code.trim().length !== 6 || loading}
          onClick={handleJoin}
        >
          加入群组
        </Button>
      </View>
    </View>
  )
}
