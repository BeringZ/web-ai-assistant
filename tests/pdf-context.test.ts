/**
 * tests/pdf-context.test.ts —— PDF 上下文构建测试
 *
 * 覆盖：页面文本拼接、前后页范围（含第一页/最后一页边界）、
 * 拼接与超长截断、仅选中 / 当前页 / 前后页三级。
 */
import { describe, expect, it } from 'vitest'
import {
  PDF_CONTEXT_LIMIT,
  buildPdfContext,
  composeContext,
  pageTextFromItems,
  pickPageNumbers,
} from '@/pdf/context'

describe('pageTextFromItems（文本拼接）', () => {
  it('合并 items 并压缩空白', () => {
    expect(
      pageTextFromItems([
        { str: 'Hello' },
        { str: 'world' },
        { str: '' },
        { str: '  spaced  ' },
      ]),
    ).toBe('Hello world spaced')
  })
})

describe('pickPageNumbers（前后页范围）', () => {
  it('中间页返回前后各一页', () => {
    expect(pickPageNumbers(5, 10)).toEqual([4, 5, 6])
  })

  it('第一页边界（无第 0 页）', () => {
    expect(pickPageNumbers(1, 10)).toEqual([1, 2])
  })

  it('最后一页边界', () => {
    expect(pickPageNumbers(10, 10)).toEqual([9, 10])
  })

  it('单页 PDF', () => {
    expect(pickPageNumbers(1, 1)).toEqual([1])
  })
})

describe('composeContext（拼接 + 截断）', () => {
  it('拼接多个文本块', () => {
    expect(composeContext(['Page 1', 'Page 2'], 1000)).toBe('Page 1\n\nPage 2')
  })

  it('超长时截断到 maxChars', () => {
    const long = 'x'.repeat(500)
    const out = composeContext([long, long], 600)
    expect(out.length).toBe(600)
  })
})

describe('buildPdfContext（三级上下文）', () => {
  const texts = new Map<number, string>([
    [1, '第一页内容'],
    [2, '第二页内容'],
    [3, '第三页内容'],
  ])
  const getPageText = (n: number) => Promise.resolve(texts.get(n) ?? '')
  const base = { selectionText: '选中内容', pageNumber: 2, pageCount: 3, getPageText }

  it('selection 级：只返回选中文本', async () => {
    const ctx = await buildPdfContext({ ...base, level: 'selection' })
    expect(ctx).toBe('选中内容')
  })

  it('page 级：当前页全文', async () => {
    const ctx = await buildPdfContext({ ...base, level: 'page' })
    expect(ctx).toContain('第二页内容')
    expect(ctx).not.toContain('第一页')
  })

  it('around 级：前后页 + 当前页', async () => {
    const ctx = await buildPdfContext({ ...base, level: 'around' })
    expect(ctx).toContain('第一页内容')
    expect(ctx).toContain('第二页内容')
    expect(ctx).toContain('第三页内容')
  })

  it('第一页 around 级自动跳过越界页', async () => {
    const ctx = await buildPdfContext({
      ...base,
      level: 'around',
      pageNumber: 1,
      getPageText: (n) => Promise.resolve(texts.get(n) ?? ''),
    })
    expect(ctx).not.toContain('第三页内容')
  })

  it('超长上下文截断到上限', async () => {
    const big = new Map([[1, 'a'.repeat(PDF_CONTEXT_LIMIT + 500)]])
    const ctx = await buildPdfContext({
      ...base,
      level: 'page',
      pageNumber: 1,
      pageCount: 1,
      getPageText: (n) => Promise.resolve(big.get(n) ?? ''),
    })
    expect(ctx.length).toBeLessThanOrEqual(PDF_CONTEXT_LIMIT)
  })
})
