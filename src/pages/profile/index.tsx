import { useState, useEffect } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { authStore } from '../../store'
import { updateProfile, logout } from '../../services/authService'
import LoginPopup from '../../components/LoginPopup'
import './index.css'

export default function ProfilePage() {
  const [user, setUser] = useState(authStore.currentUser)
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: '我的' })
    const unsub = authStore.onAuthChange(u => {
      setUser(u)
      setDisplayName(u?.displayName ?? '')
    })
    return unsub
  }, [])

  async function handleSave() {
    if (!displayName.trim()) {
      Taro.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      await updateProfile(displayName.trim(), undefined)
      setEditing(false)
      Taro.showToast({ title: '保存成功', icon: 'success' })
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出吗？',
      success: async ({ confirm }) => {
        if (!confirm) return
        await logout()
      },
    })
  }

  if (!user) {
    return (
      <View className='profile-container'>
        <View className='profile-header'>
          <View className='profile-avatar profile-avatar-guest'>
            <Text className='profile-avatar-text'>?</Text>
          </View>
          <Text
            className='guest-login-link'
            onClick={() => authStore.showLoginPopup()}
          >
            点击登录
          </Text>
          <Text className='guest-login-tip'>登录后管理你的账户与群组</Text>
        </View>

        <View className='info-section'>
          <View
            className='info-row info-row-tappable'
            onClick={() => Taro.navigateTo({ url: '/pages/legal/index?type=terms' })}
          >
            <Text className='info-label'>用户协议</Text>
            <Text className='info-value'>›</Text>
          </View>
          <View
            className='info-row info-row-tappable'
            onClick={() => Taro.navigateTo({ url: '/pages/legal/index?type=privacy' })}
          >
            <Text className='info-label'>隐私政策</Text>
            <Text className='info-value'>›</Text>
          </View>
        </View>

        <LoginPopup />
      </View>
    )
  }

  return (
    <View className='profile-container'>
      {/* 头像区域 */}
      <View className='profile-header'>
        <View className='profile-avatar'>
          <Text className='profile-avatar-text'>{user.displayName.slice(0, 1)}</Text>
        </View>
        {!editing ? (
          <View className='profile-name-row'>
            <Text className='profile-name'>{user.displayName}</Text>
            <Text className='edit-btn' onClick={() => setEditing(true)}>编辑</Text>
          </View>
        ) : (
          <View className='profile-edit-row'>
            <Input
              className='name-input'
              value={displayName}
              onInput={e => setDisplayName(e.detail.value)}
              maxlength={20}
            />
            <Text className='save-btn' onClick={handleSave}>
              {loading ? '保存...' : '保存'}
            </Text>
            <Text className='cancel-btn' onClick={() => {
              setDisplayName(user.displayName)
              setEditing(false)
            }}>取消</Text>
          </View>
        )}
        {user.email && <Text className='profile-email'>{user.email}</Text>}
      </View>

      {/* 账号信息 */}
      <View className='info-section'>
        <View className='info-row'>
          <Text className='info-label'>账号 ID</Text>
          <Text className='info-value uid-text'>{user.id.slice(0, 16)}...</Text>
        </View>
        <View className='info-row'>
          <Text className='info-label'>偏好货币</Text>
          <Text className='info-value'>{user.preferredCurrency}</Text>
        </View>
      </View>

      {/* 协议 */}
      <View className='info-section'>
        <View
          className='info-row info-row-tappable'
          onClick={() => Taro.navigateTo({ url: '/pages/legal/index?type=terms' })}
        >
          <Text className='info-label'>用户协议</Text>
          <Text className='info-value'>›</Text>
        </View>
        <View
          className='info-row info-row-tappable'
          onClick={() => Taro.navigateTo({ url: '/pages/legal/index?type=privacy' })}
        >
          <Text className='info-label'>隐私政策</Text>
          <Text className='info-value'>›</Text>
        </View>
      </View>

      {/* 退出登录 */}
      <View className='logout-section'>
        <Button className='btn-logout' onClick={handleLogout}>退出登录</Button>
      </View>

      <LoginPopup />
    </View>
  )
}
