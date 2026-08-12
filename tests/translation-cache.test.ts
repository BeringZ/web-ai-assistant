/**
 * tests/translation-cache.test.ts —— 翻译缓存测试
 *
 * 覆盖：key 归一化（单词大小写、语段原文）、淘汰策略（过期清理/超限淘汰最旧）。
 * 读写 chrome.storage 的封装不在此测（依赖浏览器 API）。
 */
import { describe, expect, it } from 'vitest'
import { CACHE_LIMIT, cacheKeyFor, trimCache, type TranslationCache } from '@/core/translationCache'

describe('cacheKeyFor（缓存 key 归一化）', () => {
  it('单词统一小写（Hello 与 hello 是同一个词）', () => {
    expect(cacheKeyFor('translate', 'Hello')).toBe('translate|hello')
    expect(cacheKeyFor('translate', 'HELLO')).toBe('translate|hello')
  })

  it('语段保留原文与大小写', () => {
    expect(cacheKeyFor('translate', 'Hello world')).toBe('translate|Hello world')
    expect(cacheKeyFor('translate', 'HELLO WORLD')).toBe('translate|HELLO WORLD')
  })

  it('trim 掉首尾空白', () => {
    expect(cacheKeyFor('translate', '  hello  ')).toBe('translate|hello')
  })
})

describe('trimCache（淘汰策略）', () => {
  const now = Date.now()
  const make = (n: number, ageMs: number): TranslationCache => ({
    [`k${n}`]: { result: `r${n}`, createdAt: now - ageMs },
  })

  it('移除过期项', () => {
    const cache = {
      ...make(1, 1000),
      ...make(2, 100 * 24 * 60 * 60 * 1000), // 100 天前 → 过期
    }
    const out = trimCache(cache, 90 * 24 * 60 * 60 * 1000, CACHE_LIMIT)
    expect(Object.keys(out)).toEqual(['k1'])
  })

  it('超容量时淘汰最旧（保留最新的）', () => {
    const cache = {
      ...make(1, 10_000), // 最旧
      ...make(2, 5_000),
      ...make(3, 1_000), // 最新
    }
    const out = trimCache(cache, 90 * 24 * 60 * 60 * 1000, 2)
    expect(Object.keys(out).sort()).toEqual(['k2', 'k3'])
  })

  it('未超限时全部保留', () => {
    const cache = { ...make(1, 100), ...make(2, 200) }
    const out = trimCache(cache, 90 * 24 * 60 * 60 * 1000, CACHE_LIMIT)
    expect(Object.keys(out)).toHaveLength(2)
  })
})
