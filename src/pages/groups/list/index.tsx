import { useState, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { authStore, groupStore } from '../../../store'
import { startListeningGroups, stopListeningGroups } from '../../../services/groupService'
import { requireLogin } from '../../../utils/authGuard'
import LoginPopup from '../../../components/LoginPopup'
import type { BillGroup, AppUser } from '../../../models/types'
import './index.css'

export default function GroupListPage() {
  const [groups, setGroups] = useState<BillGroup[]>(groupStore.groups)
  const [user, setUser] = useState<AppUser | null>(authStore.currentUser)

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: '一键分账' })

    const unsubGroups = groupStore.onGroupsChange(setGroups)
    const unsubAuth = authStore.onAuthChange(u => {
      setUser(u)
      if (u) {
        startListeningGroups(u.id)
      } else {
        stopListeningGroups()
        groupStore.setGroups([])
      }
    })

    // 进入页面时若已登录则订阅
    if (authStore.currentUser) {
      startListeningGroups(authStore.currentUser.id)
    }

    return () => {
      unsubGroups()
      unsubAuth()
      stopListeningGroups()
    }
  }, [])

  // 每次显示时重新拉取（从创建/加入页返回后刷新）
  useDidShow(() => {
    if (authStore.currentUser) {
      startListeningGroups(authStore.currentUser.id)
    }
  })

  function goToDetail(groupID: string) {
    Taro.navigateTo({ url: `/pages/groups/detail/index?groupID=${groupID}` })
  }

  function goToCreate() {
    requireLogin(() => Taro.navigateTo({ url: '/pages/groups/create/index' }))
  }

  function goToJoin() {
    requireLogin(() => Taro.navigateTo({ url: '/pages/groups/join/index' }))
  }

  return (
    <View className='list-container'>
      {/* 顶部操作栏 */}
      <View className='list-header'>
        <Text className='list-title'>我的群组</Text>
        <View className='list-header-actions'>
          <Text className='header-btn' onClick={goToJoin}>加入</Text>
          <Text className='header-btn header-btn-primary' onClick={goToCreate}>新建</Text>
        </View>
      </View>

      {!user ? (
        <GuestEmptyState onLogin={() => authStore.showLoginPopup()} />
      ) : groups.length === 0 ? (
        <View className='empty-state'>
          <Text className='empty-icon'>📋</Text>
          <Text className='empty-title'>还没有群组</Text>
          <Text className='empty-desc'>新建一个群组，开始记账分账吧</Text>
          <Text className='empty-btn' onClick={goToCreate}>新建群组</Text>
        </View>
      ) : (
        <ScrollView scrollY className='group-scroll'>
          {groups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              currentUID={user.id}
              onTap={() => goToDetail(group.id)}
            />
          ))}
        </ScrollView>
      )}

      <LoginPopup />
    </View>
  )
}

function GuestEmptyState({ onLogin }: { onLogin: () => void }) {
  return (
    <ScrollView scrollY className='guest-scroll'>
      <View className='guest-hero'>
        <Text className='guest-hero-emoji'>💸</Text>
        <Text className='guest-hero-title'>记账分账，清清楚楚</Text>
        <Text className='guest-hero-desc'>多人一起花钱，最后谁该给谁多少，一键算清</Text>
      </View>

      <View className='feature-grid'>
        <View className='feature-card'>
          <Text className='feature-icon'>👥</Text>
          <Text className='feature-title'>创建/加入群组</Text>
          <Text className='feature-desc'>朋友聚餐、出游、合租，按场景建群</Text>
        </View>
        <View className='feature-card'>
          <Text className='feature-icon'>🧮</Text>
          <Text className='feature-title'>AA 自动分账</Text>
          <Text className='feature-desc'>支持平摊、按份数、按金额，自动计算谁付谁</Text>
        </View>
        <View className='feature-card'>
          <Text className='feature-icon'>📸</Text>
          <Text className='feature-title'>账单 OCR 识别</Text>
          <Text className='feature-desc'>拍小票自动识别金额，省去手动录入</Text>
        </View>
      </View>

      <View className='guest-cta'>
        <Text className='guest-login-btn' onClick={onLogin}>立即登录</Text>
        <Text className='guest-tip'>登录后才能创建/加入群组</Text>
      </View>
    </ScrollView>
  )
}

function GroupCard({
  group,
  currentUID,
  onTap,
}: {
  group: BillGroup
  currentUID: string
  onTap: () => void
}) {
  const memberCount = group.memberIDs.length

  return (
    <View className='group-card' onClick={onTap}>
      <View className='group-card-left'>
        <View className='group-avatar'>
          <Text className='group-avatar-text'>{group.name.slice(0, 1)}</Text>
        </View>
        <View className='group-info'>
          <Text className='group-name'>{group.name}</Text>
          <Text className='group-meta'>{memberCount} 人 · {group.defaultCurrency}</Text>
        </View>
      </View>
      <Text className='group-arrow'>›</Text>
    </View>
  )
}
