/**
 * core/types.ts —— 领域模型
 *
 * 整个插件的类型契约都定义在这里，四个核心概念：
 *   Selection（选中内容） / Action（Prompt 模板） / Provider（AI 提供商） / Renderer（渲染器）
 *
 * 设计原则：类型是模块之间的"合同"。改动类型 = 改动合同，
 * 因此这里必须是最稳定、最精简的一层。
 */

/** 上下文级别：发送给 AI 的内容范围 */
export type ContextLevel = 'selection' | 'nearby' | 'section' | 'article'

/** 上下文级别的中文名（用于设置页展示） */
export const CONTEXT_LEVEL_LABELS: Record<ContextLevel, string> = {
  selection: '仅选中内容',
  nearby: '附近文字',
  section: '当前章节',
  article: '整篇文章',
}

/**
 * Action —— 一个 Prompt 模板。
 *
 * 关键设计：不要把功能写死。任何"操作"（翻译/解释/总结/改写/分析…）
 * 本质都是一段模板 + 参数。新增功能 = 新增 Action，不动插件代码。
 *
 * 模板变量：
 *   {{selection}}  选中内容
 *   {{context}}    上下文（由 ContextLevel 决定）
 *   {{url}}        页面地址
 *   {{title}}      页面标题
 *   {{question}}   仅 Ask Action 使用（用户在输入框里提的问题）
 */
export interface Action {
  /** 稳定唯一 id；内置 action 固定为 'translate' 等，自定义用随机 uuid */
  id: string
  /** 菜单上显示的名字，如 "翻译" */
  name: string
  /** Prompt 模板，支持 {{变量}} 插值 */
  prompt: string
  /** 内置 action 不可编辑/删除 */
  builtin: boolean
}

/** AI Provider 配置（仅存于扩展本地 storage，由 Service Worker 使用） */
export interface ProviderConfig {
  /** OpenAI-compatible Base URL，如 https://api.openai.com/v1 */
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

/** 内置 Action 的可编辑覆盖（只存被用户改过的字段，未覆盖的保持默认） */
export type ActionOverride = Partial<Pick<Action, 'name' | 'prompt'>>

/** 结果面板关闭方式：手动点关闭按钮 / 点击面板外部自动关闭 */
export type PanelCloseMode = 'manual' | 'auto'

/**
 * 公开设置：Content Script 可以读取的部分（不含任何密钥）。
 * 存 storage 的 `public_settings` key。
 */
export interface PublicSettings {
  /** 默认上下文级别 */
  contextLevel: ContextLevel
  /** 自定义 Actions（内置 action 由代码提供，不落存储） */
  actions: Action[]
  /** 内置 Action 的覆盖（id → 覆盖字段）；恢复默认 = 删除对应 key */
  actionOverrides: Record<string, ActionOverride>
  /** 结果面板关闭方式 */
  panelCloseMode: PanelCloseMode
}

/**
 * Provider 密钥配置：仅 Options/Popup 与 Service Worker 可访问。
 * 存 storage 的 `provider_settings` key；Content Script 不 import 其读取方法。
 */
export type ProviderSettings = ProviderConfig

export const DEFAULT_CONTEXT_LEVEL: ContextLevel = 'nearby'
export const DEFAULT_PANEL_CLOSE_MODE: PanelCloseMode = 'manual'

export const PANEL_CLOSE_MODE_LABELS: Record<PanelCloseMode, string> = {
  manual: '手动关闭',
  auto: '自动关闭（点击输出框外）',
}

export function defaultProviderSettings(): ProviderSettings {
  return {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048,
  }
}

export function defaultPublicSettings(): PublicSettings {
  return {
    contextLevel: DEFAULT_CONTEXT_LEVEL,
    actions: [],
    actionOverrides: {},
    panelCloseMode: DEFAULT_PANEL_CLOSE_MODE,
  }
}

/** 选中内容载荷：Content Script 组装后交给 Service Worker */
export interface SelectionPayload {
  /** 用户选中的原始文本 */
  text: string
  /** 按 ContextLevel 提取的上下文文本 */
  context: string
  url: string
  title: string
}

/** 一次 AI 运行请求 */
export interface RunRequest {
  actionId: string
  payload: SelectionPayload
  /** Ask Action 的用户输入问题 */
  question?: string
  /** 为 true 时绕过翻译缓存强制重新生成（用户点"重试"） */
  forceRefresh?: boolean
}

/** 收藏条目：用户在结果面板点"收藏"时保存 */
export interface CollectionEntry {
  id: string
  /** 原文（选中内容） */
  sourceText: string
  /** 收藏时的输出结果 */
  result: string
  actionId: string
  actionName: string
  /** 结果来源：本地词库命中 还是 AI 生成 */
  source: 'dictionary' | 'ai'
  createdAt: number
}

/** 词库词条：内置词库与用户词库共用同一结构 */
export interface DictionaryEntry {
  word: string
  phonetic?: string
  meanings: Array<{ pos: string; meaning: string }>
}
