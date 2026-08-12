/**
 * providers/index.ts —— Provider 工厂
 *
 * 以后要加新 Provider（Claude/Gemini/Ollama…）：
 *   1. 新写一个实现 AIProvider 的类；
 *   2. 在 ProviderConfig 里加 providerType 字段；
 *   3. 在这个 switch 里加一个分支。
 * 其余代码零改动 —— 这就是接口抽象的价值。
 */
import type { ProviderConfig } from '@/core/types'
import type { AIProvider } from './types'
import { OpenAICompatibleProvider } from './openai'

export function createProvider(config: ProviderConfig): AIProvider {
  return new OpenAICompatibleProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  })
}
