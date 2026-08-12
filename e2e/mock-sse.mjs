/**
 * e2e/mock-sse.mjs —— 最小 OpenAI-compatible API mock server
 *
 * 仅 E2E 使用：接受 /v1/chat/completions，返回分块 "你好！/hello" 之类内容。
 * 跑：node e2e/mock-sse.mjs   （端口 4014）
 */
import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 4014)

const REPLY = '这是一段 mock 回复。Hello, world. 你好，世界。'

function chunkSSE(text, delayMs = 25) {
  // 把文本按字符切成多个 SSE 事件，模拟流式
  return text.split('').map((ch, i) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: ch }, finish_reason: null }] })}\n\n`,
  ).concat(['data: [DONE]\n\n'])
}

const server = http.createServer((req, res) => {
  // CORS 让所有路径允许，便于测试
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
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
    }, 25)
    req.on('close', () => clearInterval(t))
    return
  }

  res.statusCode = 404
  res.end('not found')
})

server.listen(PORT, () => {
  console.log(`mock SSE listening on http://127.0.0.1:${PORT}`)
})