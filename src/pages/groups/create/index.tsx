import { useState } from 'react'
import { View, Text, Input, Button, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { createGroup } from '../../../services/groupService'
import { authStore } from '../../../store'
import { ALL_CURRENCIES, currencyName } from '../../../utils/format'
import type { CurrencyCode } from '../../../utils/format'
import './index.css'

export default function CreateGroupPage() {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('CNY')
  const [loading, setLoading] = useState(false)

  const currencyIndex = ALL_CURRENCIES.indexOf(currency)

  async function handleCreate() {
    if (!name.trim()) {
      Taro.showToast({ title: '请输入群组名称', icon: 'none' })
      return
    }
    const user = authStore.currentUser
    if (!user) return

    setLoading(true)
    try {
      await createGroup(name.trim(), currency, user)
      Taro.navigateBack()
    } catch (e: any) {
      Taro.showToast({ title: e.message ?? '创建失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='create-container'>
      <View className='form-section'>
        <Text className='section-title'>群组信息</Text>

        <View className='form-item'>
          <Text className='form-label'>群组名称</Text>
          <Input
            className='form-input'
            placeholder='如：2026 东南亚旅行'
            value={name}
            onInput={e => setName(e.detail.value)}
            maxlength={30}
          />
        </View>

        <View className='form-item'>
          <Text className='form-label'>默认货币</Text>
          <Picker
            mode='selector'
            range={ALL_CURRENCIES.map(c => `${c}  ${currencyName(c)}`)}
            value={currencyIndex}
            onChange={e => setCurrency(ALL_CURRENCIES[Number(e.detail.value)])}
          >
            <View className='picker-value'>
              <Text>{currency}  {currencyName(currency)}</Text>
              <Text className='picker-arrow'>›</Text>
            </View>
          </Picker>
        </View>
      </View>

      <View className='create-footer'>
        <Button
          className='btn-create'
          loading={loading}
          disabled={!name.trim() || loading}
          onClick={handleCreate}
        >
          创建群组
        </Button>
      </View>
    </View>
  )
}
