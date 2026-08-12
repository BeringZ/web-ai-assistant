# 网页 AI 助手（Web AI Assistant）

> 选中网页文字，直接调用**你自己的 AI API** 翻译、解释、总结、改写、提问。
> 无需复制粘贴、无需切换 ChatGPT 页面。BYOK（Bring Your Own Key），密钥只留在你的浏览器里。

> Demo GIF 在 headed Chrome 下由 `node scripts/generate-demo-gif.mjs` 生成（headless 模式加载扩展受限于浏览器）。此处展示产品形态，完整交互需本地装上扩展体验。

---

## 能做什么

- ✓ **翻译**：单词走本地词库（含音标/词性/释义），语段走 AI
- ✓ **解释 / 总结 / 改写 / 提问**：5 个内置操作，Prompt 模板可改
- ✓ **自定义操作**：把任何常用 Prompt 模板保存到设置里（不需要写代码）
- ✓ **收藏**：结果面板一键收藏，AI 输出积累成你自己的知识库
- ✓ **本地词库**：内置 140+ 常见词，AI 翻译过的生词自动加入，下次秒出
- ✓ **导入导出**：词库与收藏可备份 / 迁移到其他设备

---

## 安装

朋友不需要 Node / npm / 任何开发工具。三个步骤：

1. 打开 [Releases](https://github.com/BeringZ/web-ai-assistant/releases) 下载最新的 `web-ai-assistant-chrome-v0.3.0.zip`
2. 解压到任意文件夹
3. 打开 Chrome → 地址栏输入 `chrome://extensions`
   - 打开右上角「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择刚才解压出的 `chrome-mv3` 文件夹

成功后工具栏会出现图标。

> Edge 用户步骤相同（扩展管理页路径 `edge://extensions`）。

---

## 第一次配置

点击工具栏图标，弹出的窗口会引导你：

1. 填入 `Base URL`、`API Key`、`Model`
2. 点「**测试并保存**」（按钮一步完成测试连接 + 保存，避免"测试成功忘保存"）
3. 设置成功，打开任意网页开始用

支持的 API：任何 OpenAI-compatible 端点：

| 提供方 | Base URL 样例 |
| --- | --- |
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Moonshot | `https://api.moonshot.cn/v1` |
| GLM（智谱） | `https://open.bigmodel.cn/api/paas/v4` |
| SiliconFlow | `https://api.siliconflow.cn/v1` |
| 本地 vLLM / Ollama | `http://127.0.0.1:8000/v1` |

模型示例：`gpt-4o-mini` / `deepseek-chat` / `moonshot-v1-8k` 等。

---

## 使用方法

1. 打开任意网页
2. **选中** 文字（单词 / 句子 / 多段）
3. 出现悬浮菜单 → 点击 翻译 / 解释 / 总结 / 改写 / 提问
4. 结果面板紧贴选区**下方**流式输出（打字机效果）
5. 面板支持：复制 / 收藏 / 重试 / 停止 / 关闭（Esc）

### 翻译小贴士

- 选中**单个英文词**会优先查本地词库（秒出），未命中才走 AI，且 AI 翻译过的生词会**自动入库**——你翻译越多，词库越丰富
- 选中**语段**走 AI 翻译
- 翻译过的同一内容**会自动缓存**，下次选中秒出（"重试"按钮强制刷新）

---

## 自定义 Action

设置 → 「操作管理」→ 「+ 新增自定义」，填：

- **名称**：在悬浮菜单里显示的文字
- **Prompt 模板**：支持变量 `{{selection}}`（选中内容）、`{{context}}`（附近上下文）、`{{url}}`、`{{title}}`、{{question}}（提问）

| 场景 | 名称 | Prompt 模板 |
| --- | --- | --- |
| 投资视角 | 分析投资含义 | 请从投资角度分析下面的内容，指出对持仓的影响：{{selection}} |
| 代码解读 | 解释代码 | 请逐行解释这段代码的作用和潜在问题：\n\n{{selection}} |
| 抽知识点 | 提取知识点 | 请从下面的内容中提取 5 个核心知识点，用列表输出：\n\n{{selection}} |

内置的「翻译 / 解释 / 总结 / 改写 / 提问」也能编辑甚至"恢复默认"。

---

## 隐私和权限

> **为什么需要这么多网页权限？**
>
> 浏览器扩展的 manifest 必须**预先声明**它将注入哪些网页。我们声明 `<all_urls>` 是因为工具栏功能需要在你打开的任何页面上工作。

插件在**任何时刻都不会自动**把网页内容发送给 AI。**只有**当你主动：

1. 选中文字
2. 点击 翻译 / 解释 / 总结 / 改写 / 提问 中的任意一个操作

才会把你**选中的那段文字**（以及你设置的附近上下文范围）发到你配置的 AI API。

### API Key 存哪儿？

- 存在你**本机浏览器**的扩展存储（`chrome.storage.local`）
- **不会**进入网页 Content Script（从 API 层面就无法进入）
- **不会**离开你的电脑，只发给你填写的 API Base URL
- v0.3 起，密钥与其它设置在存储层就是分开的两个 key（`provider_settings` / `public_settings`），降低被误读的可能性

---

## 常见问题

**Q：和直接用 ChatGPT 比有什么区别？**
A：不用切换页面，不用复制粘贴，不用"对话 5 轮才理解我的意思"——选中即用，且数据不经过第三方。

**Q：支持哪些语言？**
A：翻译取决于你用的 AI 模型。任何语言都能"解释 / 总结 / 改写"。本地词库目前是英文→中文。

**Q：能看 Markdown / 代码吗？**
A：能。结果面板会渲染 Markdown（粗体/列表/代码块/链接等）并保证零 XSS（不直接用 innerHTML）。

**Q：清除浏览器数据会不会丢设置？**
A：清除浏览器数据会一并清除扩展存储，请提前在设置 → 「收藏」/「词库」用导出功能备份。

**Q：Firefox / Safari 呢？**
A：v0.3 的 GitHub Release 也会提供 Firefox ZIP（基于 WXT 的 firefox target 构建）。

---

## 开发者文档

克隆仓库、安装依赖、跑开发模式：

```bash
git clone https://github.com/BeringZ/web-ai-assistant.git
cd web-ai-assistant
npm install
npm run dev          # 开发模式 + 热更新
```

### 命令

```bash
npm run compile      # TypeScript 类型检查
npm test             # 单元测试（46 个）
npm run build        # 生产构建 → .output/chrome-mv3/
npm run zip          # 生成发布 zip（wxt zip）
npm run icons        # 从 assets/icon.svg 重新生成图标（需 Playwright）
```

### 架构（50 字）

四层解耦：Selection（选区提取）→ Action（Prompt 模板）→ Provider（AI 调用）→ Renderer（结果面板）。

新增功能 = 在对应模块加代码或加 Action 模板，**不需要改其它层**。

### License

MIT