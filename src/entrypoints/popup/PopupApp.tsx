/**
 * entrypoints/popup/PopupApp.tsx —— 极简 Popup
 *
 * 两种状态：
 * 1. 未配置（API Key 为空）→ Setup 流程：
 *    step 1: Base URL / API Key / Model + 「测试并保存」
 *    step 2: 成功引导
 * 2. 已配置 → 状态概览：AI 连接状态 / 默认上下文 / 关闭模式 / 完整设置入口
 *
 * 完整设置（Action 编辑、词库、收藏、导入导出）都在 Options 页。
 */
import { useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import type { ContextLevel, PanelCloseMode, ProviderSettings, PublicSettings } from '@/core/types'
import { CONTEXT_LEVEL_LABELS, PANEL_CLOSE_MODE_LABELS, defaultProviderSettings, defaultPublicSettings } from '@/core/types'
import { getProviderSettings, getPublicSettings, saveProviderSettings, savePublicSettings } from '@/core/storage'
import type { BackgroundToOptions } from '@/core/messaging'

type TestResult = Extract<BackgroundToOptions, { type: 'test-result' }>

export function PopupApp() {
  const [loaded, setLoaded] = useState(false)
  const [provider, setProvider] = useState<ProviderSettings>(defaultProviderSettings())
  const [publicSettings, setPublicSettings] = useState<PublicSettings>(defaultPublicSettings())

  const [step, setStep] = useState<1 | 2>(1)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getProviderSettings(), getPublicSettings()]).then(([p, s]) => {
      setProvider(p)
      setPublicSettings(s)
      setLoaded(true)
    })
  }, [])

  /** 是否已配置（API Key 非空） */
  const configured = provider.apiKey.trim().length > 0

  const patchProvider = (patch: Partial<ProviderSettings>) => setProvider((p) => ({ ...p, ...patch }))

  /** 核心按钮：测试 → 成功则立即保存（防"测试成功忘保存"） */
  const testAndSave = async () => {
    setTesting(true)
    setError(null)
    try {
      const res = (await browser.runtime.sendMessage({ type: 'test-provider', config: provider })) as TestResult
      if (!res.ok) {
        setError(res.message)
        return
      }
      await saveProviderSettings(provider)
      await savePublicSettings(publicSettings)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  const patchPublic = async (patch: Partial<PublicSettings>) => {
    const next = { ...publicSettings, ...patch }
    setPublicSettings(next)
    await savePublicSettings(next)
  }

  if (!loaded) return <div className="popup-loading">加载中…</div>

  return (
    <div className="popup">
      <header className="popup-header">
        <span className="popup-title">网页 AI 助手</span>
        <button type="button" className="btn small" onClick={() => browser.runtime.openOptionsPage()}>
          完整设置 ↗
        </button>
      </header>

      <div className="popup-body">
        {!configured ? (
          /* ---------------- 首次配置（Setup） ---------------- */
          step === 1 ? (
            <>
              <p className="popup-step">1 / 2 · 配置你的 AI</p>
              <label className="field">
                <span>Base URL</span>
                <input
                  type="url"
                  placeholder="https://api.openai.com/v1"
                  value={provider.baseUrl}
                  onChange={(e) => patchProvider({ baseUrl: e.target.value })}
                />
              </label>
              <label className="field">
                <span>API Key</span>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="sk-..."
                  value={provider.apiKey}
                  onChange={(e) => patchProvider({ apiKey: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Model</span>
                <input
                  type="text"
                  placeholder="gpt-4o-mini"
                  value={provider.model}
                  onChange={(e) => patchProvider({ model: e.target.value })}
                />
              </label>

              {error && <p className="popup-error">{error}</p>}

              <button
                type="button"
                className="btn primary popup-cta"
                onClick={testAndSave}
                disabled={testing || !provider.baseUrl.trim() || !provider.apiKey.trim()}
              >
                {testing ? '测试中…' : '测试并保存'}
              </button>
              <p className="popup-hint">支持 OpenAI-compatible API（DeepSeek / Moonshot / GLM / 本地 vLLM…）</p>
            </>
          ) : (
            /* ---- Setup 成功 ---------------- */
            <>
              <p className="popup-step">2 / 2 · 配置成功 🎉</p>
              <p className="popup-hint">
                现在：
                <br />1. 打开任意网页
                <br />2. 选中文字
                <br />3. 点击「翻译」或「解释」
              </p>
              <button type="button" className="btn primary popup-cta" onClick={() => window.close()}>
                开始使用
              </button>
            </>
          )
        ) : (
          /* ---------------- 已配置 · 状态概览 ---------------- */
          <>
            <div className="popup-status">
              <span className="dot on" /> AI 已连接
              <span className="popup-model">{provider.model}</span>
            </div>

            <label className="field">
              <span>默认上下文</span>
              <select
                value={publicSettings.contextLevel}
                onChange={(e) => patchPublic({ contextLevel: e.target.value as ContextLevel })}
              >
                {(Object.keys(CONTEXT_LEVEL_LABELS) as ContextLevel[]).map((l) => (
                  <option key={l} value={l}>
                    {CONTEXT_LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>结果面板</span>
              <select
                value={publicSettings.panelCloseMode}
                onChange={(e) => patchPublic({ panelCloseMode: e.target.value as PanelCloseMode })}
              >
                {(Object.keys(PANEL_CLOSE_MODE_LABELS) as PanelCloseMode[]).map((m) => (
                  <option key={m} value={m}>
                    {PANEL_CLOSE_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>

            <p className="popup-hint">选中文字即可使用</p>
          </>
        )}
      </div>
    </div>
  )
}
