/**
 * actions/template.ts —— Action Prompt 模板渲染
 *
 * 模板语法：{{变量名}}。支持变量：
 *   {{selection}} {{context}} {{url}} {{title}} {{question}}
 *
 * 设计决策：
 * - 未知变量替换为空字符串，而不是报错 —— 这样用户写错变量名
 *   只会得到空内容，不会让整个功能崩溃（宽容式失败）。
 * - {{question}} 未填时同样置空，所以"提问"Action 在不传问题时
 *   退化为"基于选中内容自由对话"，行为自然。
 */

export interface TemplateVars {
  selection: string
  context: string
  url: string
  title: string
  question?: string
  /** 选区来源：web / pdf（网页时为空） */
  source?: string
  /** PDF 页码（网页时为空） */
  page?: string
  /** PDF 总页数（网页时为空） */
  pageCount?: string
}

const VAR_RE = /\{\{\s*([a-zA-Z]+)\s*\}\}/g

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(VAR_RE, (match, name: string) => {
    const value = (vars as unknown as Record<string, string | undefined>)[name]
    return value ?? ''
  })
}
