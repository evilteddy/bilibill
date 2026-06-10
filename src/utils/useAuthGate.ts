import { useEffect, useState } from 'react'
import { authStore } from '../store'

export type AuthGateState = 'loading' | 'guest' | 'authed'

/**
 * 用于需要登录才能查看的内页：
 * - 'loading': Firebase 首次 auth 状态尚未解析，渲染占位
 * - 'guest':   解析后未登录，调用方应调用 authStore.showLoginPopup(onLoginSuccess) 并渲染 <LoginPopup />
 * - 'authed':  已登录，可正常加载数据
 */
export function useAuthGate(): AuthGateState {
  const [ready, setReady] = useState(authStore.authReady)
  const [user, setUser] = useState(authStore.currentUser)

  useEffect(() => {
    const unsubReady = authStore.onAuthReady(() => setReady(true))
    const unsubAuth = authStore.onAuthChange(setUser)
    return () => {
      unsubReady()
      unsubAuth()
    }
  }, [])

  if (!ready) return 'loading'
  return user ? 'authed' : 'guest'
}
