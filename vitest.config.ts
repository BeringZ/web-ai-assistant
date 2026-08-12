import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 单测配置：纯逻辑层测试（模板渲染 / SSE 解析 / Markdown 渲染）。
 * 不测浏览器 API —— 那部分用 wxt/testing + fake browser 另立测试。
 *
 * 注意：alias 必须用 fileURLToPath 解码，直接 .pathname 在路径含中文
 * （如"插件"）时会返回百分号编码，导致模块找不到。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
