/**
 * actions/templates.ts —— 自定义 Action 模板预设
 *
 * 用户"添加 Action → 选模板 → 微调 Prompt"，比从空白写更友好。
 * 模板是数据（prompt + 建议 icon / context / format），不包含任何执行逻辑。
 */
import type { ActionIcon, ContextLevel } from '@/core/types'

export interface ActionTemplate {
  id: string
  name: string
  description: string
  prompt: string
  icon: ActionIcon
  context?: { level?: ContextLevel }
  output?: { format?: 'markdown' | 'plain' }
}

export const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    id: 'translate',
    name: '翻译',
    description: '翻译成简体中文（保留原语气）',
    icon: 'translate',
    context: { level: 'nearby' },
    output: { format: 'plain' },
    prompt: ['请将下面的内容翻译成简体中文。', '要求：', '1. 忠实原文，不添加解释；', '2. 保持原文的格式与语气。', '', '{{selection}}'].join('\n'),
  },
  {
    id: 'terminology',
    name: '术语解释',
    description: '解释专业术语，给出上下文含义',
    icon: 'explain',
    context: { level: 'nearby' },
    prompt: ['请解释下面这个术语在本段上下文中的具体含义：', '', '术语：{{selection}}', '', '上下文：', '{{context}}', '', '要求：先给一句话直译，再结合上下文展开。'].join('\n'),
  },
  {
    id: 'simple-explain',
    name: '简单解释',
    description: '用大白话解释（小学生也能懂）',
    icon: 'explain',
    context: { level: 'nearby' },
    prompt: ['请用最简单的语言解释下面内容，就像讲给初中生听：', '', '{{selection}}'].join('\n'),
  },
  {
    id: 'tech-explain',
    name: '技术解释',
    description: '深入技术细节解释',
    icon: 'explain',
    context: { level: 'section' },
    prompt: ['请从技术角度深入解释下面内容，包括原理、机制与常见坑：', '', '{{selection}}', '', '相关上下文：', '{{context}}'].join('\n'),
  },
  {
    id: 'summarize',
    name: '总结',
    description: '提取要点，分条列出',
    icon: 'summary',
    context: { level: 'section' },
    prompt: ['请总结下面内容的要点，用简洁的分条列表输出：', '', '{{selection}}', '', '背景上下文：', '{{context}}'].join('\n'),
  },
  {
    id: 'rewrite',
    name: '改写',
    description: '改写得更流畅 / 更正式',
    icon: 'rewrite',
    context: { level: 'nearby' },
    output: { format: 'plain' },
    prompt: ['请改写下面的内容，让表达更流畅自然，保留原意：', '', '{{selection}}'].join('\n'),
  },
  {
    id: 'correct',
    name: '纠错',
    description: '修正语法 / 拼写错误',
    icon: 'rewrite',
    context: { level: 'nearby' },
    output: { format: 'plain' },
    prompt: ['请修正下面内容的语法和拼写错误，只输出修正后的文本：', '', '{{selection}}'].join('\n'),
  },
  {
    id: 'key-points',
    name: '提取关键点',
    description: '从长文本提取关键信息',
    icon: 'summary',
    context: { level: 'article' },
    prompt: ['请从下面内容中提取关键信息点，按重要性排序输出：', '', '{{selection}}', '', '完整上下文：', '{{context}}'].join('\n'),
  },
  {
    id: 'counterpoint',
    name: '反方观点',
    description: '给出相反立场的思考',
    icon: 'question',
    context: { level: 'section' },
    prompt: ['请针对下面观点给出有力的反方立场和反驳理由：', '', '{{selection}}'].join('\n'),
  },
  {
    id: 'code-explain',
    name: '代码解释',
    description: '逐行解释代码逻辑',
    icon: 'custom',
    context: { level: 'nearby' },
    prompt: ['请解释下面的代码：功能是什么、每部分做什么、有无潜在问题：', '', '```', '{{selection}}', '```'].join('\n'),
  },
]
