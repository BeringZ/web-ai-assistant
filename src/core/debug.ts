/**
 * core/debug.ts —— 调试日志开关
 *
 * 正式发布（DEBUG=false）时不输出 [WebAI] 日志；
 * 排查问题时临时改为 true 即可。
 */
export const DEBUG = false

export function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.debug('[WebAI]', ...args)
  }
}
