import { defineConfig } from 'wxt'

/**
 * WXT 配置：Manifest V3 浏览器扩展构建框架。
 *
 * - storage：保存 API 配置与自定义 Action
 * - host_permissions：MV3 下 Service Worker 用 fetch 调用用户配置的
 *   AI API（任意 OpenAI-compatible 端点）必须声明主机权限，
 *   否则请求会被 CORS 拦截。这是 v0.2 API 调用失效的根因。
 * - 内容脚本的权限通过 matches 声明为 <all_urls>，默认注入所有页面
 */
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: '网页 AI 助手',
    description: '选中即问：翻译、解释、总结、改写，接入你自己的 AI API',
    version: '0.2.1',
    permissions: ['storage'],
    host_permissions: ['https://*/*', 'http://*/*'],
  },
})
