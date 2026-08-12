/**
 * core/storage.ts —— 设置持久化（chrome.storage.local）
 *
 * 安全边界：API Key 只允许通过这里的 Settings 结构读写，
 * 且 Settings 只被 Options 页（写入）和 Service Worker（读取）使用。
 * Content Script 不 import 本模块 —— 这就是"API Key 不出扩展"的类型级保证。
 */
import { browser } from 'wxt/browser'
import type { Action, CollectionEntry, ContextLevel, DictionaryEntry, PanelCloseMode, Settings } from './types'
import { DEFAULT_PANEL_CLOSE_MODE, defaultSettings } from './types'

const STORAGE_KEY = 'settings'
const COLLECTIONS_KEY = 'collections'
const USER_DICTIONARY_KEY = 'user_dictionary'
/** 收藏上限：防止无限制膨胀（后续可加管理页） */
const COLLECTIONS_LIMIT = 300

/**
 * Content Script 可读取的"白名单"子集。
 * 故意不包含 provider（apiKey 在其中）——从 API 层面确保
 * Content Script 拿不到密钥，而不是依赖开发者自觉。
 */
export interface ContentContext {
  contextLevel: ContextLevel
  customActions: Action[]
  actionOverrides: Settings['actionOverrides']
  panelCloseMode: PanelCloseMode
}

/** 供 Content Script 读取的最小上下文（不含任何密钥） */
export async function getContentContext(): Promise<ContentContext> {
  const s = await getSettings()
  return {
    contextLevel: s.contextLevel,
    customActions: s.actions,
    actionOverrides: s.actionOverrides,
    panelCloseMode: s.panelCloseMode,
  }
}

/**
 * 读取设置。数据缺失/损坏时回退默认值，保证任何旧版本数据都能被安全加载。
 */
export async function getSettings(): Promise<Settings> {
  const raw = await browser.storage.local.get(STORAGE_KEY)
  const stored = raw[STORAGE_KEY] as Partial<Settings> | undefined
  return normalizeSettings(stored)
}

/** 整体保存 */
export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings })
}

/** 局部更新：只改传入的字段，其余保留 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await saveSettings(next)
  return next
}

/**
 * 结构校验 + 补默认值。
 * 团队迭代中 settings 结构会演进（比如以后加 providerType），
 * 这里做一次"最低可用结构"的兜底，避免 undefined 一路炸到 UI。
 */
function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const def = defaultSettings()
  if (!raw || typeof raw !== 'object') return def

  const provider = raw.provider ?? def.provider
  const actions = Array.isArray(raw.actions) ? raw.actions : []

  return {
    provider: {
      baseUrl: typeof provider.baseUrl === 'string' && provider.baseUrl ? provider.baseUrl : def.provider.baseUrl,
      apiKey: typeof provider.apiKey === 'string' ? provider.apiKey : '',
      model: typeof provider.model === 'string' && provider.model ? provider.model : def.provider.model,
      temperature: typeof provider.temperature === 'number' ? provider.temperature : def.provider.temperature,
      maxTokens: typeof provider.maxTokens === 'number' ? provider.maxTokens : def.provider.maxTokens,
    },
    contextLevel: ['selection', 'nearby', 'section', 'article'].includes(raw.contextLevel as string)
      ? (raw.contextLevel as Settings['contextLevel'])
      : def.contextLevel,
    actions: actions.filter((a) => a && typeof a.id === 'string' && typeof a.prompt === 'string'),
    actionOverrides:
      raw.actionOverrides && typeof raw.actionOverrides === 'object'
        ? raw.actionOverrides
        : {},
    panelCloseMode:
      raw.panelCloseMode === 'auto' || raw.panelCloseMode === 'manual'
        ? raw.panelCloseMode
        : DEFAULT_PANEL_CLOSE_MODE,
  }
}

/* ---------------- 收藏管理（Content Script 读写） ---------------- */

/** 读取全部收藏（新条目在前） */
export async function getCollections(): Promise<CollectionEntry[]> {
  const raw = await browser.storage.local.get(COLLECTIONS_KEY)
  const list = (raw[COLLECTIONS_KEY] as CollectionEntry[] | undefined) ?? []
  return Array.isArray(list) ? list : []
}

/** 保存收藏列表 */
async function saveCollections(list: CollectionEntry[]): Promise<void> {
  await browser.storage.local.set({ [COLLECTIONS_KEY]: list })
}

/**
 * 切换收藏状态：已收藏则移除（取消收藏），未收藏则新增。
 * 唯一性键 = actionId + 原文，同一原文同一操作只收藏一份。
 * @returns 切换后的收藏列表
 */
export async function toggleCollection(entry: {
  sourceText: string
  result: string
  actionId: string
  actionName: string
  source: 'dictionary' | 'ai'
}): Promise<CollectionEntry[]> {
  const list = await getCollections()
  const key = `${entry.actionId}|${entry.sourceText}`
  const existing = list.find((c) => `${c.actionId}|${c.sourceText}` === key)

  let next: CollectionEntry[]
  if (existing) {
    next = list.filter((c) => c.id !== existing.id)
  } else {
    next = [
      {
        id: crypto.randomUUID(),
        sourceText: entry.sourceText,
        result: entry.result,
        actionId: entry.actionId,
        actionName: entry.actionName,
        source: entry.source,
        createdAt: Date.now(),
      },
      ...list,
    ].slice(0, COLLECTIONS_LIMIT)
  }
  await saveCollections(next)
  return next
}

/** 查询某条结果（actionId + 原文）是否已收藏 */
export async function isCollected(actionId: string, sourceText: string): Promise<boolean> {
  const list = await getCollections()
  return list.some((c) => c.actionId === actionId && c.sourceText === sourceText)
}

/** 删除单条收藏（设置页管理用） */
export async function removeCollection(id: string): Promise<CollectionEntry[]> {
  const list = await getCollections()
  const next = list.filter((c) => c.id !== id)
  await saveCollections(next)
  return next
}

/** 整体写入收藏（导入时合并后调用） */
export async function replaceCollections(list: CollectionEntry[]): Promise<void> {
  await saveCollections(list.slice(0, COLLECTIONS_LIMIT))
}

/* ---------------- 用户词库（导入导出 / 查询用） ---------------- */

/** 校验词条结构（导入时宽容跳过非法条目） */
export function isValidDictionaryEntry(e: unknown): e is DictionaryEntry {
  if (typeof e !== 'object' || e === null) return false
  const entry = e as DictionaryEntry
  return (
    typeof entry.word === 'string' &&
    entry.word.trim().length > 0 &&
    Array.isArray(entry.meanings) &&
    entry.meanings.length > 0 &&
    entry.meanings.every((m) => m && typeof m.pos === 'string' && typeof m.meaning === 'string')
  )
}

/** 读取用户词库（不含内置词库；空/损坏时返回 []） */
export async function getUserDictionaryWords(): Promise<DictionaryEntry[]> {
  const raw = await browser.storage.local.get(USER_DICTIONARY_KEY)
  const list = raw[USER_DICTIONARY_KEY] as DictionaryEntry[] | undefined
  return Array.isArray(list) ? list.filter(isValidDictionaryEntry) : []
}

/** 写入用户词库 */
export async function setUserDictionaryWords(words: DictionaryEntry[]): Promise<void> {
  await browser.storage.local.set({ [USER_DICTIONARY_KEY]: words.filter(isValidDictionaryEntry) })
}
