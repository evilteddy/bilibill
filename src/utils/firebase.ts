import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore/lite'
import { getFunctions } from 'firebase/functions'

// TODO: 替换为你的 Firebase 项目配置
// Firebase Console → 项目设置 → 你的应用 → SDK 设置和配置
const firebaseConfig = {
  apiKey: 'AIzaSyCgUxJmbPbYySDvNp4vE1GmOJAZY5hUdSU',
  authDomain: 'bilibill.firebaseapp.com',
  projectId: 'bilibill',
  storageBucket: 'bilibill.firebasestorage.app',
  messagingSenderId: '76359969556',
  appId: '1:76359969556:ios:4f70f8d8a1cf1202777001',
}

let app: FirebaseApp
if (!getApps().length) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApps()[0]
}

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app, 'asia-east1')
export default app
