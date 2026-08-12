/**
 * tests/template.test.ts —— Action 模板渲染测试
 */
import { describe, expect, it } from 'vitest'
import { renderTemplate } from '@/actions/template'

const vars = {
  selection: 'hello world',
  context: '...context...',
  url: 'https://example.com',
  title: 'Example',
}

describe('renderTemplate', () => {
  it('替换全部内置变量', () => {
    const out = renderTemplate('选中：{{selection}}\n上下文：{{context}}\n来源：{{title}} ({{url}})', vars)
    expect(out).toContain('选中：hello world')
    expect(out).toContain('上下文：...context...')
    expect(out).toContain('来源：Example (https://example.com)')
  })

  it('容忍变量名两侧的空白', () => {
    expect(renderTemplate('{{ selection }}', vars)).toBe('hello world')
  })

  it('未知变量替换为空字符串（宽容式失败）', () => {
    expect(renderTemplate('x{{unknown}}y', vars)).toBe('xy')
  })

  it('question 未提供时置空，Ask 模板可安全渲染', () => {
    const out = renderTemplate('{{selection}}\n问：{{question}}', { ...vars })
    expect(out).toBe('hello world\n问：')
  })

  it('question 提供时正常填充', () => {
    const out = renderTemplate('问：{{question}}', { ...vars, question: '这是什么？' })
    expect(out).toBe('问：这是什么？')
  })

  it('没有变量的模板原样输出', () => {
    expect(renderTemplate('纯文本', vars)).toBe('纯文本')
  })
})
