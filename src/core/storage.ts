/**
 * core/storage.ts —— 设置持久化（chrome.storage.local）
 *
 * 安全边界（v0.3 起）：
 * - `public_settings`：ContextLevel/Actions/Overrides/CloseMode，Content Script 可读
 * - `provider_settings`：BaseURL/APIKey/Model/…，仅 Options/Popup 与 Service Worker 可访问
 * Content Script 只能通过 getContentContext() 读公开部分 —— 从 API 层面确保
 * API Key 永远不进入网页环境（这就是"API Key 真正隔离"的类型级保证）。
 *
 * 版本迁移：旧版单个 `settings` key 首次访问时惰性拆分为两个新 key，
 * 并写入 storage_schema_version = 2。
 */
import { browser } from 'wxt/browser'
import type {
  Action,
  CollectionEntry,
  ContextLevel,
  DictionaryEntry,
  PanelCloseMode,
  ProviderSettings,
  PublicSettings,
} from './types'
import { DEFAULT_PANEL_CLOSE_MODE, defaultProviderSettings, defaultPublicSettings } from './types'

const PUBLIC_KEY = 'public_settings'
const PROVIDER_KEY = 'provider_settings'
const SCHEMA_KEY = 'storage_schema_version'
const LEGACY_SETTINGS_KEY = 'settings'
const COLLECTIONS_KEY = 'collections'
const USER_DICTIONARY_KEY = 'user_dictionary'
/** 收藏上限：防止无限制膨胀（后续可加管理页） */
const COLLECTIONS_LIMIT = 300

/** 当前存储结构版本（未来结构再变时 +1 并写迁移逻辑） */
export const STORAGE_SCHEMA_VERSION = 2

/**
 * Content Script 可读取的"白名单"子集。
 * 故意不包含 provider（apiKey 在其中）——从 API 层面确保
 * Content Script 拿不到密钥，而不是依赖开发者自觉。
 */
export interface ContentContext {
  contextLevel: ContextLevel
  customActions: Action[]
  actionOverrides: PublicSettings['actionOverrides']
  panelCloseMode: PanelCloseMode
}

/** 供 Content Script 读取的最小上下文（不含任何密钥） */
export async function getContentContext(): Promise<ContentContext> {
  const s = await getPublicSettings()
  return {
    contextLevel: s.contextLevel,
    customActions: s.actions,
    actionOverrides: s.actionOverrides,
    panelCloseMode: s.panelCloseMode,
  }
}

/* ---------------- 公开设置（Content Script 可读） ---------------- */

/** 读取公开设置（旧数据自动迁移） */
export async function getPublicSettings(): Promise<PublicSettings> {
  await ensureMigration()
  const raw = await browser.storage.local.get(PUBLIC_KEY)
  return normalizePublicSettings(raw[PUBLIC_KEY] as Partial<PublicSettings> | undefined)
}

/** 保存公开设置 */
export async function savePublicSettings(settings: PublicSettings): Promise<void> {
  await browser.storage.local.set({ [PUBLIC_KEY]: normalizePublicSettings(settings) })
}

/* ---------------- Provider 密钥（仅 UI 与 Service Worker） ---------------- */

/** 读取 Provider 密钥配置 */
export async function getProviderSettings(): Promise<ProviderSettings> {
  await ensureMigration()
  const raw = await browser.storage.local.get(PROVIDER_KEY)
  return normalizeProviderSettings(raw[PROVIDER_KEY] as Partial<ProviderSettings> | undefined)
}

/** 保存 Provider 密钥配置 */
export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  await browser.storage.local.set({ [PROVIDER_KEY]: normalizeProviderSettings(settings) })
}

/* ---------------- 结构校验 + 兜底 ---------------- */

function normalizePublicSettings(raw: Partial<PublicSettings> | undefined): PublicSettings {
  const def = defaultPublicSettings()
  if (!raw || typeof raw !== 'object') return def
  const actions = Array.isArray(raw.actions) ? raw.actions : []
  return {
    contextLevel: ['selection', 'nearby', 'section', 'article'].includes(raw.contextLevel as string)
      ? (raw.contextLevel as ContextLevel)
      : def.contextLevel,
    actions: actions.filter((a) => a && typeof a.id === 'string' && typeof a.prompt === 'string'),
    actionOverrides:
      raw.actionOverrides && typeof raw.actionOverrides === 'object' ? raw.actionOverrides : {},
    panelCloseMode:
      raw.panelCloseMode === 'auto' || raw.panelCloseMode === 'manual'
        ? raw.panelCloseMode
        : DEFAULT_PANEL_CLOSE_MODE,
  }
}

function normalizeProviderSettings(raw: Partial<ProviderSettings> | undefined): ProviderSettings {
  const def = defaultProviderSettings()
  if (!raw || typeof raw !== 'object') return def
  return {
    baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl ? raw.baseUrl : def.baseUrl,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    model: typeof raw.model === 'string' && raw.model ? raw.model : def.model,
    temperature: typeof raw.temperature === 'number' ? raw.temperature : def.temperature,
    maxTokens: typeof raw.maxTokens === 'number' ? raw.maxTokens : def.maxTokens,
  }
}

/* ---------------- 旧版本数据迁移（惰性，首次访问触发一次） ---------------- */

let migrationDone = false

async function ensureMigration(): Promise<void> {
  if (migrationDone) return
  migrationDone = true

  const raw = await browser.storage.local.get([
    LEGACY_SETTINGS_KEY,
    PUBLIC_KEY,
    PROVIDER_KEY,
    SCHEMA_KEY,
  ])

  // 新结构已存在，无需迁移
  if (raw[PUBLIC_KEY] || raw[PROVIDER_KEY]) return
  // 无旧数据
  if (!raw[LEGACY_SETTINGS_KEY]) return

  const old = raw[LEGACY_SETTINGS_KEY] as {
    provider?: Partial<ProviderSettings>
    contextLevel?: ContextLevel
    actions?: Action[]
    actionOverrides?: PublicSettings['actionOverrides']
    panelCloseMode?: PanelCloseMode
  }

  await browser.storage.local.set({
    [PUBLIC_KEY]: normalizePublicSettings({
      contextLevel: old.contextLevel,
      actions: old.actions,
      actionOverrides: old.actionOverrides,
      panelCloseMode: old.panelCloseMode,
    }),
    [PROVIDER_KEY]: normalizeProviderSettings(old.provider),
    [SCHEMA_KEY]: STORAGE_SCHEMA_VERSION,
  })
  await browser.storage.local.remove(LEGACY_SETTINGS_KEY)
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
