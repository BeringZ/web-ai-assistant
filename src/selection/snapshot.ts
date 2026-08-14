/**
 * selection/snapshot.ts —— 从 Range / Input 构建 SelectionSnapshot
 *
 * 网页：window.getSelection() 的（主）Range → 快照（含多 range 文本合并）
 * Input：activeElement INPUT/TEXTAREA 的 selectionStart/End → 快照
 */

import type { RangeSnapshot, SelectionMetadata, SelectionSnapshot } from './types'

/** 文本归一化：压缩空白 + 去首尾 */
export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** Range → RangeSnapshot（纯快照，选区被清除后仍可重建 Range） */
export function snapshotRange(r: Range): RangeSnapshot {
  return {
    startContainer: r.startContainer,
    startOffset: r.startOffset,
    endContainer: r.endContainer,
    endOffset: r.endOffset,
  }
}

/**
 * 从 window selection 构建网页选区快照。
 * - 多 range：文本合并（+ 分隔），定位用第一个 range
 * - 零宽/空选区 → null
 */
export function snapshotFromSelection(
  sel: Selection | null,
  metadata: SelectionMetadata = {},
): SelectionSnapshot | null {
  if (!sel || sel.rangeCount === 0) return null

  const ranges: Range[] = []
  for (let i = 0; i < sel.rangeCount; i++) ranges.push(sel.getRangeAt(i).cloneRange())
  if (ranges.length === 0) return null

  const text = normalizeText(ranges.map((r) => r.toString()).join(' '))
  if (!text) return null

  const main = ranges[0]!
  const rect = main.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null

  return {
    text,
    range: snapshotRange(main),
    rect,
    source: 'web',
    metadata,
  }
}

/**
 * 从 INPUT / TEXTAREA 构建选区快照（selectionStart/selectionEnd 是输入框的"选区"）。
 * 定位：输入框元素矩形（无法精确定位光标处文本，用整框矩形兜底）。
 */
export function snapshotFromInput(
  el: HTMLInputElement | HTMLTextAreaElement,
): SelectionSnapshot | null {
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  if (end <= start) return null

  const text = normalizeText(el.value.slice(start, end))
  if (!text) return null

  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null

  return {
    text,
    range: null, // 输入框无法用 DOM Range 表示
    rect,
    source: 'input',
    metadata: { inputElement: el },
  }
}

/** 当前激活元素是否为可划词的输入控件 */
export function isEditableActiveElement(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false
  return (
    el.tagName === 'INPUT' &&
    (el as HTMLInputElement).type !== 'password' &&
    (el as HTMLInputElement).type !== 'file'
  ) || el.tagName === 'TEXTAREA'
}
