/**
 * components/InlineError.tsx —— 结构化错误展示（带动作按钮）
 *
 * 不再是一行红字：按 RunError 渲染说明 + 可执行动作（打开设置 / 重试 / 授权）。
 */
import { browser } from 'wxt/browser'
import type { RunError } from '@/core/runErrors'

export function InlineError({ error, onRetry }: { error: RunError; onRetry?: () => void }) {
  const action = error.action

  return (
    <div className="wa-inline-error" role="alert">
      <p className="wa-inline-error-msg">{error.message}</p>
      {action?.type === 'retry' && onRetry && (
        <button type="button" className="wa-btn" onClick={onRetry}>
          {action.label}
        </button>
      )}
      {(action?.type === 'open-settings' || action?.type === 'request-permission') && (
        <button type="button" className="wa-btn" onClick={() => browser.runtime.openOptionsPage()}>
          {action.type === 'request-permission' ? `${action.label}（在设置中授权）` : action.label}
        </button>
      )}
    </div>
  )
}
