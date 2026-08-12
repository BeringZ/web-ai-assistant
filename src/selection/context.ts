/**
 * selection/context.ts —— 选区提取与上下文抓取（仅 Content Script 环境）
 *
 * ContextLevel → 上下文文本的映射：
 *   selection: 仅选中文本
 *   nearby:    选中文本所在的"块"（段落/列表项/代码块…）全部文本
 *   section:   最近的 文章/章节 容器文本
 *   article:   整页正文文本（截断上限保护）
 *
 * 关键细节：无论哪个级别，如果文本超过长度上限，
 * 截断时必须**以选中文本为中心**截窗，保证 {{selection}} 的内容
 * 在 {{context}} 里完整可见 —— 否则 AI 会因为 context 里找不到
 * 原文而困惑。
 */

import type { ContextLevel, SelectionPayload } from '@/core/types'

/** 各级别的字符上限（省 Token 是第一原则） */
const LIMITS: Record<ContextLevel, number> = {
  selection: 8_000,
  nearby: 2_000,
  section: 8_000,
  article: 16_000,
}

/** 视为"块"的标签：遇到这些元素就认为是一段独立内容 */
const BLOCK_TAGS = new Set([
  'P', 'LI', 'DD', 'DT', 'TD', 'TH', 'BLOCKQUOTE', 'PRE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGCAPTION',
])

/** 向上查找最近的块级元素（选区 anchor 通常是文本节点） */
function nearestBlockElement(node: Node | null): HTMLElement | null {
  if (!node) return null
  let el: HTMLElement | null =
    node instanceof Element ? (node as HTMLElement) : node.parentElement
  while (el && !BLOCK_TAGS.has(el.tagName)) {
    el = el.parentElement
  }
  return el
}

/**
 * 核心函数：在完整文本里截出"包含选中文本"的一段窗口。
 * - 文本不够长：原样返回
 * - 文本超长：以选中文本为中心向两侧扩展，超出部分用 … 提示
 */
function centerWindow(fullText: string, selectionText: string, maxLen: number): string {
  if (fullText.length <= maxLen) return fullText

  const selIdx = fullText.indexOf(selectionText)
  if (selIdx === -1) {
    // 选中文本不在该容器里（极端情况）：退化为取前 maxLen 字符
    return fullText.slice(0, maxLen) + '…'
  }

  const head = Math.floor((maxLen - selectionText.length) / 2)
  const start = Math.max(0, selIdx - head)
  const end = Math.min(fullText.length, start + maxLen)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < fullText.length ? '…' : ''
  return prefix + fullText.slice(start, end) + suffix
}

/** 向上找最近的 文章/章节 容器（article/section/main，或最近的标题层级） */
function nearestSectionElement(node: Node | null): HTMLElement {
  const block = nearestBlockElement(node)
  let el = block
  while (el && el.tagName !== 'BODY') {
    if (['ARTICLE', 'SECTION', 'MAIN'].includes(el.tagName)) return el
    // 走到标题时，把"标题 + 其后的兄弟内容"视为一个章节
    if (/^H[1-6]$/.test(el.tagName) && el.parentElement) return el.parentElement
    el = el.parentElement
  }
  return document.body
}

/** 读取一个元素的可读文本（跳过隐藏元素与脚本/样式） */
function elementText(el: HTMLElement): string {
  return (el.innerText ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 根据上下文级别组装 SelectionPayload。
 * 调用方（content.ts）在用户点击 Action 时调用。
 *
 * @param range 选区快照。为什么传 Range 而不是读 window.getSelection()？
 *   因为用户点击菜单按钮时，页面脚本可能已经清掉了当前选区
 *   （很多站点在 mousedown 里 clearSelection），
 *   菜单弹出那一刻快照 Range，点击 Action 时用快照，内容才不会丢。
 */
export function buildSelectionPayload(level: ContextLevel, range?: Range): SelectionPayload | null {
  const r =
    range ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null)
  const raw = (r?.toString() ?? '').trim()
  if (!raw || raw.length === 0) return null

  const limit = LIMITS[level]
  const anchor = r?.commonAncestorContainer ?? null
  let context = raw

  if (level === 'nearby') {
    const block = nearestBlockElement(anchor)
    context = block ? centerWindow(elementText(block), raw, limit) : raw
  } else if (level === 'section') {
    const section = nearestSectionElement(anchor)
    context = centerWindow(elementText(section), raw, limit)
  } else if (level === 'article') {
    context = centerWindow(elementText(document.body), raw, limit)
  }

  return {
    text: raw.slice(0, LIMITS.selection),
    context,
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
