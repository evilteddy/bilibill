import { useState, useEffect } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { loginWithWeChat, loginWithEmail, registerWithEmail } from '../../services/authService'
import { authStore } from '../../store'
import './index.css'

function openLegal(type: 'terms' | 'privacy') {
  Taro.navigateTo({ url: `/pages/legal/index?type=${type}` })
}

type Mode = 'welcome' | 'login' | 'register'

function friendlyAuthError(e: any): string {
  const code: string = e?.code ?? ''
  const map: Record<string, string> = {
    'auth/user-not-found':        '账户不存在，请先注册',
    'auth/wrong-password':        '密码错误，请重试',
    'auth/invalid-credential':    '邮箱或密码错误',
    'auth/invalid-email':         '邮箱格式不正确',
    'auth/email-already-in-use':  '该邮箱已被注册',
    'auth/weak-password':         '密码至少需要 6 位',
    'auth/too-many-requests':     '登录失败次数过多，请稍后再试',
    'auth/network-request-failed':'网络连接失败，请检查网络',
    'auth/user-disabled':         '该账号已被禁用，请联系客服',
    'auth/operation-not-allowed': '该登录方式暂未开启',
  }
  return map[code] ?? e?.message ?? '操作失败，请重试'
}

export default function LoginPopup() {
  const [visible, setVisible] = useState(authStore.loginPopupVisible)
  const [mode, setMode] = useState<Mode>('welcome')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return authStore.onLoginPopupChange(v => {
      setVisible(v)
      if (!v) {
        // 关闭时重置表单
        setMode('welcome')
        setEmail('')
        setPassword('')
        setDisplayName('')
        setError('')
        setLoading(false)
      }
    })
  }, [])

  function ensureAgreed(): boolean {
    if (!agreed) {
      setError('请先阅读并同意《用户协议》和《隐私政策》')
      return false
    }
    return true
  }

  async function handleWeChatLogin() {
    if (!ensureAgreed()) return
    setLoading(true)
    setError('')
    try {
      await loginWithWeChat()
    } catch (e: any) {
      setError(friendlyAuthError(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleEmailSubmit() {
    if (!ensureAgreed()) return
    if (!email || !password) {
      setError('请填写邮箱和密码')
      return
    }
    if (mode === 'register' && !displayName) {
      setError('请填写昵称')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (mode === 'register') {
        await registerWithEmail(email, password, displayName)
      } else {
        await loginWithEmail(email, password)
      }
    } catch (e: any) {
      setError(friendlyAuthError(e))
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <View className='login-popup-mask' onClick={() => authStore.hideLoginPopup()}>
      <View className='login-popup-sheet' onClick={e => e.stopPropagation()}>
        <View className='login-popup-handle' />

        <View className='login-popup-header'>
          <Text className='login-popup-title'>
            {mode === 'welcome' ? '登录一键分账' : mode === 'login' ? '邮箱登录' : '注册账号'}
          </Text>
          <Text className='login-popup-close' onClick={() => authStore.hideLoginPopup()}>
            ✕
          </Text>
        </View>

        {mode === 'welcome' ? (
          <View className='login-popup-body'>
            <Text className='login-popup-subtitle'>登录后即可创建/加入群组，开始记账分账</Text>

            <Button
              className='btn-wechat'
              loading={loading}
              onClick={handleWeChatLogin}
            >
              微信一键登录
            </Button>

            <Button
              className='btn-email'
              onClick={() => { setError(''); setMode('login') }}
            >
              邮箱登录
            </Button>

            {error ? <Text className='login-popup-error'>{error}</Text> : null}
          </View>
        ) : (
          <View className='login-popup-body'>
            {mode === 'register' && (
              <View className='form-field'>
                <Text className='form-label'>昵称</Text>
                <Input
                  className='form-input'
                  placeholder='输入你的昵称'
                  value={displayName}
                  onInput={e => setDisplayName(e.detail.value)}
                />
              </View>
            )}

            <View className='form-field'>
              <Text className='form-label'>邮箱</Text>
              <Input
                className='form-input'
                type='text'
                placeholder='your@email.com'
                value={email}
                onInput={e => setEmail(e.detail.value)}
              />
            </View>

            <View className='form-field'>
              <Text className='form-label'>密码</Text>
              <Input
                className='form-input'
                password
                placeholder='至少 6 位'
                value={password}
                onInput={e => setPassword(e.detail.value)}
              />
            </View>

            {error ? <Text className='login-popup-error'>{error}</Text> : null}

            <Button
              className='btn-submit'
              loading={loading}
              onClick={handleEmailSubmit}
            >
              {mode === 'login' ? '登录' : '注册'}
            </Button>

            <View className='login-popup-switch-row'>
              <Text
                className='login-popup-switch'
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login')
                  setError('')
                }}
              >
                {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
              </Text>
              <Text className='login-popup-back' onClick={() => { setError(''); setMode('welcome') }}>
                返回
              </Text>
            </View>
          </View>
        )}

        <View className='login-popup-agreement' onClick={() => setAgreed(!agreed)}>
          <View className={`agree-box ${agreed ? 'agree-box-checked' : ''}`}>
            {agreed ? <Text className='agree-check'>✓</Text> : null}
          </View>
          <Text className='agree-text'>
            我已阅读并同意
            <Text
              className='agree-link'
              onClick={e => { e.stopPropagation(); openLegal('terms') }}
            >《用户协议》</Text>
            和
            <Text
              className='agree-link'
              onClick={e => { e.stopPropagation(); openLegal('privacy') }}
            >《隐私政策》</Text>
          </Text>
        </View>
      </View>
    </View>
  )
}
