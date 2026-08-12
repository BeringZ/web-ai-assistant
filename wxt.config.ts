import { defineConfig } from 'wxt'

/**
 * WXT 配置：Manifest V3 浏览器扩展构建框架。
 *
 * - 只申请最小权限：storage（保存 API 配置与自定义 Action）
 * - 内容脚本的权限通过 matches 声明为 <all_urls>，默认注入所有页面
 */
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: '网页 AI 助手',
    description: '选中即问：翻译、解释、总结、改写，接入你自己的 AI API',
    version: '0.1.0',
    permissions: ['storage'],
  },
})
