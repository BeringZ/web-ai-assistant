/**
 * selection/webSource.ts —— WebSelectionSource（普通网页正文选区）
 *
 * 支持 Shadow DOM（快照基于 Range 克隆，天然跨边界）；
 * 多 range 合并文本，定位用主 range。
 */
import type { SelectionSnapshot, SelectionSource } from './types'
import { snapshotFromSelection } from './snapshot'

export class WebSelectionSource implements SelectionSource {
  readonly id = 'web'

  read(): SelectionSnapshot | null {
    return snapshotFromSelection(window.getSelection())
  }
}
