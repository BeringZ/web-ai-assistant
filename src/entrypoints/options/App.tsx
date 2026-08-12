/**
 * entrypoints/options/App.tsx —— 设置面板（Options 页与 Popup 共用）
 *
 * 三个区块：
 *   1. AI API 配置（Base URL / API Key / Model / Temperature / Max Tokens）
 *   2. 默认上下文级别
 *   3. 操作管理：
 *      - 内置操作（翻译/解释/总结/改写/提问）：可编辑、可恢复默认
 *      - 自定义操作：新增 / 编辑 / 删除
 *
 * 编辑流程：所有改动先落在本地 state，点"保存设置"统一持久化。
 * "测试连接"直接用当前表单值调用 background（无需先保存）。
 */
import { useEffect, useRef, useState } from 'react'
import { browser } from 'wxt/browser'
import type { Action, CollectionEntry, ContextLevel, DictionaryEntry, ProviderConfig, Settings } from '@/core/types'
import { CONTEXT_LEVEL_LABELS, defaultProviderConfig } from '@/core/types'
import {
  getCollections,
  getSettings,
  getUserDictionaryWords,
  removeCollection,
  replaceCollections,
  saveSettings,
  setUserDictionaryWords,
} from '@/core/storage'
import { collectActions, createCustomAction } from '@/actions/manager'
import { BUILTIN_WORDS } from '@/dictionary'
import {
  downloadJson,
  mergeCollections,
  mergeDictionary,
  parseCollectionsImport,
  parseDictionaryImport,
} from '@/core/importExport'
import type { BackgroundToOptions } from '@/core/messaging'

type TestResult = Extract<BackgroundToOptions, { type: 'test-result' }>

export function SettingsPanel() {
  const [provider, setProvider] = useState<ProviderConfig>(defaultProviderConfig())
  const [contextLevel, setContextLevel] = useState<ContextLevel>('nearby')
  const [customActions, setCustomActions] = useState<Action[]>([])
  const [overrides, setOverrides] = useState<Settings['actionOverrides']>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  /* ---- 词库 / 收藏管理状态 ---- */
  const [userWords, setUserWords] = useState<DictionaryEntry[]>([])
  const [dictSearch, setDictSearch] = useState('')
  const [dictNotice, setDictNotice] = useState<string | null>(null)
  const [collections, setCollections] = useState<CollectionEntry[]>([])
  const [colNotice, setColNotice] = useState<string | null>(null)
  const dictFileRef = useRef<HTMLInputElement>(null)
  const colFileRef = useRef<HTMLInputElement>(null)

  /** 内置 + 用户合并后的完整词库（用于展示/导出） */
  const allWords = mergeDictionary(userWords, BUILTIN_WORDS)
  /** 内置（应用覆盖后）+ 自定义 的汇总，用于列表展示与菜单一致 */
  const allActions = collectActions(customActions, overrides)

  useEffect(() => {
    getSettings().then((s) => {
      setProvider(s.provider)
      setContextLevel(s.contextLevel)
      setCustomActions(s.actions)
      setOverrides(s.actionOverrides)
      setLoaded(true)
    })
    getUserDictionaryWords().then(setUserWords)
    getCollections().then(setCollections)
  }, [])

  const patchProvider = (patch: Partial<ProviderConfig>) =>
    setProvider((p) => ({ ...p, ...patch }))

  const save = async () => {
    setSaving(true)
    try {
      await saveSettings({ provider, contextLevel, actions: customActions, actionOverrides: overrides })
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = (await browser.runtime.sendMessage({ type: 'test-provider', config: provider })) as TestResult
      setTestResult(res)
    } catch (err) {
      setTestResult({ type: 'test-result', ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  /* ---- 操作编辑态（内置与自定义共用一套表单） ---- */
  const [editing, setEditing] = useState<{ id: string; builtin: boolean } | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [creating, setCreating] = useState(false)

  const startEdit = (id: string, builtin: boolean) => {
    const action = allActions.find((a) => a.id === id)
    if (!action) return
    setEditing({ id, builtin })
    setEditName(action.name)
    setEditPrompt(action.prompt)
  }

  const saveEdit = () => {
    if (!editName.trim() || !editPrompt.trim() || !editing) return
    if (editing.builtin) {
      // 内置操作：把编辑结果写入覆盖（不落内置代码，恢复默认 = 删覆盖）
      setOverrides((o) => ({ ...o, [editing.id]: { name: editName.trim(), prompt: editPrompt } }))
    } else {
      setCustomActions((list) =>
        list.map((a) => (a.id === editing.id ? { ...a, name: editName.trim(), prompt: editPrompt } : a)),
      )
    }
    setEditing(null)
  }

  /** 新建自定义 Action（创建模式下 editing 为 null，不能复用 saveEdit） */
  const saveCreate = () => {
    if (!editName.trim() || !editPrompt.trim()) return
    const action = createCustomAction(editName, editPrompt)
    setCustomActions((list) => [...list, action])
    setCreating(false)
    setEditName('')
    setEditPrompt('')
  }

  const resetBuiltin = (id: string) => {
    setOverrides((o) => {
      const next = { ...o }
      delete next[id]
      return next
    })
    setEditing((e) => (e?.id === id ? null : e))
  }

  const startCreate = () => {
    setCreating(true)
    setEditing(null)
    setEditName('')
    setEditPrompt('')
  }

  const removeAction = (id: string) =>
    setCustomActions((list) => list.filter((a) => a.id !== id))

  /* ---- 词库导入导出 ---- */

  const exportDictionary = () => {
    downloadJson('web-ai-dictionary.json', {
      type: 'web-ai-dictionary',
      version: 1,
      words: allWords,
    })
  }

  const handleDictImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    try {
      const text = await file.text()
      const { items, skipped } = parseDictionaryImport(text)
      const merged = mergeDictionary(userWords, items)
      await setUserDictionaryWords(merged)
      setUserWords(merged)
      setDictNotice(`已导入 ${items.length} 条${skipped ? `，跳过 ${skipped} 条非法条目` : ''}`)
    } catch (err) {
      setDictNotice(err instanceof Error ? err.message : String(err))
    }
  }

  /* ---- 收藏导入导出 ---- */

  const exportCollections = () => {
    downloadJson('web-ai-collections.json', {
      type: 'web-ai-collections',
      version: 1,
      items: collections,
    })
  }

  const handleColImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const { items, skipped } = parseCollectionsImport(text)
      const merged = mergeCollections(collections, items)
      await replaceCollections(merged)
      setCollections(merged)
      setColNotice(`已导入 ${items.length} 条${skipped ? `，跳过 ${skipped} 条非法条目` : ''}`)
    } catch (err) {
      setColNotice(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemoveCollection = async (id: string) => {
    const next = await removeCollection(id)
    setCollections(next)
  }

  if (!loaded) return <div className="panel-loading">加载中…</div>

  return (
    <>
      {/* ---------------- API 配置 ---------------- */}
      <section className="card">
        <h2>AI API 配置</h2>
        <p className="hint">支持任意 OpenAI-compatible 端点（OpenAI / DeepSeek / Moonshot / GLM / 本地 vLLM…）。密钥仅保存在本机扩展存储中。</p>

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

        <div className="row">
          <label className="field grow">
            <span>Model</span>
            <input
              type="text"
              placeholder="gpt-4o-mini"
              value={provider.model}
              onChange={(e) => patchProvider({ model: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Max Tokens</span>
            <input
              type="number"
              min={64}
              max={128000}
              step={64}
              value={provider.maxTokens}
              onChange={(e) => patchProvider({ maxTokens: Math.max(64, Number(e.target.value) || 64) })}
            />
          </label>
        </div>

        <label className="field">
          <span className="range-label">
            Temperature <em>{provider.temperature.toFixed(1)}</em>
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={provider.temperature}
            onChange={(e) => patchProvider({ temperature: Number(e.target.value) })}
          />
        </label>

        <div className="actions">
          <button type="button" className="btn" onClick={test} disabled={testing}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={saving}>
            {saved ? '✓ 已保存' : saving ? '保存中…' : '保存设置'}
          </button>
        </div>
        {testResult && (
          <p className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}>{testResult.message}</p>
        )}
      </section>

      {/* ---------------- 上下文级别 ---------------- */}
      <section className="card">
        <h2>默认上下文</h2>
        <p className="hint">发送给 AI 的内容范围。选"附近文字"在省 Token 和效果之间最均衡。</p>
        <div className="radio-group">
          {(Object.keys(CONTEXT_LEVEL_LABELS) as ContextLevel[]).map((level) => (
            <label key={level} className="radio">
              <input
                type="radio"
                name="contextLevel"
                checked={contextLevel === level}
                onChange={() => setContextLevel(level)}
              />
              <span>{CONTEXT_LEVEL_LABELS[level]}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ---------------- 操作管理 ---------------- */}
      <section className="card">
        <div className="section-head">
          <h2>操作管理</h2>
          <button type="button" className="btn small" onClick={startCreate}>
            + 新增自定义
          </button>
        </div>
        <p className="hint">
          操作 = Prompt 模板，支持变量 {'{{selection}}'}（选中内容）、{'{{context}}'}（上下文）、
          {'{{url}}'}、{'{{title}}'}、{'{{question}}'}（提问）。内置操作可编辑，恢复默认即还原。
        </p>

        {creating && (
          <div className="edit-form">
            <label className="field">
              <span>名称</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="例如：分析投资含义" />
            </label>
            <label className="field">
              <span>Prompt 模板</span>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder={'请分析下面的内容对投资的含义，{{selection}}'}
                rows={4}
              />
            </label>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setCreating(false)}>取消</button>
              <button type="button" className="btn primary" onClick={saveCreate} disabled={!editName.trim() || !editPrompt.trim()}>
                添加
              </button>
            </div>
          </div>
        )}

        {/* 内置操作 */}
        <ul className="action-list">
          {allActions
            .filter((a) => a.builtin)
            .map((action) =>
              editing?.id === action.id && editing.builtin ? (
                <li key={action.id} className="edit-form">
                  <div className="builtin-tag">内置</div>
                  <label className="field">
                    <span>名称</span>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Prompt 模板</span>
                    <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={4} />
                  </label>
                  <div className="actions">
                    <button type="button" className="btn" onClick={() => resetBuiltin(action.id)}>恢复默认</button>
                    <button type="button" className="btn" onClick={() => setEditing(null)}>取消</button>
                    <button type="button" className="btn primary" onClick={saveEdit} disabled={!editName.trim() || !editPrompt.trim()}>
                      保存
                    </button>
                  </div>
                </li>
              ) : (
                <li key={action.id} className="action-item">
                  <div className="action-info">
                    <span className="action-name">
                      {action.name}
                      <span className={`badge ${overrides[action.id] ? 'badge-changed' : ''}`}>
                        {overrides[action.id] ? '已修改' : '内置'}
                      </span>
                    </span>
                    <code className="action-prompt">{action.prompt.replace(/\s+/g, ' ').slice(0, 70)}{action.prompt.length > 70 ? '…' : ''}</code>
                  </div>
                  <div className="action-btns">
                    <button type="button" className="btn small" onClick={() => startEdit(action.id, true)}>编辑</button>
                    {overrides[action.id] && (
                      <button type="button" className="btn small" onClick={() => resetBuiltin(action.id)}>恢复默认</button>
                    )}
                  </div>
                </li>
              ),
            )}
        </ul>

        {/* 自定义操作 */}
        {customActions.length > 0 && <h3 className="sub-head">自定义</h3>}
        <ul className="action-list">
          {customActions.map((action) =>
            editing?.id === action.id && !editing.builtin ? (
              <li key={action.id} className="edit-form">
                <label className="field">
                  <span>名称</span>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </label>
                <label className="field">
                  <span>Prompt 模板</span>
                  <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={4} />
                </label>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => setEditing(null)}>取消</button>
                  <button type="button" className="btn primary" onClick={saveEdit} disabled={!editName.trim() || !editPrompt.trim()}>
                    保存
                  </button>
                </div>
              </li>
            ) : (
              <li key={action.id} className="action-item">
                <div className="action-info">
                  <span className="action-name">
                    {action.name}
                    <span className="badge">自定义</span>
                  </span>
                  <code className="action-prompt">{action.prompt.replace(/\s+/g, ' ').slice(0, 70)}{action.prompt.length > 70 ? '…' : ''}</code>
                </div>
                <div className="action-btns">
                  <button type="button" className="btn small" onClick={() => startEdit(action.id, false)}>编辑</button>
                  <button type="button" className="btn small danger" onClick={() => removeAction(action.id)}>删除</button>
                </div>
              </li>
            ),
          )}
        </ul>

        {customActions.length === 0 && !creating && (
          <p className="empty">还没有自定义操作。示例：分析投资含义、解释代码、提取知识点、生成 Anki…</p>
        )}

        <div className="actions sticky-save">
          <button type="button" className="btn primary" onClick={save} disabled={saving}>
            {saved ? '✓ 已保存' : saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </section>

      {/* ---------------- 本地词库 ---------------- */}
      <section className="card">
        <div className="section-head">
          <h2>本地词库</h2>
          <div className="toolbar">
            <button type="button" className="btn small" onClick={exportDictionary}>导出词库</button>
            <button type="button" className="btn small" onClick={() => dictFileRef.current?.click()}>导入词库</button>
            <input
              ref={dictFileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleDictImport}
            />
          </div>
        </div>
        <p className="hint">
          翻译单个英文词时优先查本地词库（命中直接输出，不耗 Token）。内置 {BUILTIN_WORDS.length} 词 +
          自定义 {userWords.length} 词；导入的词条可覆盖内置释义，导出的 JSON 可备份或迁移到其他设备。
        </p>

        <input
          className="search"
          type="text"
          placeholder="搜索单词或释义…"
          value={dictSearch}
          onChange={(e) => setDictSearch(e.target.value)}
        />

        {dictNotice && <p className={`test-result ${dictNotice.includes('失败') ? 'fail' : 'ok'}`}>{dictNotice}</p>}

        <ul className="dict-list">
          {[...(dictSearch.trim()
            ? allWords.filter((w) => {
                const q = dictSearch.trim().toLowerCase()
                return (
                  w.word.toLowerCase().includes(q) ||
                  w.meanings.some((m) => m.meaning.toLowerCase().includes(q))
                )
              })
            : allWords
          )]
            .sort((a, b) => a.word.localeCompare(b.word))
            .map((w) => (
            <li key={w.word.toLowerCase()} className="dict-item">
              <span className="dict-word">{w.word}</span>
              {w.phonetic && <span className="dict-phonetic">/{w.phonetic}/</span>}
              <span className="dict-meaning">{w.meanings.map((m) => `${m.pos} ${m.meaning}`).join('；')}</span>
              {userWords.some((u) => u.word.toLowerCase() === w.word.toLowerCase()) && (
                <span className="badge">自定义</span>
              )}
            </li>
          ))}
        </ul>
        {allWords.length === 0 && <p className="empty">词库为空</p>}
      </section>

      {/* ---------------- 收藏 ---------------- */}
      <section className="card">
        <div className="section-head">
          <h2>收藏</h2>
          <div className="toolbar">
            <button type="button" className="btn small" onClick={exportCollections}>导出收藏</button>
            <button type="button" className="btn small" onClick={() => colFileRef.current?.click()}>导入收藏</button>
            <input
              ref={colFileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleColImport}
            />
          </div>
        </div>
        <p className="hint">
          结果面板点「收藏」的内容保存在这里，共 {collections.length} 条。
          导入会按条目 id 去重合并，不会清空现有数据。
        </p>

        {colNotice && <p className={`test-result ${colNotice.includes('失败') ? 'fail' : 'ok'}`}>{colNotice}</p>}

        {collections.length === 0 ? (
          <p className="empty">还没有收藏。翻译结果出来后点结果框里的「收藏」即可。</p>
        ) : (
          <ul className="col-list">
            {collections.map((c) => (
              <li key={c.id} className="col-item">
                <div className="col-info">
                  <span className="col-source">{c.sourceText.length > 60 ? `${c.sourceText.slice(0, 60)}…` : c.sourceText}</span>
                  <span className="col-meta">
                    <span className="badge">{c.actionName}</span>
                    <span className={`badge ${c.source === 'dictionary' ? 'badge-dict' : ''}`}>
                      {c.source === 'dictionary' ? '词库' : 'AI'}
                    </span>
                    <span className="col-time">{new Date(c.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </span>
                </div>
                <button type="button" className="btn small danger" onClick={() => handleRemoveCollection(c.id)}>删除</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/** Options 页壳（完整页面） */
export function OptionsApp() {
  return (
    <div className="page">
      <header className="header">
        <h1>网页 AI 助手</h1>
        <p className="sub">选中即问：翻译、解释、总结、改写 —— 接入你自己的 AI API</p>
      </header>
      <SettingsPanel />
    </div>
  )
}
