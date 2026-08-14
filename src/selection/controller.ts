/**
 * selection/controller.ts —— SelectionController
 *
 * 多个 SelectionSource 的仲裁器：
 * - 新增来源只需注册（Web / Input / PDF / 未来 Epub…）
 * - read() 按优先级返回第一个有效快照（Input 优先于 Web：
 *   光标在输入框内时 window.getSelection 通常无内容）
 */
import type { SelectionSnapshot, SelectionSource } from './types'
import { WebSelectionSource } from './webSource'
import { InputSelectionSource } from './inputSource'

export class SelectionController {
  private sources: SelectionSource[] = []

  constructor(sources: SelectionSource[] = []) {
    this.sources = sources
  }

  /** 注册来源（覆盖默认集合） */
  register(sources: SelectionSource[]): void {
    this.sources = sources
  }

  /** 按优先级读取第一个有效选区快照 */
  read(): SelectionSnapshot | null {
    for (const src of this.sources) {
      const snap = src.read()
      if (snap) return snap
    }
    return null
  }
}

/** 默认控制器：Input 优先（输入框划词），其次网页正文 */
export function createDefaultController(): SelectionController {
  return new SelectionController([new InputSelectionSource(), new WebSelectionSource()])
}
