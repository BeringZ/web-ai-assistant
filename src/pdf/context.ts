/**
 * pdf/context.ts —— PDF 页面文本提取与上下文构建
 *
 * 纯逻辑（可单测）：
 * - pickPageNumbers：前后页范围（含边界处理）
 * - composeContext：拼接 + 超长截断
 * - buildPdfContext：按级别组装（仅选中 / 当前页 / 前后页）
 *
 * 页面文本缓存由调用方提供 getPageText（内部 Map<number,string>）。
 */
/** 前后页上下文的字符上限（避免 Token 暴涨） */
export const PDF_CONTEXT_LIMIT = 14000

/** 从 textContent.items 拼接页面文本 */
export function pageTextFromItems(items: Array<{ str?: string }>): string {
  return items
    .map((i) => i.str ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 前后页页码范围（边界自动夹取）：
 * 第 1 页 → [1, 2]；第 5 / 共 10 页 → [4, 5, 6]；最后一页 → [n-1, n]
 */
export function pickPageNumbers(pageNumber: number, pageCount: number): number[] {
  const nums = [pageNumber - 1, pageNumber, pageNumber + 1]
  return nums.filter((n) => n >= 1 && n <= pageCount)
}

/** 拼接多个文本块并截断到 maxChars */
export function composeContext(parts: string[], maxChars = PDF_CONTEXT_LIMIT): string {
  const joined = parts.join('\n\n')
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined
}

export type PdfContextLevel = 'selection' | 'page' | 'around'

export interface BuildPdfContextArgs {
  level: PdfContextLevel
  selectionText: string
  pageNumber: number
  pageCount: number
  /** 获取指定页文本（内部应有缓存） */
  getPageText: (pageNumber: number) => Promise<string>
  maxChars?: number
}

/**
 * 组装发给 AI 的上下文。
 * - selection：只返回选中文本
 * - page：当前页全文
 * - around：当前页 + 前后页（超长截断）
 */
export async function buildPdfContext(args: BuildPdfContextArgs): Promise<string> {
  const { level, selectionText } = args
  if (level === 'selection') return selectionText

  const pages = level === 'page' ? [args.pageNumber] : pickPageNumbers(args.pageNumber, args.pageCount)
  const texts: string[] = []
  for (const n of pages) {
    const t = await args.getPageText(n)
    if (t) texts.push(t)
  }
  return composeContext(texts, args.maxChars)
}
