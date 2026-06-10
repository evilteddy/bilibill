import { useEffect, ReactNode } from 'react'
import { View, Text } from '@tarojs/components'
import { authStore } from '../../store'
import { useAuthGate } from '../../utils/useAuthGate'
import LoginPopup from '../LoginPopup'
import './index.css'

interface Props {
  children: ReactNode
  /** guest 态提示文案 */
  guestTip?: string
  /** loading 态提示文案 */
  loadingTip?: string
}

/**
 * 包裹需要登录才能查看的页面内容：
 * - 首次 auth 解析中显示 loading
 * - 未登录显示提示 + 自动弹出登录弹窗，登录成功后自动重渲染 children
 * - 已登录直接渲染 children
 */
export default function AuthGate({
  children,
  guestTip = '请登录后查看',
  loadingTip = '加载中...',
}: Props) {
  const state = useAuthGate()

  if (state === 'loading') {
    return (
      <View className='auth-gate-center'>
        <Text className='auth-gate-text'>{loadingTip}</Text>
      </View>
    )
  }

  if (state === 'guest') {
    return <GuestGate tip={guestTip} />
  }

  return <>{children}</>
}

function GuestGate({ tip }: { tip: string }) {
  useEffect(() => {
    authStore.showLoginPopup()
  }, [])
  return (
    <View className='auth-gate-center'>
      <Text className='auth-gate-text'>{tip}</Text>
      <LoginPopup />
    </View>
  )
}
