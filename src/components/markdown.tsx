/**
 * components/markdown.tsx —— 轻量 Markdown 渲染器（零依赖、防 XSS）
 *
 * 为什么不引 marked / react-markdown？
 * 1. AI 输出会出现在任意页面，内容不可信 —— 本实现直接把文本当字符串
 *    渲染成 React 节点，**绝不使用 dangerouslySetInnerHTML**，XSS 面为零；
 * 2. 插件体积优先，支持 90% 常见场景足够：代码块 / 行内代码 / 标题 /
 *    粗体斜体删除线 / 列表 / 链接 / 引用 / 分割线；
 * 3. 嵌套语法（粗体里套代码）不支持 —— 故意的，换来的是简单和安全。
 */

import type { ReactNode } from 'react'

/* ---------------- 行内解析 ---------------- */

const INLINE_RE =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g

type InlineToken = {
  kind: 'text' | 'code' | 'bold' | 'italic' | 'strike' | 'link'
  value: string
  href?: string
}

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_RE)) {
    const idx = match.index ?? 0
    if (idx > last) tokens.push({ kind: 'text', value: text.slice(last, idx) })
    const raw = match[0]
    if (raw.startsWith('`')) {
      tokens.push({ kind: 'code', value: raw.slice(1, -1) })
    } else if (raw.startsWith('**')) {
      tokens.push({ kind: 'bold', value: raw.slice(2, -2) })
    } else if (raw.startsWith('*')) {
      tokens.push({ kind: 'italic', value: raw.slice(1, -1) })
    } else if (raw.startsWith('~~')) {
      tokens.push({ kind: 'strike', value: raw.slice(2, -2) })
    } else {
      const link = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(raw)
      tokens.push({ kind: 'link', value: link?.[1] ?? raw, href: link?.[2] })
    }
    last = idx + raw.length
  }
  if (last < text.length) tokens.push({ kind: 'text', value: text.slice(last) })
  return tokens
}

function renderInline(tokens: InlineToken[], keyBase: string): ReactNode[] {
  return tokens.map((t, i) => {
    const key = `${keyBase}-${i}`
    switch (t.kind) {
      case 'code':
        return <code key={key}>{t.value}</code>
      case 'bold':
        return <strong key={key}>{t.value}</strong>
      case 'italic':
        return <em key={key}>{t.value}</em>
      case 'strike':
        return <del key={key}>{t.value}</del>
      case 'link':
        return (
          <a key={key} href={t.href} target="_blank" rel="noreferrer noopener">
            {t.value}
          </a>
        )
      default:
        return t.value
    }
  })
}

/* ---------------- 块级解析 ---------------- */

interface Line {
  kind: 'code-start' | 'code-end' | 'text'
  text: string
}

/** 把整段文本切成"代码块开关 + 普通行"序列 */
function tokenizeLines(text: string): Line[] {
  const lines: Line[] = []
  let inCode = false
  for (const raw of text.split('\n')) {
    if (raw.trim().startsWith('```')) {
      lines.push({ kind: inCode ? 'code-end' : 'code-start', text: '' })
      inCode = !inCode
    } else {
      lines.push({ kind: 'text', text: raw })
    }
  }
  return lines
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const listBuffer: ReactNode[] = []
  let codeBuffer: string[] | null = null
  let blockIdx = 0

  const flushList = () => {
    if (listBuffer.length > 0) {
      // 拷贝一份再清空：JSX 的 children 捕获的是数组引用，
      // 若直接引用原数组，length=0 会让 React 渲染出空 <ul>
      blocks.push(<ul key={`ul-${blockIdx++}`}>{[...listBuffer]}</ul>)
      listBuffer.length = 0
    }
  }

  for (const line of tokenizeLines(text)) {
    if (line.kind === 'code-start') {
      flushList()
      codeBuffer = []
      continue
    }
    if (line.kind === 'code-end') {
      if (codeBuffer) {
        blocks.push(
          <pre key={`pre-${blockIdx++}`}>
            <code>{codeBuffer.join('\n')}</code>
          </pre>,
        )
        codeBuffer = null
      }
      continue
    }
    if (codeBuffer) {
      codeBuffer.push(line.text)
      continue
    }

    // 普通行：先看是不是列表项，是则累积，否则 flush 后按类型渲染
    const li = parseListItem(line.text)
    if (li) {
      listBuffer.push(
        <li key={`li-${blockIdx}-${listBuffer.length}`}>
          {renderInline(tokenizeInline(li), `li-${blockIdx}`)}
        </li>,
      )
      continue
    }
    flushList()
    blocks.push(...renderBlock(line.text, blockIdx))
    blockIdx += 1
  }

  flushList()

  // 未闭合的代码块：当作纯文本输出，避免内容丢失
  if (codeBuffer) {
    blocks.push(
      <pre key={`pre-${blockIdx}`}>
        <code>{codeBuffer.join('\n')}</code>
      </pre>,
    )
  }

  return <div className="wa-md">{blocks}</div>
}

/** 尝试把一行解析为列表项文本；不是列表项返回 null */
function parseListItem(raw: string): string | null {
  const line = raw.trim()
  const ul = /^[-*+]\s+(.+)$/.exec(line)
  if (ul) return ul[1]!
  const ol = /^\d+[.)]\s+(.+)$/.exec(line)
  if (ol) return ol[1]!
  return null
}

/** 渲染一个非列表的块级元素 */
function renderBlock(raw: string, idx: number): ReactNode[] {
  const line = raw.trim()
  if (!line) return []

  const heading = /^(#{1,4})\s+(.+)$/.exec(line)
  if (heading) {
    const Tag = `h${heading[1]!.length}` as 'h1' | 'h2' | 'h3' | 'h4'
    return [<Tag key={idx}>{renderInline(tokenizeInline(heading[2]!), `h${idx}`)}</Tag>]
  }

  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
    return [<hr key={idx} />]
  }

  if (line.startsWith('> ')) {
    return [
      <blockquote key={idx}>{renderInline(tokenizeInline(line.slice(2)), `q${idx}`)}</blockquote>,
    ]
  }

  return [<p key={idx}>{renderInline(tokenizeInline(line), `p${idx}`)}</p>]
}
