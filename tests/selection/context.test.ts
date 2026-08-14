/**
 * tests/selection/context.test.ts —— ContextBuilder 纯逻辑测试
 *
 * 覆盖：段落分类（before/current/after）、预算截断（selection 中心）、
 * 边界（空段落、选中不在任何段落）。
 */
import { describe, expect, it } from 'vitest'
import { applyBudget, classifyParagraphs } from '@/selection/context'

describe('classifyParagraphs（语义段落分类）', () => {
  const paras = ['第一段', '第二段', '第三段', '第四段']

  it('选中文本在中间段 → before/current/after 正确切分', () => {
    const { before, current, after } = classifyParagraphs(paras, '第三段')
    expect(before).toEqual(['第一段', '第二段'])
    expect(current).toEqual(['第三段'])
    expect(after).toEqual(['第四段'])
  })

  it('第一段 → before 为空', () => {
    const { before, current, after } = classifyParagraphs(paras, '第一段')
    expect(before).toEqual([])
    expect(current).toEqual(['第一段'])
    expect(after).toEqual(['第二段', '第三段', '第四段'])
  })

  it('最后一段 → after 为空', () => {
    const { after } = classifyParagraphs(paras, '第四段')
    expect(after).toEqual([])
  })

  it('空段落列表 → current 兜底为选中文本', () => {
    const { current } = classifyParagraphs([], 'x')
    expect(current).toEqual(['x'])
  })

  it('选中文本不在任何段落 → 就近归类', () => {
    const { before, current, after } = classifyParagraphs(paras, '第二')
    expect(current[0]).toBe('第二段')
    expect(before).toEqual(['第一段'])
  })
})

describe('applyBudget（预算截断）', () => {
  it('文本不足预算 → 原样返回', () => {
    expect(applyBudget(['short'], 'short', 100)).toBe('short')
  })

  it('超长 → 以选中文本为中心截窗，selection 完整保留', () => {
    const parts = ['a'.repeat(500), 'SELECTED', 'b'.repeat(500)]
    const out = applyBudget(parts, 'SELECTED', 200)
    // 内容部分 ≤ 预算（不含两端省略号）
    expect(out.replaceAll('…', '').length).toBeLessThanOrEqual(200)
    expect(out).toContain('SELECTED')
    // 两侧有省略号标记
    expect(out.startsWith('…')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
  })

  it('选中文本不存在 → 退化为取前 maxChars', () => {
    const out = applyBudget(['x'.repeat(300)], 'MISSING', 100)
    expect(out.length).toBe(101) // 100 + 省略号
    expect(out.endsWith('…')).toBe(true)
  })
})
