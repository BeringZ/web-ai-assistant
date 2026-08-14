/**
 * tests/selection/snapshot.test.ts —— 选区快照纯逻辑测试
 *
 * 覆盖：文本归一化、input 选区提取、空选区/零宽判定。
 * （DOM Range / Shadow DOM 部分依赖浏览器，由 E2E 覆盖）
 */
import { describe, expect, it } from 'vitest'
import { normalizeText, snapshotFromInput } from '@/selection/snapshot'

describe('normalizeText（文本归一化）', () => {
  it('压缩连续空白 + 去首尾', () => {
    expect(normalizeText('  Hello\n\n  world  ')).toBe('Hello world')
  })
})

describe('snapshotFromInput（输入框选区）', () => {
  function makeTextarea(value: string, start: number, end: number) {
    const el = document.createElement('textarea') as HTMLTextAreaElement & { getBoundingClientRect(): DOMRect }
    el.value = value
    el.selectionStart = start
    el.selectionEnd = end
    // jsdom 无布局：mock 矩形
    el.getBoundingClientRect = () => ({ width: 200, height: 40, top: 0, left: 0, right: 200, bottom: 40, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    return el
  }

  it('有效选区 → 提取文本 + input 来源标记', () => {
    const el = makeTextarea('你好，世界！hello world', 0, 6)
    const snap = snapshotFromInput(el)
    expect(snap).not.toBeNull()
    expect(snap!.text).toBe('你好，世界！')
    expect(snap!.source).toBe('input')
    expect(snap!.metadata.inputElement).toBe(el)
    expect(snap!.rect).not.toBeNull()
  })

  it('无选区（start === end）→ null', () => {
    const el = makeTextarea('hello', 2, 2)
    expect(snapshotFromInput(el)).toBeNull()
  })

  it('选区为纯空白 → null', () => {
    const el = makeTextarea('a   b', 1, 4)
    expect(snapshotFromInput(el)).toBeNull()
  })

  it('全选 input 值', () => {
    const el = makeTextarea('translate me', 0, 12)
    const snap = snapshotFromInput(el)
    expect(snap!.text).toBe('translate me')
  })
})
