/**
 * entrypoints/popup/main.tsx —— 点击插件图标弹出的设置界面
 *
 * 与 Options 页共用 SettingsPanel，仅在顶部加了个"打开完整设置"入口。
 */
import { createRoot } from 'react-dom/client'
import { PopupApp } from './PopupApp'
import '../options/options.css'
import './popup.css'

createRoot(document.getElementById('root')!).render(<PopupApp />)
