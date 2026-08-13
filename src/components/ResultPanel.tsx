/**
 * components/ResultPanel.tsx —— 结果面板（Renderer 层核心）
 *
 * 状态机：ask（提问输入）→ streaming（流式输出）→ done | error
 * 支持：流式光标、复制、重试、停止、关闭、Esc 关闭。
 *
 * 注意：面板不直接持有 Port/网络状态，所有行为都通过回调上抛，
 * 由 content.ts 统一管理 —— 这样未来做"侧边栏连续问答"时
 * 可以把整个面板平移过去复用。
 */
import { useEffect, useRef, useState } from 'react'
import type { Action } from '@/core/types'
import { Markdown } from './markdown'

export type PanelStatus = 'ask' | 'streaming' | 'done' | 'error'

export interface PanelState {
  action: Action
  status: PanelStatus
  /** 已累计的流式文本 */
  text: string
  error: string | null
  /** Ask 的输入问题（提交后保留，重试用） */
  question: string
  /** 结果来源：本地词库命中 还是 AI 生成（收藏时记录） */
  source: 'dictionary' | 'ai'
}

interface ResultPanelProps {
  panel: PanelState
  x: number
  y: number
  /** 面板最大高度（下方空间不足时内部滚动） */
  maxHeight: number
  onAskSubmit: (question: string) => void
  onRetry: () => void
  onAbort: () => void
  onClose: () => void
  /** 当前结果是否已收藏 */
  isFavorite: boolean
  onToggleFavorite: () => void
  /** 是否显示收藏按钮（PDF 阅读器暂不支持收藏） */
  showFavorite?: boolean
}

const ICON = {
  copy: 'M8 8h12v12H8zM4 16V4h12',
  check: 'M4 12l5 5L20 6',
  retry: 'M3 12a9 9 0 109-9 9 9 0 00-6.7 3L3 9m0-5v5h5',
  stop: 'M6 6h12v12H6z',
  close: 'M6 6l12 12M18 6L6 18',
  heart: 'M12 21s-7.5-4.7-10-9.3C.6 8.6 2.7 5 6 5c2 0 3.4 1.1 4 2.2C10.6 6.1 12 5 14 5c3.3 0 5.4 3.6 4 6.7C19.5 16.3 12 21 12 21z',
}

export function ResultPanel({ panel, x, y, maxHeight, onAskSubmit, onRetry, onAbort, onClose, isFavorite, onToggleFavorite, showFavorite = true }: ResultPanelProps) {
  const [question, setQuestion] = useState('')
  const [copied, setCopied] = useState(false)
  const [favPulse, setFavPulse] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)

  const { action, status, text, error } = panel

  // 流式渲染时自动跟随滚动（用户手动滚动过则停止跟随）
  useEffect(() => {
    const el = bodyRef.current
    if (el && status === 'streaming' && !userScrolledRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [text, status])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板权限被拒时静默失败 */
    }
  }

  const streaming = status === 'streaming'

  return (
    <div
      className="wa-panel"
      style={{ left: x, top: y, maxHeight }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="wa-panel-header">
        <div className="wa-panel-title">
          {action.name}
          {streaming && <span className="wa-badge">生成中</span>}
        </div>
      </div>

      <div
        className="wa-panel-body"
        ref={bodyRef}
        onWheel={() => (userScrolledRef.current = true)}
        onScroll={() => {
          const el = bodyRef.current
          if (el && el.scrollTop + el.clientHeight < el.scrollHeight - 20) {
            userScrolledRef.current = true
          }
        }}
      >
        {status === 'ask' && (
          <form
            className="wa-ask-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (question.trim()) onAskSubmit(question.trim())
            }}
          >
            <textarea
              autoFocus
              placeholder="输入你想问的问题…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="wa-btn primary" disabled={!question.trim()}>
                发送
              </button>
            </div>
          </form>
        )}

        {status === 'error' && error && <div className="wa-error">{error}</div>}

        {status !== 'ask' && text.length === 0 && status !== 'error' && (
          <div className="wa-empty">等待回复…</div>
        )}

        {status !== 'ask' && text.length > 0 && (
          <div className="wa-md">
            <Markdown text={text} />
            {streaming && <span className="wa-cursor" />}
          </div>
        )}
      </div>

      <div className="wa-panel-footer">
        {streaming ? (
          <button type="button" className="wa-btn" onClick={onAbort}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d={ICON.stop} />
            </svg>
            停止
          </button>
        ) : (
          <>
            {(status === 'done' || status === 'error') && text && (
              <button type="button" className="wa-btn" onClick={onRetry}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICON.retry} />
                </svg>
                重试
              </button>
            )}
            {status === 'done' && text && (
              <>
                {showFavorite && (
                  <button
                    type="button"
                    className={`wa-btn wa-fav ${isFavorite ? 'active' : ''}`}
                    onClick={() => {
                      onToggleFavorite()
                      setFavPulse(true)
                      setTimeout(() => setFavPulse(false), 400)
                    }}
                  >
                    <svg
                      className={favPulse ? 'wa-fav-pulse' : ''}
                      viewBox="0 0 24 24"
                      fill={isFavorite ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={ICON.heart} />
                    </svg>
                    {isFavorite ? '已收藏' : '收藏'}
                  </button>
                )}
                <button type="button" className="wa-btn" onClick={copy}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d={copied ? ICON.check : ICON.copy} />
                  </svg>
                  {copied ? '已复制' : '复制'}
                </button>
              </>
            )}
          </>
        )}
        <button type="button" className="wa-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d={ICON.close} />
          </svg>
          关闭
        </button>
      </div>
    </div>
  )
}
