/**
 * core/runState.ts —— 运行状态机
 *
 * 避免"断开连接之后又 done"、"取消之后 error 覆盖 aborted"、
 * "旧请求 chunk 写入新请求"等竞态。
 *
 * idle → preparing → running → done
 *                    ├── failed
 *                    └── aborted
 */

export type RunStatus = 'idle' | 'preparing' | 'running' | 'done' | 'aborted' | 'failed'

const FINAL: ReadonlySet<RunStatus> = new Set(['done', 'aborted', 'failed'])

export class RunStateMachine {
  private _status: RunStatus = 'idle'

  get status(): RunStatus {
    return this._status
  }

  /** 尝试迁移状态；非法/终态后的迁移返回 false */
  transition(next: RunStatus): boolean {
    if (FINAL.has(this._status)) return false
    if (next === 'idle') {
      // idle 只能作为重置
      if (this._status === 'preparing' || this._status === 'running') return false
      this._status = 'idle'
      return true
    }
    if (next === this._status) return true

    // 合法性：preparing 可进 running / done / failed / aborted；running 可进 done / failed / aborted
    if (this._status === 'idle' && next !== 'preparing') return false
    if (this._status === 'preparing') {
      if (next !== 'running' && next !== 'done' && next !== 'failed' && next !== 'aborted') return false
    }
    if (this._status === 'running' && next !== 'done' && next !== 'failed' && next !== 'aborted') return false

    this._status = next
    return true
  }

  /** 开始新的一次运行（从任意终态重置） */
  reset(): void {
    this._status = 'idle'
  }
}

/** 便捷：状态是否为终态 */
export function isFinalStatus(s: RunStatus): boolean {
  return FINAL.has(s)
}
