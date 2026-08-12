/**
 * scripts/generate-icons.mjs —— 从 assets/icon.svg 生成各尺寸扩展图标
 * 用法：node scripts/generate-icons.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8')
const outDir = path.join(root, 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const html = `<!DOCTYPE html><html><body style="margin:0;background:transparent"><img src="${dataUri}" style="width:128px;height:128px;display:block"/></body></html>`
const htmlPath = path.join(root, '.tmp-icon.html')
fs.writeFileSync(htmlPath, html)

const browser = await chromium.launch()
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.goto(`file://${htmlPath}`)
    await page.screenshot({ path: path.join(outDir, `icon-${size}.png`) })
    await page.close()
    console.log(`icon-${size}.png`)
  }
} finally {
  await browser.close()
  fs.unlinkSync(htmlPath)
}
console.log('done:', outDir)
