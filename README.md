# web-translate

> 网页划词 AI 翻译与理解工具。

> 选中网页文字，直接调用**你自己的 AI API** 翻译、解释、总结、改写、提问。
> 无需复制粘贴、无需切换页面。BYOK（Bring Your Own Key）。

> Demo GIF 在 headed Chrome 下由 `node scripts/generate-demo-gif.mjs` 生成（headless 模式加载扩展受限于浏览器）。此处展示产品形态，完整交互需本地装上扩展体验。

---

## 能做什么

- ✓ **翻译**：单词走本地词库（含音标/词性/释义），语段走 AI
- ✓ **解释 / 总结 / 改写 / 提问**：5 个内置操作，Prompt 模板可改
- ✓ **自定义操作**：把任何常用 Prompt 模板保存到设置里（不需要写代码）
- ✓ **收藏**：结果面板一键收藏，AI 输出积累成你自己的知识库
- ✓ **本地词库**：内置 140+ 常见词，AI 翻译过的生词自动加入，下次秒出
- ✓ **导入导出**：词库与收藏可备份 / 迁移到其他设备
- ✓ **PDF 阅读模式**：论文、资料直接在扩展里阅读并划词提问（自带阅读器）

---

## 安装

朋友不需要 Node / npm / 任何开发工具。三个步骤：

1. 打开 [Releases](https://github.com/BeringZ/web-ai-assistant/releases) 下载最新的 `web-translate-chrome-v0.3.1.zip`
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

## PDF 阅读

Chrome 自带的 PDF 查看器无法注入扩展，因此 web-translate 提供自己的 PDF 阅读模式（基于 PDF.js，不依赖浏览器内置查看器）。

使用：

1. 浏览器打开一个 PDF（如论文 / 资料）
2. 点击工具栏的 web-translate 图标
3. 点击「用 web-translate 打开」
4. 在 PDF 中**划词**，选择 翻译 / 解释 / 总结 / 改写 / 提问

阅读器支持：上一页/下一页（← →）、缩放（Ctrl + / -）、适应宽度、查看原 PDF。

上下文级别：工具栏可选「仅选中 / 当前页 / 前后页」——前后页会作为上下文发给 AI（自动截断，避免 Token 暴涨），自定义 Action 里也可用 `{{page}}` / `{{pageCount}}` / `{{source}}` 变量。

> **当前支持**：带文字层的 PDF（绝大多数电子版论文/文档）
>
> **暂不支持**：扫描图片型 PDF 的 OCR（页面会明确提示，而不是静默失败）

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
- **不会**发送给项目作者 —— 本项目没有自己的服务器。选中的内容只会发送到你配置的 AI API（该请求本身会携带 API Key 用于鉴权，这是 API 调用所必需的）
- v0.3 起，密钥与其它设置在存储层就是分开的两个 key（`provider_settings` / `public_settings`），降低被误读的可能性

---

## 常见问题

**Q：和直接用 ChatGPT 比有什么区别？**
A：不用切换页面，不用复制粘贴——选中即用。数据只在你和自配的 AI API 之间流动，不经过任何第三方中转。

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

---

## 架构（v0.5 Selection Core）

所有文字来源统一收敛为 **SelectionSnapshot**，AI 链路完全不知道文字从哪来：

```
WebSelectionSource ─┐
InputSelectionSource├→ SelectionSnapshot → ContextBuilder → Action → RunClient → Provider → Result
PdfSelectionSource ─┘
```

- `selection/`：快照模型、跨 Shadow DOM 遍历、语义段落上下文（before/current/after）
- `core/runClient.ts`：网页 / PDF / 输入框共用同一条执行链路（requestId 防串流 + 状态机）
- `core/runErrors.ts`：结构化错误（code / 动作按钮），不再是一行红字
- 输入框（input/textarea）内划词同样可用翻译/解释/改写
