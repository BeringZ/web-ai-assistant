/**
 * entrypoints/popup/PopupApp.tsx —— Popup 容器
 *
 * Chrome popup 高度受限，设置内容用滚动容器承载；
 * 顶部提供"在新标签页打开完整设置"（chrome://extensions 选项页）。
 */
import { browser } from 'wxt/browser'
import { SettingsPanel } from '../options/App'

export function PopupApp() {
  return (
    <div className="popup">
      <div className="popup-header">
        <span className="popup-title">网页 AI 助手</span>
        <button
          type="button"
          className="btn small"
          onClick={() => browser.runtime.openOptionsPage()}
          title="在新标签页打开完整设置"
        >
          完整设置 ↗
        </button>
      </div>
      <div className="popup-scroll">
        <SettingsPanel />
      </div>
    </div>
  )
}
