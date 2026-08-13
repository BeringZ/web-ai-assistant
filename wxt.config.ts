import { defineConfig } from 'wxt'

/**
 * WXT 配置：Manifest V3 浏览器扩展构建框架（v0.4 PDF 阅读版）。
 *
 * - storage：保存 API 配置与自定义 Action
 * - activeTab：popup 打开时自动获得当前标签页一次性访问权（读取 PDF URL）
 * - optional_host_permissions：AI API 域名 / PDF 域名按需运行时授权
 * - action.default_icon：工具栏图标（16/32/48），避免 fallback
 * - icons：扩展管理页图标（含 128）
 */
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'web-translate',
    description: '选中即问：翻译、解释、总结、改写，接入你自己的 AI API',
    permissions: ['storage', 'activeTab'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: {
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
      },
    },
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },
})