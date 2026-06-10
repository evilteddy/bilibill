/**
 * OCR 账单识别服务
 *
 * 识别逻辑（提示词、OpenAI 调用、格式校验、重试）已全部移到 Cloud Function
 * `recognizeBill`（functions/index.js）。客户端只负责：
 *   1. 压缩并读取本地图片为 base64
 *   2. 调用云函数，拿到校验通过的 OcrResult
 *
 * 这样 OpenAI Key 只存在于服务端 Secret，且客户端无需把 api.openai.com 加入
 * request 合法域名（只调用 cloudfunctions 域名）。
 */

import Taro from '@tarojs/taro'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../utils/firebase'
import type { CurrencyCode } from '../utils/format'

export interface OcrLineItem {
  name: string
  quantity: number
  unitPrice: number   // 元（展示值，非分）
  totalPrice: number  // 元（展示值，非分）
}

export interface OcrResult {
  items: OcrLineItem[]
  totalAmount: number   // 元（展示值，非分）
  currency: CurrencyCode
}

/** 压缩图片以控制 base64 体积（云函数请求有大小限制） */
async function compressImage(filePath: string): Promise<string> {
  try {
    const res = await Taro.compressImage({ src: filePath, quality: 70 })
    return res.tempFilePath
  } catch {
    // 压缩失败则退回原图
    return filePath
  }
}

function imagePathToBase64(filePath: string): string {
  const fs = Taro.getFileSystemManager()
  return fs.readFileSync(filePath, 'base64') as string
}

const recognizeBillFn = httpsCallable<{ base64Image: string }, OcrResult>(
  functions,
  'recognizeBill'
)

export async function recognizeBill(imagePath: string): Promise<OcrResult> {
  const compressed = await compressImage(imagePath)
  const base64Image = imagePathToBase64(compressed)
  const result = await recognizeBillFn({ base64Image })
  return result.data
}
