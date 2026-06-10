/**
 * 微信小程序环境 polyfill
 * 必须在 Firebase 初始化之前引入
 *
 * Firebase v10 在初始化时会执行 fetch.bind(self)，
 * 小程序没有 fetch / self / XMLHttpRequest / localStorage，
 * 会抛出 "Cannot read property 'bind' of undefined"
 */

const g = globalThis as any

// ─── self ─────────────────────────────────────────────────
if (typeof g.self === 'undefined') {
  g.self = g
}

// ─── fetch ────────────────────────────────────────────────
if (typeof g.fetch === 'undefined') {
  g.fetch = function (url: string, options: RequestInit = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
      const method = ((options.method as string) || 'GET').toUpperCase()

      // 处理 headers
      const header: Record<string, string> = {}
      if (options.headers) {
        const h = options.headers as Record<string, string>
        Object.keys(h).forEach(k => { header[k] = h[k] })
      }

      // 处理 body
      let data: any = undefined
      if (options.body) {
        try {
          data = JSON.parse(options.body as string)
        } catch {
          data = options.body
        }
      }

      wx.request({
        url,
        method: method as any,
        data,
        header,
        success(res) {
          const body = typeof res.data === 'string'
            ? res.data
            : JSON.stringify(res.data)

          const headersMap: Record<string, string> = (res.header as any) || {}

          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: String(res.statusCode),
            headers: {
              get: (name: string) => headersMap[name] ?? headersMap[name.toLowerCase()] ?? null,
              has: (name: string) => name in headersMap,
              forEach: (cb: (v: string, k: string) => void) => {
                Object.entries(headersMap).forEach(([k, v]) => cb(v, k))
              },
            },
            json: () => Promise.resolve(
              typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            ),
            text: () => Promise.resolve(body),
            clone() { return this },
          } as any)
        },
        fail(err) {
          reject(new Error(err.errMsg || 'network error'))
        },
      })
    })
  }

  // Firebase 内部会调用 fetch.bind(self)，需要 Headers / Response 构造函数占位
  if (typeof g.Headers === 'undefined') {
    g.Headers = class Headers {
      private _map: Record<string, string> = {}
      constructor(init?: Record<string, string>) {
        if (init) Object.assign(this._map, init)
      }
      get(name: string) { return this._map[name] ?? null }
      set(name: string, value: string) { this._map[name] = value }
      has(name: string) { return name in this._map }
    }
  }

  if (typeof g.Request === 'undefined') {
    g.Request = class Request {
      url: string
      constructor(url: string) { this.url = url }
    }
  }

  if (typeof g.Response === 'undefined') {
    g.Response = class Response {}
  }
}

// ─── XMLHttpRequest（Firestore WebChannel 依赖） ───────────
if (typeof g.XMLHttpRequest === 'undefined') {
  g.XMLHttpRequest = class XMLHttpRequest {
    status = 0
    statusText = ''
    responseText = ''
    response: any = null
    readyState = 0
    onreadystatechange: (() => void) | null = null
    onload: (() => void) | null = null
    onerror: ((e: any) => void) | null = null

    private _method = 'GET'
    private _url = ''
    private _headers: Record<string, string> = {}

    open(method: string, url: string) {
      this._method = method
      this._url = url
      this.readyState = 1
    }

    setRequestHeader(key: string, value: string) {
      this._headers[key] = value
    }

    send(body?: any) {
      const self = this
      let data: any = undefined
      if (body) {
        try { data = JSON.parse(body) } catch { data = body }
      }
      wx.request({
        url: self._url,
        method: self._method as any,
        data,
        header: self._headers,
        success(res) {
          self.status = res.statusCode
          self.readyState = 4
          self.response = res.data
          self.responseText = typeof res.data === 'string'
            ? res.data
            : JSON.stringify(res.data)
          self.onload?.()
          self.onreadystatechange?.()
        },
        fail(err) {
          self.onerror?.(new Error(err.errMsg))
        },
      })
    }

    abort() {}
    getAllResponseHeaders() { return '' }
    getResponseHeader() { return null }
    addEventListener(type: string, fn: () => void) {
      if (type === 'load') this.onload = fn
      if (type === 'error') this.onerror = fn as any
    }
  }
}

// ─── localStorage（Firebase Auth 持久化） ─────────────────
if (typeof g.localStorage === 'undefined') {
  g.localStorage = {
    getItem(key: string): string | null {
      try { return wx.getStorageSync(key) || null } catch { return null }
    },
    setItem(key: string, value: string) {
      try { wx.setStorageSync(key, value) } catch {}
    },
    removeItem(key: string) {
      try { wx.removeStorageSync(key) } catch {}
    },
    clear() {
      try { wx.clearStorageSync() } catch {}
    },
  }
}

// ─── navigator（Firebase 网络状态检测） ───────────────────
if (typeof g.navigator === 'undefined') {
  g.navigator = { onLine: true, userAgent: 'miniprogram' }
}

// ─── document（Firebase Auth 某些路径会判断 document） ────
if (typeof g.document === 'undefined') {
  g.document = {
    createElement: () => ({}),
    getElementsByTagName: () => [],
  }
}
