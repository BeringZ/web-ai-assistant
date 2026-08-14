/**
 * components/FloatingMenu.tsx —— 选中文字后出现的悬浮操作菜单
 *
 * 纯展示组件：菜单项来自上层（content.ts 从 Action 层汇总），
 * 点击行为通过 onPick 回调上抛 —— 保持"渲染器"层不做业务。
 */
import type { Action } from '@/core/types'

/** Action 图标（v0.5.1：按 icon 枚举，fallback action.id；SVG 路径 13px 级别） */
const ICONS: Record<string, string> = {
  translate: 'M3 5h12M9 3v2m0 0v14m-6-6l6 6m0-14l6 6M15 19l3-5 3 5M17 15v4',
  explain: 'M12 3l9 5-9 5-9-5 9-5zM12 12v9m-7-6.5V13m14 1.5V13M4 21h16',
  summary: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  rewrite: 'M4 20h4l10-10-4-4L4 16v4zM14 6l4 4',
  question: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  custom: 'M12 5v14M5 12h14',
}

interface FloatingMenuProps {
  x: number
  y: number
  actions: Action[]
  onPick: (action: Action) => void
  onDismiss: () => void
}

export function FloatingMenu({ x, y, actions, onPick, onDismiss }: FloatingMenuProps) {
  return (
    <div
      className="wa-menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="wa-menu-item"
          onClick={(e) => {
            e.stopPropagation()
            onPick(action)
          }}
        >
          {(() => {
            const d = ICONS[action.icon ?? ''] ?? ICONS[action.id] ?? ICONS.custom
            return (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={d} />
              </svg>
            )
          })()}
          <span>{action.name}</span>
        </button>
      ))}
    </div>
  )
}
