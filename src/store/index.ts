// 全局状态管理（对应 iOS 的 @Observable 服务单例）
// 用简单的事件发布 + 模块级变量替代 Redux，减少依赖

import type { AppUser, BillGroup } from '../models/types'

// ─── Auth State ──────────────────────────────────────────

let _currentUser: AppUser | null = null
let _authReady = false
const _authListeners: Array<(user: AppUser | null) => void> = []
const _readyListeners: Array<() => void> = []

// 登录弹窗状态：visible + 登录成功后要执行的回调
let _loginPopupVisible = false
let _pendingLoginAction: (() => void) | null = null
const _popupListeners: Array<(visible: boolean) => void> = []

export const authStore = {
  get currentUser() {
    return _currentUser
  },
  get isLoggedIn() {
    return _currentUser !== null
  },
  get authReady() {
    return _authReady
  },
  /** 首次 Firebase onAuthStateChanged 触发后调用。仅可被 authService 调用。 */
  markAuthReady() {
    if (_authReady) return
    _authReady = true
    _readyListeners.splice(0).forEach(fn => fn())
  },
  /** 等待首次 auth 状态解析完成（已 ready 立即触发）。返回取消订阅函数。 */
  onAuthReady(fn: () => void) {
    if (_authReady) {
      fn()
      return () => {}
    }
    _readyListeners.push(fn)
    return () => {
      const idx = _readyListeners.indexOf(fn)
      if (idx !== -1) _readyListeners.splice(idx, 1)
    }
  },
  setUser(user: AppUser | null) {
    _currentUser = user
    _authListeners.forEach(fn => fn(user))
    // 登录成功后自动关闭弹窗并触发挂起的动作
    if (user && _loginPopupVisible) {
      authStore.hideLoginPopup()
      const action = _pendingLoginAction
      _pendingLoginAction = null
      action?.()
    }
  },
  onAuthChange(fn: (user: AppUser | null) => void) {
    _authListeners.push(fn)
    return () => {
      const idx = _authListeners.indexOf(fn)
      if (idx !== -1) _authListeners.splice(idx, 1)
    }
  },

  get loginPopupVisible() {
    return _loginPopupVisible
  },
  showLoginPopup(onSuccess?: () => void) {
    _pendingLoginAction = onSuccess ?? null
    _loginPopupVisible = true
    _popupListeners.forEach(fn => fn(true))
  },
  hideLoginPopup() {
    _loginPopupVisible = false
    _pendingLoginAction = null
    _popupListeners.forEach(fn => fn(false))
  },
  onLoginPopupChange(fn: (visible: boolean) => void) {
    _popupListeners.push(fn)
    return () => {
      const idx = _popupListeners.indexOf(fn)
      if (idx !== -1) _popupListeners.splice(idx, 1)
    }
  },
}

// ─── Group State ─────────────────────────────────────────

let _groups: BillGroup[] = []
const _groupListeners: Array<(groups: BillGroup[]) => void> = []

export const groupStore = {
  get groups() {
    return _groups
  },
  setGroups(groups: BillGroup[]) {
    _groups = groups
    _groupListeners.forEach(fn => fn(groups))
  },
  onGroupsChange(fn: (groups: BillGroup[]) => void) {
    _groupListeners.push(fn)
    return () => {
      const idx = _groupListeners.indexOf(fn)
      if (idx !== -1) _groupListeners.splice(idx, 1)
    }
  },
  getGroup(id: string): BillGroup | undefined {
    return _groups.find(g => g.id === id)
  },
}
