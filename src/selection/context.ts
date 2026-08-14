/**
 * selection/context.ts —— ContextBuilder
 *
 * 职责解耦（Phase 2）：
 *   SelectionSnapshot ──→ ContextSnapshot（段落语义）──→ SelectionPayload
 *
 * 语义段落：before（前一段）/ current（选区所在段）/ after（后一段），
 * 而不是只截"nearest block"一块 —— 对 AI 更稳定。
 *
 * 关键细节：截断必须以选中文本为中心（applyBudget），
 * 保证 {{selection}} 在 {{context}} 里完整可见。
 */

import type { ContextLevel, SelectionPayload } from '@/core/types'
import type { ContextSnapshot, SelectionSnapshot } from './types'
import {
  BLOCK_TAGS,
  elementText,
  isReadableElement,
  nearestBlockElement,
  nearestSectionElement,
} from './dom'
import { normalizeText, snapshotFromSelection, snapshotRange } from './snapshot'

/** 各级别字符上限（省 Token 是第一原则） */
export const CONTEXT_LIMITS: Record<ContextLevel, number> = {
  selection: 8_000,
  nearby: 2_000,
  section: 8_000,
  article: 16_000,
}

/**
 * 预算截断（纯函数）：以选中文本为中心向两侧扩展，超出用 … 提示。
 * 文本不足 / 未找到选中文本时原样或退化为取前 maxChars。
 */
export function applyBudget(parts: string[], selected: string, maxChars: number): string {
  const full = parts.join('\n\n')
  if (full.length <= maxChars) return full

  const selIdx = full.indexOf(selected)
  if (selIdx === -1) return full.slice(0, maxChars) + '…'

  const head = Math.floor((maxChars - selected.length) / 2)
  const start = Math.max(0, selIdx - head)
  const end = Math.min(full.length, start + maxChars)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < full.length ? '…' : ''
  return prefix + full.slice(start, end) + suffix
}

/** 段落分类（纯函数）：定位包含选中文本的段，划分 before/current/after */
export function classifyParagraphs(
  paragraphs: string[],
  selected: string,
): { before: string[]; current: string[]; after: string[] } {
  if (paragraphs.length === 0) return { before: [], current: [selected], after: [] }

  let currentIdx = paragraphs.findIndex((p) => p.includes(selected))
  if (currentIdx === -1) {
    // 选中文本不在任何段落里（极端情况）：按字符位置就近
    currentIdx = 0
    let best = Infinity
    paragraphs.forEach((p, i) => {
      const d = Math.abs(p.indexOf(selected.slice(0, 20)))
      if (d < best) {
        best = d
        currentIdx = i
      }
    })
  }
  return {
    before: paragraphs.slice(0, currentIdx),
    current: [paragraphs[currentIdx]!],
    after: paragraphs.slice(currentIdx + 1),
  }
}

/** 收集某元素下"可读块"的段落文本（跳过 script/style/隐藏） */
function collectBlockTexts(container: HTMLElement): string[] {
  const out: string[] = []
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue
    if (!BLOCK_TAGS.has(child.tagName)) continue
    if (!isReadableElement(child)) continue
    const t = elementText(child)
    if (t) out.push(t)
  }
  return out
}

/** 从 DOM 提取段落结构（选区所在块 + 前后兄弟块；section/article 用容器内全部块） */
function extractParagraphs(
  anchor: Node | null,
  level: ContextLevel,
  selected: string,
): { before: string[]; current: string[]; after: string[] } {
  if (level === 'selection') return { before: [], current: [selected], after: [] }

  let container: HTMLElement
  if (level === 'nearby') {
    // 选区所在块 + 同容器的前后兄弟块
    const block = nearestBlockElement(anchor)
    container = block?.parentElement ?? document.body
  } else if (level === 'section') {
    container = nearestSectionElement(anchor)
  } else {
    container = document.body
  }

  return classifyParagraphs(collectBlockTexts(container), selected)
}

/** 由快照 + 级别构建上下文（段落语义） */
export function buildContext(snapshot: SelectionSnapshot, level: ContextLevel): ContextSnapshot {
  const selected = snapshot.text
  const anchor = snapshot.range ? snapshot.range.startContainer : null
  const paragraphs = extractParagraphs(anchor, level, selected)

  const budget = CONTEXT_LIMITS[level]
  const currentText = applyBudget(
    [...paragraphs.before, ...paragraphs.current, ...paragraphs.after],
    selected,
    budget,
  )

  return { selected, paragraphs, text: currentText }
}

/**
 * 兼容入口：由 Range 快照直接构建 SelectionPayload。
 * （content.tsx 在用户点击 Action 时用快照 Range 调用，避免选区被页面清除）
 */
export function buildSelectionPayload(level: ContextLevel, range?: Range): SelectionPayload | null {
  const sel = window.getSelection()
  const snapshot = range
    ? (() => {
        const text = normalizeText(range.toString())
        if (!text) return null
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return null
        return {
          text,
          range: snapshotRange(range),
          rect,
          source: 'web' as const,
          metadata: {},
        }
      })()
    : snapshotFromSelection(sel)
  if (!snapshot) return null

  const ctx = buildContext(snapshot, level)
  return {
    text: ctx.selected.slice(0, CONTEXT_LIMITS.selection),
    context: ctx.text,
    url: location.href,
    title: document.title,
  }
}

/** 选区是否"看起来可用"（非空、非全空白） */
export function hasUsableSelection(): boolean {
  const text = window.getSelection()?.toString().trim()
  return !!text && text.length > 0
}

/** 取选区矩形（用于定位悬浮 UI）；无有效选区时返回 null */
export function getSelectionRect(range?: Range): DOMRect | null {
  const r =
    range ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null)
  if (!r) return null
  const rect = r.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return rect
}
