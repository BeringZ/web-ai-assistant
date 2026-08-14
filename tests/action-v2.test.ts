/**
 * tests/action-v2.test.ts —— Action v2 测试
 *
 * 覆盖：resolveContextLevel 优先级（action → 全局 → nearby）、
 * createCustomAction v2 字段、模板预设完整性。
 */
import { describe, expect, it } from 'vitest'
import { resolveContextLevel } from '@/core/types'
import { createCustomAction } from '@/actions/manager'
import { ACTION_TEMPLATES } from '@/actions/templates'

describe('resolveContextLevel（上下文决策优先级）', () => {
  it('Action.context.level 优先于全局', () => {
    expect(resolveContextLevel({ context: { level: 'section' } } as never, 'nearby')).toBe('section')
  })

  it('Action 未配置 → 用全局', () => {
    expect(resolveContextLevel({} as never, 'article')).toBe('article')
  })

  it('全局也未配置 → 默认 nearby', () => {
    expect(resolveContextLevel({} as never, undefined)).toBe('nearby')
    expect(resolveContextLevel(undefined, undefined)).toBe('nearby')
  })

  it('内置翻译固定 nearby（不受全局影响）', () => {
    expect(resolveContextLevel({ context: { level: 'nearby' } } as never, 'article')).toBe('nearby')
  })
})

describe('createCustomAction（v2 字段）', () => {
  it('基础创建 → 无 v2 字段', () => {
    const a = createCustomAction('测试', 'prompt')
    expect(a.icon).toBeUndefined()
    expect(a.context).toBeUndefined()
    expect(a.output).toBeUndefined()
  })

  it('带 v2 字段创建', () => {
    const a = createCustomAction('测试', 'prompt', { icon: 'explain', contextLevel: 'section', format: 'plain' })
    expect(a.icon).toBe('explain')
    expect(a.context?.level).toBe('section')
    expect(a.output?.format).toBe('plain')
  })
})

describe('ACTION_TEMPLATES（模板预设）', () => {
  it('提供 ≥8 个模板，且每个都有名称 / Prompt / 图标', () => {
    expect(ACTION_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    for (const t of ACTION_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.prompt.length).toBeGreaterThan(0)
      expect(t.icon).toBeTruthy()
      expect(t.prompt).toContain('{{selection}}')
    }
  })

  it('模板 id 唯一', () => {
    const ids = new Set(ACTION_TEMPLATES.map((t) => t.id))
    expect(ids.size).toBe(ACTION_TEMPLATES.length)
  })
})
