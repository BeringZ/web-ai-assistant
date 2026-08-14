/**
 * selection/types.ts —— Selection Core 类型
 *
 * 统一所有来源（网页 / PDF / Input / Shadow DOM）的选区模型：
 *   SelectionSource → SelectionSnapshot → ContextBuilder → SelectionPayload
 */
import type { ContextLevel } from '@/core/types'

/** 选区范围快照：纯 Node + 偏移（可在选区被页面清除后重建 Range） */
export interface RangeSnapshot {
  startContainer: Node
  startOffset: number
  endContainer: Node
  endOffset: number
}

/** 选区来源 */
export type SelectionSourceKind = 'web' | 'pdf' | 'input'

/** 来源元数据（按来源扩展，不互相依赖） */
export interface SelectionMetadata {
  /** input/textarea 来源：所在元素 */
  inputElement?: HTMLInputElement | HTMLTextAreaElement
  /** pdf 来源：页码 */
  pdfPageNumber?: number
  pdfPageCount?: number
}

/** 统一选区快照 */
export interface SelectionSnapshot {
  /** 用户选中的归一化文本 */
  text: string
  /** 主 Range 快照（可重建 Range 用于定位/跟随） */
  range: RangeSnapshot | null
  /** 选区矩形（视口坐标，菜单/面板定位） */
  rect: DOMRect | null
  source: SelectionSourceKind
  metadata: SelectionMetadata
}

/** 上下文构建结果（语义段落结构） */
export interface ContextSnapshot {
  /** 选中文本（恒等于 snapshot.text） */
  selected: string
  /** 语义段落：前段 / 当前段 / 后段 */
  paragraphs: {
    before: string[]
    current: string[]
    after: string[]
  }
  /** 拼接后的最终上下文文本（已应用预算） */
  text: string
}

/** 上下文预算 */
export interface ContextBudget {
  maxChars: number
  /** 截断时必须以选中文本为中心，保证 selection 完整可见 */
  preserveSelection: boolean
}

/** 各来源统一的上下文级别 */
export type SelectionContextLevel = ContextLevel

/** SelectionSource 抽象：新增来源（Epub/字幕/iframe…）无需改 Action 层 */
export interface SelectionSource {
  readonly id: string
  /** 读取当前选区；无有效选区返回 null */
  read(): SelectionSnapshot | null
}
