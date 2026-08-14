/**
 * selection/dom.ts —— DOM 遍历工具（跨 Shadow DOM）
 *
 * read-frog 启发：Web Components 站点里 `el.parentElement` 一路向上
 * 会在 ShadowRoot 边界断掉。统一走 getParentAcrossShadow：
 *   parentNode 存在 → parentNode
 *   parentNode 为 null 且 getRootNode() 是 ShadowRoot → host
 */

/** 跨 Shadow DOM 边界的父节点查找 */
export function getParentAcrossShadow(node: Node): Node | null {
  if (node.parentNode) return node.parentNode
  const root = node.getRootNode()
  if (root instanceof ShadowRoot) return root.host
  return null
}

/** 视为"块"的标签：遇到这些元素就认为是一段独立内容 */
export const BLOCK_TAGS = new Set([
  'P', 'LI', 'DD', 'DT', 'TD', 'TH', 'BLOCKQUOTE', 'PRE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGCAPTION',
])

/** 向上查找最近的块级元素（跨 Shadow DOM；选区 anchor 通常是文本节点） */
export function nearestBlockElement(node: Node | null): HTMLElement | null {
  if (!node) return null
  let el: HTMLElement | null =
    node instanceof Element ? (node as HTMLElement) : node.parentElement
  while (el && !BLOCK_TAGS.has(el.tagName)) {
    const next = getParentAcrossShadow(el)
    el = next instanceof Element ? (next as HTMLElement) : null
  }
  return el
}

/** 向上找最近的 文章/章节 容器（跨 Shadow DOM） */
export function nearestSectionElement(node: Node | null): HTMLElement {
  const block = nearestBlockElement(node)
  let el: HTMLElement | null = block
  while (el && el.tagName !== 'BODY') {
    if (['ARTICLE', 'SECTION', 'MAIN'].includes(el.tagName)) return el
    // 走到标题时，把"标题 + 其后的兄弟内容"视为一个章节
    if (/^H[1-6]$/.test(el.tagName) && el.parentElement) return el.parentElement
    const next = getParentAcrossShadow(el)
    el = next instanceof Element ? (next as HTMLElement) : null
  }
  return document.body
}

/** 元素是否可读（跳过 script/style/noscript；隐藏元素按能力检测） */
export function isReadableElement(el: HTMLElement): boolean {
  if (el.closest('script, style, noscript')) return false
  // jsdom 等无布局环境：getClientRects 为空视为可读（无法判断布局隐藏）
  if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) {
    // 真实浏览器：offsetParent 为 null 且 rect 为空 → 隐藏
    if (el.offsetParent === null && el.getClientRects().length === 0) return false
  }
  return true
}

/** 读取元素可读文本（压缩空白） */
export function elementText(el: HTMLElement): string {
  const raw =
    typeof el.innerText === 'string' && el.innerText.length > 0
      ? el.innerText
      : (el.textContent ?? '')
  return raw.replace(/\s+/g, ' ').trim()
}
