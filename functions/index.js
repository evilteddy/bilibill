const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

initializeApp()

// 小程序 AppSecret 通过 Firebase Secret 注入，切勿硬编码
const WECHAT_APP_SECRET = defineSecret('WECHAT_APP_SECRET')
const WECHAT_APP_ID = 'wxf8ae489254c13326'

// OpenAI Key 同样通过 Secret 注入
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')
const OPENAI_MODEL = 'gpt-4o-mini'

// wx.login() 的 code → openid → Firebase Custom Token
exports.exchangeWeChatMiniAppCode = onCall(
  { region: 'asia-east1', secrets: [WECHAT_APP_SECRET] },
  async (request) => {
    const code = request.data?.code
    if (!code) {
      throw new HttpsError('invalid-argument', '缺少 code 参数')
    }

    const params = new URLSearchParams({
      appid: WECHAT_APP_ID,
      secret: WECHAT_APP_SECRET.value(),
      js_code: code,
      grant_type: 'authorization_code',
    })
    const resp = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`
    )
    const result = await resp.json()

    if (result.errcode) {
      throw new HttpsError(
        'unauthenticated',
        `微信登录失败: ${result.errmsg} (${result.errcode})`
      )
    }
    if (!result.openid) {
      throw new HttpsError('internal', '微信未返回 openid')
    }

    const uid = `wechat:${result.openid}`
    const claims = { wechatOpenID: result.openid }
    if (result.unionid) claims.wechatUnionID = result.unionid

    const firebaseToken = await getAuth().createCustomToken(uid, claims)
    return { firebaseToken }
  }
)

// ─── 账单识别（OpenAI 视觉，代理调用，避免在客户端暴露 Key 与域名/网络问题） ───

const ALLOWED_CURRENCIES = [
  'CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'SGD',
  'KRW', 'AUD', 'CAD', 'TWD', 'THB', 'MYR', 'VND',
]

const FORMAT_EXAMPLE = `{
  "items": [
    { "name": "商品名称", "quantity": 2, "unitPrice": 15.50, "totalPrice": 31.00 }
  ],
  "totalAmount": 68.50,
  "currency": "CNY"
}`

const SYSTEM_PROMPT = `你是一个账单识别助手。分析图片中的账单，提取所有商品条目。
只返回 JSON，不要有任何额外说明文字或 markdown 代码块。

返回格式：
${FORMAT_EXAMPLE}

规则：
- 金额以元为单位，保留最多 2 位小数
- currency 只能是以下之一：${ALLOWED_CURRENCIES.join(' ')}
- 无法判断货币时默认使用 CNY
- items 不得为空数组
- totalAmount 应等于所有 totalPrice 之和（如账单有总计行以账单为准）`

function extractJson(text) {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) return JSON.parse(codeBlockMatch[1].trim())
  const braceMatch = text.match(/(\{[\s\S]*\})/)
  if (braceMatch) return JSON.parse(braceMatch[1].trim())
  return JSON.parse(text.trim())
}

function isValidOcrResult(d) {
  if (!d || typeof d !== 'object') return false
  if (!Array.isArray(d.items) || d.items.length === 0) return false
  for (const it of d.items) {
    if (!it || typeof it !== 'object') return false
    if (typeof it.name !== 'string' || it.name.trim() === '') return false
    if (typeof it.quantity !== 'number' || it.quantity <= 0) return false
    if (typeof it.unitPrice !== 'number' || it.unitPrice < 0) return false
    if (typeof it.totalPrice !== 'number' || it.totalPrice < 0) return false
  }
  if (typeof d.totalAmount !== 'number' || d.totalAmount <= 0) return false
  if (typeof d.currency !== 'string') return false
  if (!ALLOWED_CURRENCIES.includes(d.currency)) return false
  return true
}

function buildFormatError(d) {
  if (!d || typeof d !== 'object') return '返回值不是对象'
  if (!Array.isArray(d.items)) return 'items 字段缺失或不是数组'
  if (d.items.length === 0) return 'items 数组为空'
  for (let i = 0; i < d.items.length; i++) {
    const it = d.items[i]
    if (typeof it.name !== 'string' || it.name.trim() === '') return `items[${i}].name 缺失或为空`
    if (typeof it.quantity !== 'number' || it.quantity <= 0) return `items[${i}].quantity 不是正数`
    if (typeof it.unitPrice !== 'number' || it.unitPrice < 0) return `items[${i}].unitPrice 不是非负数`
    if (typeof it.totalPrice !== 'number' || it.totalPrice < 0) return `items[${i}].totalPrice 不是非负数`
  }
  if (typeof d.totalAmount !== 'number' || d.totalAmount <= 0) return 'totalAmount 不是正数'
  if (typeof d.currency !== 'string') return 'currency 字段缺失'
  if (!ALLOWED_CURRENCIES.includes(d.currency)) return `currency "${d.currency}" 不在允许的货币列表中`
  return '格式校验未通过'
}

async function callOpenAI(base64Image, retryHint) {
  const userText = retryHint
    ? `请识别这张账单。上次返回内容格式有误，请严格遵守以下 JSON 格式，不要包含多余文字：\n${FORMAT_EXAMPLE}\n错误原因：${retryHint}`
    : '请识别这张账单中的所有商品信息。'

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'high' } },
            { type: 'text', text: userText },
          ],
        },
      ],
    }),
  })

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try {
      const err = await resp.json()
      msg = err?.error?.message ?? msg
    } catch (_) { /* ignore */ }
    throw new Error(`LLM 请求失败: ${msg}`)
  }

  const data = await resp.json()
  const rawText = data?.choices?.[0]?.message?.content ?? ''
  if (!rawText) throw new Error('LLM 返回内容为空')
  return extractJson(rawText)
}

const MAX_RETRIES = 3

exports.recognizeBill = onCall(
  { region: 'asia-east1', secrets: [OPENAI_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const base64Image = request.data?.base64Image
    if (!base64Image || typeof base64Image !== 'string') {
      throw new HttpsError('invalid-argument', '缺少图片数据')
    }

    let lastError = '未知错误'
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const raw = await callOpenAI(base64Image, attempt > 0 ? lastError : undefined)
        if (isValidOcrResult(raw)) return raw
        lastError = buildFormatError(raw)
      } catch (e) {
        lastError = e?.message ?? String(e)
      }
    }
    throw new HttpsError('internal', `账单识别失败（已重试 ${MAX_RETRIES} 次）：${lastError}`)
  }
)
