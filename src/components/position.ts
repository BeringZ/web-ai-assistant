/**
 * components/position.ts —— 悬浮 UI 定位（普通网页与 PDF 阅读器共用）
 */

/** 结果面板定位参数：位置 + 允许的最大高度（下方空间不足时面板内部滚动） */
export interface PanelPosition {
  x: number
  y: number
  maxHeight: number
}

/** 结果面板固定宽度（与 CSS .wa-panel 保持一致） */
export const PANEL_WIDTH = 420

/**
 * 面板定位：**上沿固定吸附在选区下方 8px**，绝不跳到选区上方。
 * 下方空间不足时不翻转面板，而是压缩 maxHeight 让内容在面板内部滚动。
 *
 * 工程补充：选区贴住视口底部时，y 会被 clamp 到"至少露出
 * MIN_VISIBLE 高度"的位置——配合滚动跟随，滚动后面板即完整可见。
 */
export function panelPosition(rect: DOMRect): PanelPosition {
  const GAP = 8
  const MARGIN = 8
  const MIN_VISIBLE = 160 // 面板最小可见高度（保证不出现"只露一条缝"）

  const width = Math.min(PANEL_WIDTH, window.innerWidth - MARGIN * 2)
  const x = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))

  let y = Math.max(MARGIN, rect.bottom + GAP)
  y = Math.min(y, window.innerHeight - MIN_VISIBLE - MARGIN)

  const maxHeight = Math.max(MIN_VISIBLE, window.innerHeight - y - MARGIN)

  return { x, y, maxHeight }
}

/** 悬浮菜单定位：默认贴选区下方，下方不足时贴上方（菜单矮，翻转无妨） */
export function menuPosition(rect: DOMRect, estH = 44): { x: number; y: number } {
  const y = rect.bottom + 8 + estH > window.innerHeight ? Math.max(8, rect.top - estH - 8) : rect.bottom + 8
  return { x: Math.max(8, rect.left), y }
}
