/**
 * tests/translation-cache.test.ts —— 翻译缓存测试
 *
 * 覆盖：key 归一化（单词大小写、语段原文）、淘汰策略（过期清理/超限淘汰最旧）。
 * 读写 chrome.storage 的封装不在此测（依赖浏览器 API）。
 */
import { describe, expect, it } from 'vitest'
import { CACHE_LIMIT, cacheKeyFor, hashString, trimCache, type TranslationCache } from '@/core/translationCache'

const PROMPT = '请将下面的内容翻译成简体中文。'

describe('cacheKeyFor（缓存 key 归一化 + Prompt 指纹）', () => {
  it('单词统一小写（Hello 与 hello 是同一个词）', () => {
    const k1 = cacheKeyFor('translate', PROMPT, 'Hello')
    const k2 = cacheKeyFor('translate', PROMPT, 'HELLO')
    expect(k1).toBe(k2)
    expect(k1).toBe(`translate|${hashString(PROMPT)}|hello`)
  })

  it('语段保留原文与大小写', () => {
    const k1 = cacheKeyFor('translate', PROMPT, 'Hello world')
    const k2 = cacheKeyFor('translate', PROMPT, 'HELLO WORLD')
    expect(k1).not.toBe(k2)
  })

  it('Prompt 不同 → key 不同（修改 Prompt 后旧缓存失效）', () => {
    const a = cacheKeyFor('translate', '请翻译成中文', 'hello')
    const b = cacheKeyFor('translate', '请翻译成日语', 'hello')
    expect(a).not.toBe(b)
  })

  it('trim 掉首尾空白', () => {
    expect(cacheKeyFor('translate', PROMPT, '  hello  ')).toBe(cacheKeyFor('translate', PROMPT, 'hello'))
  })
})

describe('hashString（FNV-1a 指纹）', () => {
  it('相同输入相同输出，不同输入不同输出', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abd'))
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
