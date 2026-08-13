/**
 * e2e/mock-sse.mjs —— E2E mock server
 *
 * - POST /v1/chat/completions → 分块 SSE（模拟 OpenAI-compatible API）
 * - GET  /test.html          → 测试页面（划词用）
 *
 * 跑：node e2e/mock-sse.mjs   （端口 4014）
 */
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PORT = Number(process.env.MOCK_PORT || 4014)
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

const REPLY = '这是一段 mock 回复。Hello, world. 你好，世界。'

function chunkSSE(text, delayMs = 20) {
  return text
    .split('')
    .map((ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch }, finish_reason: null }] })}\n\n`)
    .concat(['data: [DONE]\n\n'])
}

const TEST_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>E2E Test Page</title>
<style>body{font-size:18px;line-height:1.8;padding:24px;max-width:640px;margin:0 auto}
p{margin:18px 0}</style></head>
<body>
  <h1>Test Page</h1>
  <p id="para1">The quick brown fox jumps over the lazy dog. This is the first paragraph for selection testing.</p>
  <p id="para2">Hello world. This is a longer paragraph that should give enough text to select multiple words and test the floating toolbar behavior across the page.</p>
  <div style="height:900px"></div>
  <p id="para3">Bottom content. The panel should follow the selection even when the page is scrolled.</p>
</body>
</html>`

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  if (req.url === '/test.html' && req.method === 'GET') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.end(TEST_PAGE)
  }

  // E2E PDF fixtures
  if (req.url?.startsWith('/fixtures/') && req.method === 'GET') {
    const name = req.url.split('/').pop()
    const file = path.join(FIXTURES, name)
    try {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/pdf')
      return res.end(readFileSync(file))
    } catch {
      res.statusCode = 404
      return res.end('not found')
    }
  }

  if (req.url?.startsWith('/v1/chat/completions') && req.method === 'POST') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    let i = 0
    const parts = chunkSSE(REPLY)
    const t = setInterval(() => {
      if (i >= parts.length) {
        clearInterval(t)
        return res.end()
      }
      res.write(parts[i++])
    }, 20)
    req.on('close', () => clearInterval(t))
    return
  }

  res.statusCode = 404
  res.end('not found')
})

server.listen(PORT, () => {
  console.log(`mock server on http://127.0.0.1:${PORT}`)
})
