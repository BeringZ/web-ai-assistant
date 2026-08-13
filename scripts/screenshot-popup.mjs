/**
 * scripts/screenshot-popup.mjs —— 截图 popup 实际渲染（注入 mock storage）
 */
import { chromium } from 'playwright'

const ROOT = process.cwd()
const URL = `file://${ROOT}/.output/chrome-mv3/popup.html`

const mockStorage = (provider, pub) => `
  window.chrome = {
    storage: {
      local: {
        get: () => Promise.resolve({ provider_settings: ${JSON.stringify(provider)}, public_settings: ${JSON.stringify(pub)} }),
        set: () => Promise.resolve(),
        remove: () => Promise.resolve(),
      }
    },
    runtime: { getURL: (p) => 'chrome-extension://x/' + p, openOptionsPage: () => {}, sendMessage: () => Promise.resolve({ok:true,message:''}), connect: () => ({}) },
    permissions: { contains: () => Promise.resolve(true), request: () => Promise.resolve(true) },
    tabs: { query: () => Promise.resolve([]) }
  };
`

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 800, height: 700 } })

// 未配置
let page = await ctx.newPage()
await page.addInitScript(mockStorage(
  { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat', temperature: 0.7, maxTokens: 2048 },
  { contextLevel: 'nearby', actions: [], actionOverrides: {}, panelCloseMode: 'manual' },
))
await page.goto(URL)
await page.waitForTimeout(1000)
let size = await page.evaluate(() => {
  const r = document.querySelector('.popup')?.getBoundingClientRect()
  return r ? `${r.width.toFixed(0)}x${r.height.toFixed(0)}` : 'no .popup'
})
console.log('Setup popup rect:', size)
await page.screenshot({ path: '.tmp-popup-setup.png' })

// 已配置
page = await ctx.newPage()
await page.addInitScript(mockStorage(
  { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-xxx', model: 'deepseek-chat', temperature: 0.7, maxTokens: 2048 },
  { contextLevel: 'nearby', actions: [], actionOverrides: {}, panelCloseMode: 'manual' },
))
await page.goto(URL)
await page.waitForTimeout(1000)
size = await page.evaluate(() => {
  const r = document.querySelector('.popup')?.getBoundingClientRect()
  return r ? `${r.width.toFixed(0)}x${r.height.toFixed(0)}` : 'no .popup'
})
console.log('Overview popup rect:', size)
await page.screenshot({ path: '.tmp-popup-overview.png' })

await b.close()