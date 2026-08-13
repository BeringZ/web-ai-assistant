/**
 * core/translationCache.ts —— 翻译结果缓存
 *
 * 目的：同一内容（词/语段）再次被选中翻译时直接复用上次结果，
 * 不重复调用 AI API（省 Token、秒出）。
 *
 * 语义：
 * - 单词缓存 key 统一小写（hello 与 Hello 是同一个词）
 * - 语段缓存 key 保留原文
 * - 90 天过期 + 上限 300 条（超限淘汰最旧），存 chrome.storage.local 持久化
 * - 「重试」通过 RunRequest.forceRefresh 跳过缓存，强制重新生成
 */
import { browser } from 'wxt/browser'
import { isSingleWord } from '@/dictionary'

const CACHE_KEY = 'translation_cache'
export const CACHE_LIMIT = 300
export const CACHE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000 // 90 天

export interface TranslationCacheEntry {
  result: string
  createdAt: number
}

export type TranslationCache = Record<string, TranslationCacheEntry>

/** FNV-1a 哈希 → 36 进制短串：用于把 Prompt 文本折叠进缓存 key */
export function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * 缓存 key：操作 + Prompt 指纹 + 归一化文本。
 * Prompt 指纹让"用户修改翻译 Prompt"后旧缓存自然失效，
 * 无需人工维护版本号。
 * 单词统一小写（hello 与 Hello 是同一个词）；语段保留原文。
 */
export function cacheKeyFor(actionId: string, promptText: string, text: string): string {
  const t = text.trim()
  const normalized = isSingleWord(t) ? t.toLowerCase() : t
  return [actionId, hashString(promptText), normalized].join('|')
}

/**
 * 淘汰策略（纯函数，便于测试）：
 * 1. 移除超过 maxAgeMs 的过期项
 * 2. 超过 limit 时按 createdAt 淘汰最旧
 * @returns 清理后的缓存
 */
export function trimCache(
  cache: TranslationCache,
  maxAgeMs: number = CACHE_MAX_AGE_MS,
  limit: number = CACHE_LIMIT,
): TranslationCache {
  const now = Date.now()
  const entries = Object.entries(cache)
    .filter(([, e]) => now - e.createdAt <= maxAgeMs)
    .sort((a, b) => b[1].createdAt - a[1].createdAt) // 新的在前
  return Object.fromEntries(entries.slice(0, limit))
}

async function readCache(): Promise<TranslationCache> {
  const raw = await browser.storage.local.get(CACHE_KEY)
  const cache = (raw[CACHE_KEY] ?? {}) as TranslationCache
  return cache && typeof cache === 'object' ? cache : {}
}

/** 读取缓存：未命中或已过期返回 null */
export async function getCachedTranslation(key: string): Promise<string | null> {
  const cache = await readCache()
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.createdAt > CACHE_MAX_AGE_MS) return null
  return entry.result
}

/** 写入缓存（写入时顺带清理过期/超限项） */
export async function setCachedTranslation(key: string, result: string): Promise<void> {
  const cache = await readCache()
  cache[key] = { result, createdAt: Date.now() }
  await browser.storage.local.set({ [CACHE_KEY]: trimCache(cache) })
}
