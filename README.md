# 网页 AI 助手（Web AI Assistant）

> **v0.2.1** — 稳定性修复版：API 权限、面板吸附定位、滚动跟随、自定义 Action 修复。

> 在网页中选中文字，一键调用**你自己的 AI API** 完成翻译、解释、总结、改写、提问。
> 把「复制 → 切到 AI → 粘贴 → 写提示词」变成「选中 → 点击 → 得到结果」。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | WXT 0.21（构建 + 开发服务器） |
| 语言 | TypeScript（strict 模式） |
| UI | React 19 + Shadow DOM 隔离 |
| 规范 | Manifest V3（Chrome / Edge / Firefox 通用） |
| 测试 | Vitest（核心纯逻辑单测） |

## 核心架构：四层解耦

整个插件围绕四个概念，**互不耦合**，新增功能 = 加模块，不重写插件：

```
Selection（选中内容）  →  Action（Prompt 模板）  →  Provider（AI 提供商）  →  Renderer（结果渲染）
src/selection/           src/actions/               src/providers/           src/components/
```

```
网页
  ↓ 用户选中文字
Content Script（src/entrypoints/content.tsx）
  ↓ 弹悬浮菜单 → 组装 RunRequest
  ↓ chrome.runtime.connect（Port 长连接，支持流式）
Service Worker（src/entrypoints/background.ts）—— 唯一的网络出口，API Key 只在这里
  ↓ Action 模板渲染 + Provider 流式调用
用户 AI API（OpenAI-compatible，SSE 流式返回）
  ↓ 逐 chunk 推回
页面内 ResultPanel 打字机渲染（可复制 / 重试 / 停止 / 关闭）
```

### 关键设计决策（团队必读）

1. **功能 = 数据**。翻译/解释/总结/改写全是 Prompt 模板（`src/actions/builtin.ts`），
   不是代码分支。改提示词 = 改字符串；新增功能 = Options 页加一条自定义 Action，
   连代码都不用碰。模板变量：`{{selection}}` `{{context}}` `{{url}}` `{{title}}` `{{question}}`。
2. **流式用 Port 长连接**，不用一次性 `sendMessage`。只有 Port 能表达
   "逐块推送 + 中途可中止"。
3. **API Key 的类型级隔离**。`src/core/storage.ts` 只给 Content Script 暴露
   `getContentContext()`（不含 provider 字段），密钥在物理上无法被 Content Script 读取。
4. **Shadow DOM + isolateEvents**。UI 样式不受页面 CSS 污染；UI 内事件不会冒泡
   触发页面脚本，页面脚本也不会误伤我们的悬浮层。
5. **选区快照（Range）**。菜单弹出瞬间 cloneRange，用户点击菜单时页面可能已
   clearSelection，用快照保证内容不丢。
6. **防 XSS 的 Markdown 渲染**。`components/markdown.tsx` 零依赖、纯 React 节点，
   全程不用 `dangerouslySetInnerHTML`。

## 目录结构

```
src/
├── entrypoints/            # WXT 入口
│   ├── background.ts       # Service Worker：消息路由 + 网络出口
│   ├── content.tsx         # Content Script：选区监听 + UI 协调
│   └── options/            # 设置页（API 配置 + 自定义 Action）
├── core/                   # 领域模型 / 存储 / 消息协议（三端共享契约）
│   ├── types.ts
│   ├── storage.ts
│   └── messaging.ts
├── actions/                # Action 层：模板渲染 + 内置 + 自定义管理
├── providers/              # Provider 层：AIProvider 接口 + OpenAI-compatible
├── selection/              # Selection 层：选区提取 + 上下文抓取
└── components/             # Renderer 层：悬浮菜单 / 结果面板 / Markdown
tests/                      # 单测：模板 / SSE 流式 / Markdown 渲染
```

## 开发命令

```bash
npm install        # 安装依赖（自动 wxt prepare 生成类型）
npm run dev        # 开发模式（自动打开浏览器 + 热更新）
npm run build      # 生产构建 → .output/chrome-mv3/
npm run compile    # TypeScript 类型检查
npm test           # 运行单测
npm run zip        # 打包发布 zip
```

**加载到浏览器**（开发调试）：
1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3/` 目录

## 使用

1. 点击工具栏插件图标，在弹出的设置界面填写 API 配置，点「测试连接」。
   支持任意 OpenAI-compatible 端点：OpenAI / DeepSeek / Moonshot / GLM / SiliconFlow / 本地 vLLM。
   （点「完整设置 ↗」可打开独立选项页。）
2. 在任意网页选中文字 → 出现悬浮菜单 → 点击 翻译/解释/总结/改写/提问。
3. 结果紧贴选中内容旁流式输出，支持 收藏 / 复制 / 重试 / 停止 / 关闭（Esc）。

### 翻译单个英文词 = 本地词库优先

选中**单个英文词**点「翻译」时：
1. 先查内置本地词库（`src/dictionary/data.json`，含 发音/词性/释义）——命中直接输出，**不消耗 API Token**；
2. 未命中才走 AI，且要求按词典格式输出（音标 + 词性 + 常见释义）；
3. 选中语段则走普通翻译模板。

扩充词库只需编辑 `data.json`（注意保持 JSON 合法）。

### 收藏

结果面板点「收藏」把 原文/结果/操作/来源 存入本地；已收藏的显示「已收藏」，再点取消。
数据存在 `chrome.storage.local` 的 `collections` 键下（上限 300 条），后续可做收藏管理页。

### 设置项

- **AI API 配置**：Base URL / API Key / Model / Temperature / Max Tokens + 测试连接
- **默认上下文**：仅选中 / 附近文字 / 当前章节 / 整篇文章
- **操作管理**：内置 5 个操作可编辑、可恢复默认；自定义操作可增删改

## 自定义 Action 示例（无需改代码）

| 名称 | Prompt 模板 |
| --- | --- |
| 分析投资含义 | 请从投资角度分析下面的内容，指出对持仓的影响，{{selection}} |
| 解释代码 | 请逐行解释这段代码的作用和潜在问题：\n\n{{selection}} |
| 提取知识点 | 请从下面的内容中提取 5 个核心知识点，用列表输出：\n\n{{selection}} |
| 生成 Anki | 请基于下面的内容生成 Anki 卡片（正面/背面格式）：\n\n{{selection}} |

## 后续扩展指引（策划文档第六步之后）

- **新 Provider**（Claude/Gemini/Ollama）：实现 `AIProvider` 接口 → `providers/index.ts`
  工厂加分支 → 设置页加 Provider 类型选择。
- **新渲染形态**（侧边栏连续问答）：把 `ResultPanel` 组件原样复用进侧边栏 UI，
  状态机（ask/streaming/done/error）已为此设计好。
- **代码块/表格/图片理解**：在 `Selection` 层扩展 payload 类型，模板变量相应增加。
- **不建议做**（MVP 之后再说）：网页 Agent、账号系统、云同步、知识库/RAG。
