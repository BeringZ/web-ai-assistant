/**
 * core/runProtocol.ts —— 运行协议工具
 *
 * requestId：每次运行生成唯一 id，随所有消息往返。
 * 客户端用它过滤迟到事件（A 请求的 chunk 不会污染 B 请求的面板），
 * 服务端用它关联请求与响应。
 */

/** 生成一次运行的唯一 id（时间戳 + 随机段，无需全局协调） */
export function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
