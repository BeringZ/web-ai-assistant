/**
 * providers/types.ts —— AI Provider 抽象
 *
 * Provider 是"四层解耦"中的第三层：负责把 messages 变成流式文本。
 * 以后加 Claude / Gemini / Ollama，只需要新写一个实现该接口的类，
 * 在 providers/index.ts 的工厂里注册 —— 其他三层零改动。
 */

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  /** 中断信号：用户点"停止"或关闭面板时由 background 触发 abort */
  signal?: AbortSignal
}

export interface AIProvider {
  /** 唯一标识，如 'openai-compatible' */
  readonly id: string
  /**
   * 发起一次流式对话。返回异步迭代器，每段是一个文本增量。
   * 调用方（background）逐个 chunk 转发给 content script 渲染。
   */
  chat(request: ChatRequest): Promise<AsyncIterable<string>>
}

/** 统一的 Provider 错误，把 API 的错误响应转换成可读信息 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
