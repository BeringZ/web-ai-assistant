/**
 * tests/dictionary.test.ts —— 本地词库 harness 测试
 *
 * 覆盖：词/语段判定、词库命中/未命中、输出格式。
 */
import { describe, expect, it } from 'vitest'
import { DICTIONARY_SIZE, WORD_FORMAT_HINT, formatEntry, isSingleWord, lookupWord } from '@/dictionary'

describe('isSingleWord（词 vs 语段判定）', () => {
  it('单个英文词判为词', () => {
    expect(isSingleWord('hello')).toBe(true)
    expect(isSingleWord('Hello')).toBe(true)
    expect(isSingleWord('understand')).toBe(true)
  })

  it('复合词/缩写词判为词', () => {
    expect(isSingleWord('well-known')).toBe(true)
    expect(isSingleWord("don't")).toBe(true)
  })

  it('语段、数字、符号判为语段', () => {
    expect(isSingleWord('hello world')).toBe(false)
    expect(isSingleWord('hello, world')).toBe(false)
    expect(isSingleWord('123')).toBe(false)
    expect(isSingleWord('你好')).toBe(false)
    expect(isSingleWord('a.b')).toBe(false)
    expect(isSingleWord('')).toBe(false)
  })
})

describe('lookupWord（词库查询）', () => {
  it('命中词库：忽略大小写', () => {
    const hit = lookupWord('Hello')
    expect(hit).not.toBeNull()
    expect(hit!.word).toBe('hello')
    expect(hit!.phonetic).toBeTruthy()
    expect(hit!.meanings.length).toBeGreaterThan(0)
  })

  it('未命中返回 null', () => {
    expect(lookupWord('supercalifragilistic')).toBeNull()
    expect(lookupWord('')).toBeNull()
  })

  it('词库已加载（非空）', () => {
    expect(DICTIONARY_SIZE).toBeGreaterThan(100)
  })
})

describe('formatEntry（词库输出格式）', () => {
  it('输出含 单词/音标/词性+释义', () => {
    const out = formatEntry({
      word: 'hello',
      phonetic: 'həˈləʊ',
      meanings: [
        { pos: 'int.', meaning: '你好；喂' },
        { pos: 'n.', meaning: '问候' },
      ],
    })
    expect(out).toContain('**hello**')
    expect(out).toContain('/həˈləʊ/')
    expect(out).toContain('int. 你好；喂')
    expect(out).toContain('n. 问候')
  })

  it('无音标时省略音标行', () => {
    const out = formatEntry({
      word: 'x',
      meanings: [{ pos: 'n.', meaning: '未知' }],
    })
    expect(out).not.toContain('/')
  })
})

describe('WORD_FORMAT_HINT（AI 词典化格式要求）', () => {
  it('包含关键要素：音标/词性/释义', () => {
    expect(WORD_FORMAT_HINT).toContain('音标')
    expect(WORD_FORMAT_HINT).toContain('词性')
    expect(WORD_FORMAT_HINT).toContain('释义')
  })
})
