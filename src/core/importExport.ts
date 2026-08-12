/**
 * core/importExport.ts —— 词库 / 收藏的导入导出
 *
 * 导出文件统一带 type/version 标记，导入时按标记校验，防止混用。
 * 条目级校验宽容：非法条目跳过（返回有效部分 + 跳过数），不整体失败。
 */
import type { CollectionEntry, DictionaryEntry } from './types'
import { isValidDictionaryEntry } from './storage'

/* ---------------- 导出文件格式 ---------------- */

export interface DictionaryExportFile {
  type: 'web-ai-dictionary'
  version: 1
  words: DictionaryEntry[]
}

export interface CollectionsExportFile {
  type: 'web-ai-collections'
  version: 1
  items: CollectionEntry[]
}

/** 校验收藏条目结构 */
export function isValidCollectionEntry(e: unknown): e is CollectionEntry {
  if (typeof e !== 'object' || e === null) return false
  const c = e as CollectionEntry
  return (
    typeof c.id === 'string' &&
    typeof c.sourceText === 'string' &&
    typeof c.result === 'string' &&
    typeof c.actionName === 'string' &&
    (c.source === 'dictionary' || c.source === 'ai') &&
    typeof c.createdAt === 'number'
  )
}

/**
 * 合并词库：按 word（忽略大小写）去重，导入的覆盖同词条，新词追加。
 * @returns 合并后的词库（保留 current 的顺序，追加 incoming 的新词）
 */
export function mergeDictionary(current: DictionaryEntry[], incoming: DictionaryEntry[]): DictionaryEntry[] {
  const byKey = new Map(current.map((w) => [w.word.toLowerCase(), w]))
  for (const w of incoming) {
    byKey.set(w.word.toLowerCase(), w)
  }
  return [...byKey.values()]
}

/** 合并收藏：按 id 去重，导入的新条目追加到末尾 */
export function mergeCollections(current: CollectionEntry[], incoming: CollectionEntry[]): CollectionEntry[] {
  const seen = new Set(current.map((c) => c.id))
  const merged = [...current]
  for (const c of incoming) {
    if (!seen.has(c.id)) {
      merged.push(c)
      seen.add(c.id)
    }
  }
  return merged
}

/* ---------------- 导入解析 ---------------- */

export interface ImportResult<T> {
  items: T[]
  /** 被跳过的非法条目数 */
  skipped: number
}

/**
 * 解析词库导入内容。
 * @throws 非 JSON / 非词库文件格式时抛出可读错误
 */
export function parseDictionaryImport(raw: string): ImportResult<DictionaryEntry> {
  const data = parseJson(raw)
  const file = data as Partial<DictionaryExportFile>
  if (file.type !== 'web-ai-dictionary' || !Array.isArray(file.words)) {
    throw new Error('不是有效的词库导出文件（缺少 web-ai-dictionary 标记或 words 数组）')
  }
  const valid = file.words.filter(isValidDictionaryEntry)
  return { items: valid, skipped: file.words.length - valid.length }
}

/** 解析收藏导入内容 */
export function parseCollectionsImport(raw: string): ImportResult<CollectionEntry> {
  const data = parseJson(raw)
  const file = data as Partial<CollectionsExportFile>
  if (file.type !== 'web-ai-collections' || !Array.isArray(file.items)) {
    throw new Error('不是有效的收藏导出文件（缺少 web-ai-collections 标记或 items 数组）')
  }
  const valid = file.items.filter(isValidCollectionEntry)
  return { items: valid, skipped: file.items.length - valid.length }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
}

/* ---------------- 导出下载 ---------------- */

/** 触发浏览器下载 JSON 文件（Options/Popup 页面环境） */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
