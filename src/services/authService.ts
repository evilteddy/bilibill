// 对应 iOS AuthService.swift

import Taro from '@tarojs/taro'
import {
  signInWithCustomToken,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
  User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore/lite'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../utils/firebase'
import { authStore } from '../store'
import type { AppUser } from '../models/types'

// 监听 Firebase Auth 状态变化，同步到 authStore
onAuthStateChanged(auth, async (firebaseUser) => {
  try {
    if (firebaseUser) {
      const user = await fetchUserDoc(firebaseUser)
      authStore.setUser(user)
    } else {
      authStore.setUser(null)
    }
  } finally {
    // 无论成功失败，首次回调后都视为 auth 状态已解析，让 UI 退出 loading
    authStore.markAuthReady()
  }
})

async function fetchUserDoc(firebaseUser: FirebaseUser): Promise<AppUser> {
  const ref = doc(db, 'users', firebaseUser.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const d = snap.data()
    return {
      id: firebaseUser.uid,
      displayName: d.displayName ?? firebaseUser.displayName ?? '用户',
      avatarURL: d.avatarURL,
      email: d.email,
      phone: d.phone,
      wechatOpenID: d.wechatOpenID,
      preferredCurrency: d.preferredCurrency ?? 'CNY',
      createdAt: d.createdAt ?? Date.now() / 1000,
    }
  }
  // 新用户，创建文档（Firestore 不允许 undefined，只写有值的字段）
  const newUser: AppUser = {
    id: firebaseUser.uid,
    displayName: firebaseUser.displayName ?? '用户',
    preferredCurrency: 'CNY',
    createdAt: Date.now() / 1000,
  }
  if (firebaseUser.photoURL) newUser.avatarURL = firebaseUser.photoURL
  if (firebaseUser.email) newUser.email = firebaseUser.email
  await setDoc(ref, newUser)
  return newUser
}

/** 微信小程序登录
 *  流程: wx.login() → code → Cloud Function → Firebase Custom Token
 */
export async function loginWithWeChat(): Promise<void> {
  const { code } = await Taro.login()
  const exchangeFn = httpsCallable<{ code: string }, { firebaseToken: string }>(
    functions,
    'exchangeWeChatMiniAppCode'
  )
  const result = await exchangeFn({ code })
  await signInWithCustomToken(auth, result.data.firebaseToken)
}

/** 邮箱登录 */
export async function loginWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password)
}

/** 邮箱注册 */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<void> {
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  await firebaseUpdateProfile(credential.user, { displayName })
  // fetchUserDoc 会在 onAuthStateChanged 触发后自动创建用户文档
}

/** 登出 */
export async function logout(): Promise<void> {
  await signOut(auth)
}

/** 更新个人资料，并同步到所有所在群组的 memberDetails */
export async function updateProfile(
  displayName?: string,
  avatarURL?: string
): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return

  const updates: Record<string, string> = {}
  if (displayName) updates.displayName = displayName
  if (avatarURL) updates.avatarURL = avatarURL
  if (Object.keys(updates).length === 0) return

  await updateDoc(doc(db, 'users', uid), updates)

  // 同步更新所在群组的 memberDetails
  const { groupStore } = await import('../store')
  const groups = groupStore.groups
  const batchUpdates = groups.map(group => {
    const memberRef = doc(db, 'groups', group.id)
    const fieldsToUpdate: Record<string, string> = {}
    if (displayName) fieldsToUpdate[`memberDetails.${uid}.displayName`] = displayName
    if (avatarURL) fieldsToUpdate[`memberDetails.${uid}.avatarURL`] = avatarURL
    return updateDoc(memberRef, fieldsToUpdate)
  })
  await Promise.all(batchUpdates)

  // 更新本地状态
  const current = authStore.currentUser
  if (current) {
    authStore.setUser({
      ...current,
      ...(displayName ? { displayName } : {}),
      ...(avatarURL ? { avatarURL } : {}),
    })
  }
}
