/**
 * tests/markdown.test.tsx —— Markdown 渲染器测试
 *
 * 用 renderToString 渲染 Markdown 组件，验证：
 * 1. 代码块被保留且内容转义（XSS 安全）
 * 2. 行内代码 / 粗体 / 链接
 * 3. 列表聚合为 <ul>
 * 4. 恶意 HTML 被转义而非执行
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@/components/markdown'

const render = (text: string) => renderToStaticMarkup(<Markdown text={text} />)

describe('Markdown', () => {
  it('渲染段落与换行', () => {
    expect(render('第一行\n第二行')).toContain('<p>第一行')
    expect(render('第一行\n第二行')).toContain('第二行</p>')
  })

  it('代码块原样保留，内容 HTML 转义', () => {
    const out = render('```ts\nconst x = 1\n```')
    expect(out).toContain('<pre><code>const x = 1</code></pre>')
  })

  it('代码块内恶意标签被转义（XSS 防护）', () => {
    const out = render('```html\n<script>alert(1)</script>\n```')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('行内代码与粗体', () => {
    const out = render('使用 `code` 和 **加粗**')
    expect(out).toContain('<code>code</code>')
    expect(out).toContain('<strong>加粗</strong>')
  })

  it('行内链接 target=_blank 且带安全 rel', () => {
    const out = render('[文档](https://example.com)')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noreferrer noopener"')
  })

  it('连续列表项聚合为 ul', () => {
    const out = render('- 第一项\n- 第二项\n- 第三项')
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>第一项</li>')
    expect(out).toContain('<li>第三项</li>')
    expect(out.indexOf('<ul>')).toBeLessThan(out.indexOf('<li>第一项</li>'))
  })

  it('标题渲染为对应层级', () => {
    expect(render('## 二级标题')).toContain('<h2>二级标题</h2>')
    expect(render('### 三级标题')).toContain('<h3>三级标题</h3>')
  })

  it('普通文本中的 <script> 被转义（整体防 XSS）', () => {
    const out = render('<img src=x onerror=alert(1)>')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('空文本安全渲染', () => {
    expect(render('')).toBe('<div class="wa-md"></div>')
  })
})
