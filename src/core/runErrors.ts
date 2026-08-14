/**
 * core/runErrors.ts —— 标准运行错误模型
 *
 * 把"Failed to fetch"这类用户无法处理的字符串错误，
 * 归一成带 code / retryable / action 的结构化错误，UI 据此渲染动作按钮。
 */

export type RunErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'HOST_PERMISSION_REQUIRED'
  | 'AUTH_FAILED'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'STREAM_ERROR'
  | 'CONTEXT_TOO_LARGE'
  | 'SELECTION_INVALID'
  | 'WORKER_DISCONNECTED'
  | 'UNKNOWN'

export type RunErrorActionType = 'open-settings' | 'request-permission' | 'retry'

export interface RunError {
  code: RunErrorCode
  message: string
  retryable: boolean
  /** UI 可渲染的动作（可选） */
  action?: {
    type: RunErrorActionType
    label: string
  }
}

/** 由错误码生成（缺省 message/action 由码推导） */
export function makeRunError(code: RunErrorCode, message?: string): RunError {
  switch (code) {
    case 'PROVIDER_NOT_CONFIGURED':
      return {
        code,
        message: message ?? '尚未配置 AI API（Base URL / API Key / Model）。',
        retryable: false,
        action: { type: 'open-settings', label: '打开设置' },
      }
    case 'HOST_PERMISSION_REQUIRED':
      return {
        code,
        message: message ?? '当前 API 域名尚未授权访问。',
        retryable: false,
        action: { type: 'request-permission', label: '授权并重试' },
      }
    case 'AUTH_FAILED':
      return {
        code,
        message: message ?? 'API 认证失败，请检查 API Key。',
        retryable: false,
        action: { type: 'open-settings', label: '打开设置' },
      }
    case 'MODEL_NOT_FOUND':
      return {
        code,
        message: message ?? '模型不存在，请确认 Provider 支持该模型。',
        retryable: false,
        action: { type: 'open-settings', label: '打开设置' },
      }
    case 'RATE_LIMITED':
      return { code, message: message ?? '请求过于频繁，请稍后重试。', retryable: true, action: { type: 'retry', label: '重试' } }
    case 'NETWORK_ERROR':
      return { code, message: message ?? '网络错误，无法连接 API。', retryable: true, action: { type: 'retry', label: '重试' } }
    case 'TIMEOUT':
      return { code, message: message ?? '请求超时，请重试。', retryable: true, action: { type: 'retry', label: '重试' } }
    case 'STREAM_ERROR':
      return { code, message: message ?? '流式响应中断。', retryable: true, action: { type: 'retry', label: '重试' } }
    case 'CONTEXT_TOO_LARGE':
      return { code, message: message ?? '上下文过长，请缩小选区或上下文范围。', retryable: false }
    case 'SELECTION_INVALID':
      return { code, message: message ?? '选区内容已失效，请重新选择。', retryable: false }
    case 'WORKER_DISCONNECTED':
      return { code, message: message ?? '扩展后台连接已中断，请重试。', retryable: true, action: { type: 'retry', label: '重试' } }
    case 'UNKNOWN':
    default:
      return { code: 'UNKNOWN', message: message ?? '发生未知错误，请重试。', retryable: true, action: { type: 'retry', label: '重试' } }
  }
}

/**
 * 从 HTTP status / 底层错误映射为 RunError。
 * ProviderError 自带 status；未知错误 → NETWORK_ERROR 或 UNKNOWN。
 */
export function mapRunError(err: unknown, status?: number): RunError {
  // 已结构化
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return err as RunError
  }
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status
    if (typeof s === 'number') status = s
  }

  switch (status) {
    case 401:
    case 403:
      return makeRunError('AUTH_FAILED')
    case 404:
      return makeRunError('MODEL_NOT_FOUND')
    case 408:
      return makeRunError('TIMEOUT')
    case 429:
      return makeRunError('RATE_LIMITED')
    case 502:
    case 503:
    case 504:
      return makeRunError('NETWORK_ERROR', `服务暂时不可用（HTTP ${status}），请稍后重试。`)
    default:
      if (status !== undefined && status >= 400) {
        return makeRunError('UNKNOWN', `API 请求失败（HTTP ${status}）。`)
      }
  }

  const message = err instanceof Error ? err.message : String(err ?? '')
  if (/timeout|timed out|abort/i.test(message)) return makeRunError('TIMEOUT')
  if (/fetch|network|failed to fetch|connection/i.test(message)) return makeRunError('NETWORK_ERROR')
  return makeRunError('UNKNOWN', message)
}

/** 该错误是否可自动重试（网络 / 5xx / 超时） */
export function isAutoRetryable(err: unknown, status?: number): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code
    return code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'STREAM_ERROR'
  }
  return status === 502 || status === 503 || status === 504 || status === undefined
}
