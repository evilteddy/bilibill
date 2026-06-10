import { authStore } from '../store'

/** 需要登录才能执行的动作守卫：已登录立即执行，未登录弹出登录弹窗，登录成功后自动执行。 */
export function requireLogin(action: () => void) {
  if (authStore.isLoggedIn) {
    action()
  } else {
    authStore.showLoginPopup(action)
  }
}
