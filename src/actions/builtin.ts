/**
 * actions/builtin.ts —— 内置 Actions
 *
 * 这些就是"翻译/解释/总结/改写/提问"五个内置操作。
 * 注意：它们只是数据，不是代码分支 —— 提示词想改就直接改这里的字符串，
 * 不需要动任何流程逻辑。这就是"功能 = 数据"的体现。
 *
 * 团队可以在这里用「改配置的方式」快速扩展新内置操作，
 * 也可以在 Options 页添加自定义 Action（不碰代码）。
 */
import type { Action } from '@/core/types'

export const BUILTIN_ACTIONS: Action[] = [
  {
    id: 'translate',
    name: '翻译',
    builtin: true,
    prompt: [
      '请将下面的内容翻译成简体中文。',
      '要求：',
      '1. 忠实原文，不添加解释；',
      '2. 保持原文的格式与语气；',
      '3. 如果原文已经是中文，请指出并保持原样。',
      '',
      '{{selection}}',
    ].join('\n'),
  },
  {
    id: 'explain',
    name: '解释',
    builtin: true,
    prompt: [
      '请用通俗易懂的语言解释下面的内容。',
      '要求：',
      '1. 先一句话概括核心含义；',
      '2. 再分点拆解关键概念；',
      '3. 适当举例帮助理解；',
      '4. 中文回答。',
      '',
      '{{selection}}',
    ].join('\n'),
  },
  {
    id: 'summarize',
    name: '总结',
    builtin: true,
    prompt: [
      '请用简洁的要点总结下面的内容。',
      '要求：',
      '1. 使用 Markdown 无序列表；',
      '2. 每条要点不超过一行；',
      '3. 提炼事实与结论，不做评价；',
      '4. 中文回答。',
      '',
      '{{selection}}',
    ].join('\n'),
  },
  {
    id: 'rewrite',
    name: '改写',
    builtin: true,
    prompt: [
      '请改写下面的内容。',
      '要求：',
      '1. 保留原意不变；',
      '2. 使表达更清晰、更专业、更简洁；',
      '3. 直接输出改写结果，不要任何前缀说明；',
      '4. 保持原语言。',
      '',
      '{{selection}}',
    ].join('\n'),
  },
  {
    id: 'ask',
    name: '提问',
    builtin: true,
    prompt: [
      '下面是用户选中的内容：',
      '',
      '{{selection}}',
      '',
      '请回答用户的这个问题（中文回答）：',
      '{{question}}',
    ].join('\n'),
  },
]

/** 根据 id 查内置 action（找不到返回 undefined） */
export function findBuiltinAction(id: string): Action | undefined {
  return BUILTIN_ACTIONS.find((a) => a.id === id)
}
