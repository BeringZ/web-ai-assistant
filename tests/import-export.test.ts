/**
 * tests/import-export.test.ts —— 词库/收藏导入导出测试
 *
 * 覆盖：导出文件格式识别、非法条目宽容跳过、合并去重策略。
 */
import { describe, expect, it } from 'vitest'
import {
  mergeCollections,
  mergeDictionary,
  parseCollectionsImport,
  parseDictionaryImport,
} from '@/core/importExport'
import type { CollectionEntry, DictionaryEntry } from '@/core/types'

const dictFile = (words: unknown[]) =>
  JSON.stringify({ type: 'web-ai-dictionary', version: 1, words })

const colFile = (items: unknown[]) =>
  JSON.stringify({ type: 'web-ai-collections', version: 1, items })

describe('parseDictionaryImport', () => {
  it('识别合法词库文件并返回条目', () => {
    const { items, skipped } = parseDictionaryImport(
      dictFile([{ word: 'serendipity', phonetic: '/ˌserənˈdɪpəti/', meanings: [{ pos: 'n.', meaning: '意外发现' }] }]),
    )
    expect(items).toHaveLength(1)
    expect(items[0]!.word).toBe('serendipity')
    expect(skipped).toBe(0)
  })

  it('宽容跳过非法条目', () => {
    const { items, skipped } = parseDictionaryImport(
      dictFile([
        { word: 'good', meanings: [{ pos: 'adj.', meaning: '好的' }] },
        { word: '', meanings: [] }, // 非法：空 word / 空 meanings
        { word: 'bad', meanings: [{ pos: 'adj.' }] }, // 非法：meaning 缺字段
        'not-an-entry',
        42,
      ]),
    )
    expect(items).toHaveLength(1)
    expect(skipped).toBe(4)
  })

  it('非词库文件抛错', () => {
    expect(() => parseDictionaryImport('{"type":"web-ai-collections"}')).toThrow(/词库/)
    expect(() => parseDictionaryImport('{"type":"web-ai-dictionary","version":2,"words":[]}')).toThrow(/版本/)
    expect(() => parseDictionaryImport('not json')).toThrow(/JSON/)
  })
})

describe('parseCollectionsImport', () => {
  const valid: CollectionEntry = {
    id: 'a1',
    sourceText: 'hello',
    result: '你好',
    actionId: 'translate',
    actionName: '翻译',
    source: 'ai',
    createdAt: 1700000000000,
  }

  it('识别合法收藏文件', () => {
    const { items, skipped } = parseCollectionsImport(colFile([valid, { ...valid, id: 123 }]))
    expect(items).toHaveLength(1)
    expect(skipped).toBe(1)
  })

  it('缺 actionId 或 createdAt 非有限数 → 跳过', () => {
    const { items, skipped } = parseCollectionsImport(
      colFile([
        { ...valid, actionId: undefined }, // 缺 actionId
        { ...valid, createdAt: NaN }, // createdAt 非法
        valid,
      ]),
    )
    expect(items).toHaveLength(1)
    expect(skipped).toBe(2)
  })

  it('version 不匹配抛错', () => {
    expect(() => parseCollectionsImport('{"type":"web-ai-collections","version":2,"items":[]}')).toThrow(/版本/)
  })
})

describe('mergeDictionary（词库合并）', () => {
  const current: DictionaryEntry[] = [{ word: 'apple', meanings: [{ pos: 'n.', meaning: '苹果' }] }]

  it('新词追加，同词覆盖（忽略大小写）', () => {
    const incoming: DictionaryEntry[] = [
      { word: 'APPLE', meanings: [{ pos: 'n.', meaning: '苹果公司' }] },
      { word: 'banana', meanings: [{ pos: 'n.', meaning: '香蕉' }] },
    ]
    const merged = mergeDictionary(current, incoming)
    expect(merged).toHaveLength(2)
    // 覆盖后保留导入条目的 word（'APPLE'），按小写 key 查
    expect(merged.find((w) => w.word.toLowerCase() === 'apple')!.meanings[0]!.meaning).toBe('苹果公司')
    expect(merged.find((w) => w.word.toLowerCase() === 'banana')).toBeDefined()
  })
})

describe('mergeCollections（收藏合并）', () => {
  it('按 id 去重，新条目追加', () => {
    const current: CollectionEntry[] = [
      { id: '1', sourceText: 'a', result: 'A', actionId: 't', actionName: '翻译', source: 'ai', createdAt: 1 },
    ]
    const incoming: CollectionEntry[] = [
      { id: '1', sourceText: 'a', result: 'A-new', actionId: 't', actionName: '翻译', source: 'ai', createdAt: 1 }, // 重复 id
      { id: '2', sourceText: 'b', result: 'B', actionId: 't', actionName: '翻译', source: 'dictionary', createdAt: 2 },
    ]
    const merged = mergeCollections(current, incoming)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.result).toBe('A') // 保留现有，不覆盖
    expect(merged[1]!.id).toBe('2')
  })
})
