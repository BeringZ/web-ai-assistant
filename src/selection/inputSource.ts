/**
 * selection/inputSource.ts —— InputSelectionSource
 *
 * 处理 <input> / <textarea> 内的划词：
 * window.getSelection() 覆盖不到输入框，改读 selectionStart/End。
 */
import type { SelectionSnapshot, SelectionSource } from './types'
import { isEditableActiveElement, snapshotFromInput } from './snapshot'

export class InputSelectionSource implements SelectionSource {
  readonly id = 'input'

  read(): SelectionSnapshot | null {
    const el = document.activeElement
    if (!isEditableActiveElement(el)) return null
    return snapshotFromInput(el)
  }
}
