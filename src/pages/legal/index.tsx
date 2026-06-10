import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { getLegalDoc, type LegalDoc } from './content'
import './index.css'

export default function LegalPage() {
  const router = useRouter()
  const type = (router.params.type as string) ?? 'terms'
  const [doc, setDoc] = useState<LegalDoc>(getLegalDoc(type))

  useEffect(() => {
    const d = getLegalDoc(type)
    setDoc(d)
    Taro.setNavigationBarTitle({ title: d.title })
  }, [type])

  return (
    <ScrollView scrollY className='legal-container'>
      <View className='legal-header'>
        <Text className='legal-title'>{doc.title}</Text>
        <Text className='legal-updated'>最后更新：{doc.lastUpdated}</Text>
      </View>

      <Text className='legal-intro'>{doc.intro}</Text>

      {doc.sections.map((section, i) => (
        <View key={i} className='legal-section'>
          {section.heading && (
            <Text className='legal-section-heading'>{section.heading}</Text>
          )}
          {section.paragraphs.map((p, j) => (
            <Text key={j} className='legal-paragraph'>{p}</Text>
          ))}
        </View>
      ))}

      <View className='legal-footer-spacer' />
    </ScrollView>
  )
}
