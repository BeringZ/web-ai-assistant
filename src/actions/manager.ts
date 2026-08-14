/**
 * actions/manager.ts —— Action 汇总与自定义 Action 管理
 *
 * 菜单上显示的 actions = 内置 actions（应用覆盖）+ 自定义 actions。
 * - 内置 Action 的 name/prompt 可被用户编辑（actionOverrides 覆盖），恢复默认 = 删覆盖
 * - 自定义 Action 的增删改只操作 chrome.storage（经 storage 层）
 * Content Script 无需知道区别 —— 对 UI 来说它们都是 Action。
 */
import type { Action, ActionIcon, ActionOverride, ContextLevel, PublicSettings } from '@/core/types'
import { BUILTIN_ACTIONS } from './builtin'

export type ActionOverrides = PublicSettings['actionOverrides']

/** 汇总菜单要显示的 actions：内置在前（应用覆盖），自定义在后 */
export function collectActions(customActions: Action[], overrides: ActionOverrides = {}): Action[] {
  const builtin = BUILTIN_ACTIONS.map((action) => applyOverride(action, overrides[action.id]))
  return [...builtin, ...customActions]
}

/** 通过 id 找到可执行的 action（内置应用覆盖后 / 自定义） */
export function findAction(
  customActions: Action[],
  id: string,
  overrides: ActionOverrides = {},
): Action | undefined {
  return collectActions(customActions, overrides).find((a) => a.id === id)
}

/** 应用内置 Action 覆盖（只覆盖用户改过的字段） */
function applyOverride(action: Action, override: ActionOverride | undefined): Action {
  if (!override) return action
  return {
    ...action,
    name: override.name ?? action.name,
    prompt: override.prompt ?? action.prompt,
  }
}

/** 新增自定义 action（id 用 uuid，避免与内置冲突） */
export function createCustomAction(
  name: string,
  prompt: string,
  v2: { icon?: ActionIcon; contextLevel?: ContextLevel; format?: 'markdown' | 'plain' } = {},
): Action {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || '未命名',
    prompt,
    builtin: false,
    ...(v2.icon ? { icon: v2.icon } : {}),
    ...(v2.contextLevel ? { context: { level: v2.contextLevel } } : {}),
    ...(v2.format ? { output: { format: v2.format } } : {}),
  }
}
