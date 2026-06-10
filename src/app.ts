import { Component, PropsWithChildren } from 'react'

// 初始化 Firebase（触发 authService 模块加载，开始监听 Auth 状态）
import './utils/firebase'
import './services/authService'

import './app.css'

class App extends Component<PropsWithChildren> {
  componentDidShow() {}
  componentDidHide() {}

  render() {
    return this.props.children
  }
}

export default App
