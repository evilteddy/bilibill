import { defineConfig } from '@tarojs/cli'

// 微信小程序 polyfill 内联脚本
// 注入到每个 JS chunk 顶部，保证在 Firebase 模块执行前运行
//
// 关键：必须用顶层 var 声明而非 globalThis.x = ... 赋值
// 微信小程序 V8 沙盒中，typeof fetch 走作用域链而非 globalThis，
// 只有 var 声明才能真正注入全局作用域。
const MINIAPP_POLYFILL = [
  // self
  "if(typeof self==='undefined')var self=typeof globalThis!=='undefined'?globalThis:typeof global!=='undefined'?global:{};",

  // fetch
  "if(typeof fetch==='undefined')var fetch=function(url,o){o=o||{};return new Promise(function(res,rej){var h=o.headers||{},d;if(o.body)try{d=JSON.parse(o.body)}catch(e){d=o.body}wx.request({url:url,method:(o.method||'GET').toUpperCase(),data:d,header:h,success:function(r){res({ok:r.statusCode>=200&&r.statusCode<300,status:r.statusCode,statusText:''+r.statusCode,headers:{get:function(n){var hh=r.header||{};return hh[n]||hh[n.toLowerCase()]||null},has:function(n){return n in(r.header||{})},forEach:function(cb){var hh=r.header||{};Object.keys(hh).forEach(function(k){cb(hh[k],k)})}},json:function(){return Promise.resolve(r.data)},text:function(){return Promise.resolve(typeof r.data==='string'?r.data:JSON.stringify(r.data))},clone:function(){return this}})},fail:function(e){rej(new Error(e.errMsg))}})})};",

  // Headers
  "if(typeof Headers==='undefined')var Headers=function(i){this._m=i||{}};",
  "if(typeof Headers!=='undefined'&&typeof Headers.prototype.get==='undefined'){Headers.prototype.get=function(k){return this._m&&this._m[k]||null};Headers.prototype.set=function(k,v){this._m=this._m||{};this._m[k]=v};Headers.prototype.has=function(k){return!!(this._m&&k in this._m)};Headers.prototype.append=function(k,v){this._m=this._m||{};this._m[k]=this._m[k]?this._m[k]+', '+v:v};Headers.prototype.delete=function(k){delete(this._m||{})[k]};}",

  // Response / Request
  "if(typeof Response==='undefined')var Response=function(){};",
  "if(typeof Request==='undefined')var Request=function(u){this.url=u};",

  // XMLHttpRequest
  "if(typeof XMLHttpRequest==='undefined')var XMLHttpRequest=function(){this.status=0;this.readyState=0;this._h={};this.open=function(m,u){this._m=m;this._u=u;this.readyState=1};this.setRequestHeader=function(k,v){this._h[k]=v};this.send=function(b){var s=this,d;if(b)try{d=JSON.parse(b)}catch(e){d=b}wx.request({url:s._u,method:s._m,data:d,header:s._h,success:function(r){s.status=r.statusCode;s.readyState=4;s.response=r.data;s.responseText=typeof r.data==='string'?r.data:JSON.stringify(r.data);s.onload&&s.onload();s.onreadystatechange&&s.onreadystatechange()},fail:function(e){s.onerror&&s.onerror(new Error(e.errMsg))}})};this.abort=function(){};this.getAllResponseHeaders=function(){return''};this.getResponseHeader=function(){return null};this.addEventListener=function(t,f){if(t==='load')this.onload=f;if(t==='error')this.onerror=f}};",

  // localStorage
  "if(typeof localStorage==='undefined')var localStorage={getItem:function(k){try{return wx.getStorageSync(k)||null}catch(e){return null}},setItem:function(k,v){try{wx.setStorageSync(k,v)}catch(e){}},removeItem:function(k){try{wx.removeStorageSync(k)}catch(e){}},clear:function(){try{wx.clearStorageSync()}catch(e){}}};",

  // navigator / document
  "if(typeof navigator==='undefined')var navigator={onLine:true,userAgent:'miniprogram'};",
  "if(typeof document==='undefined')var document={createElement:function(){return{}},getElementsByTagName:function(){return[]}};",
].join('\n')

export default defineConfig({
  projectName: 'bilibill-miniapp',
  date: '2026-04-01',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-framework-react'],
  defineConstants: {},
  copy: { patterns: [], options: {} },
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: false },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false },
    },
    webpackChain(chain) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const webpack = require('webpack')
      // 将 polyfill 注入到每个 JS 文件顶部（包括 vendors.js），
      // 确保在 Firebase 模块执行前 fetch/XMLHttpRequest/localStorage 已就绪
      chain.plugin('miniapp-polyfill').use(webpack.BannerPlugin, [{
        banner: MINIAPP_POLYFILL,
        raw: true,
        entryOnly: false,
        test: /\.js$/,
      }])
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: { enable: true },
    },
  },
})
