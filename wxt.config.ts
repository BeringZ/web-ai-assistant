import { defineConfig } from 'wxt'

/**
 * WXT 配置：Manifest V3 浏览器扩展构建框架（v0.3 可分发版）。
 *
 * - storage：保存 API 配置与自定义 Action
 * - host_permissions：MV3 下 Service Worker 用 fetch 调用用户配置的
 *   AI API（任意 OpenAI-compatible 端点）必须声明主机权限
 * - icons：工具栏与扩展管理页图标（16/32/48/128 多尺寸）
 */
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: '网页 AI 助手',
    description: '选中即问：翻译、解释、总结、改写，接入你自己的 AI API',
    version: '0.3.0',
    permissions: ['storage'],
    host_permissions: ['https://*/*', 'http://*/*'],
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },
})