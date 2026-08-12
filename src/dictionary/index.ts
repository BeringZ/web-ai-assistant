/**
 * dictionary/index.ts —— 本地词库 harness
 *
 * 职责：判断"选中内容是一个英文词还是语段"，以及词的本地查词。
 *
 * 分流策略（在 background 中执行，词库数据不进入 Content Script）：
 *   选中文本
 *     ├─ 单个英文词 → 本地词库查词
 *     │    ├─ 命中 → 直接输出（发音/词性/释义），不调用 AI（省 Token、秒出）
 *     │    └─ 未命中 → 走 AI，但提示词要求"词典格式"输出
 *     └─ 语段 → 走 Action 模板正常翻译
 */
import data from './data.json'

export interface DictionaryEntry {
  word: string
  phonetic?: string
  meanings: Array<{ pos: string; meaning: string }>
}

/** 模块加载时构建一次索引（大小写不敏感），避免每次查询都遍历 */
const INDEX = new Map<string, DictionaryEntry>()
for (const w of data.words) {
  INDEX.set(w.word.toLowerCase(), w)
}

export const DICTIONARY_SIZE = INDEX.size

/** 查词：精确匹配，忽略大小写；未命中返回 null */
export function lookupWord(word: string): DictionaryEntry | null {
  const key = word.trim().toLowerCase()
  if (!key) return null
  return INDEX.get(key) ?? null
}

/**
 * 判断是否"单个英文词"：
 * - 允许字母 + 连字符/撇号复合词（如 well-known、don't）
 * - 纯英文单词；中文、含空格/数字/标点的都是语段
 */
export function isSingleWord(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 40) return false
  return /^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(t)
}

/** 词库条目 → Markdown 输出（与 AI 词典格式保持一致，渲染层通用） */
export function formatEntry(entry: DictionaryEntry): string {
  const lines: string[] = []
  lines.push(`**${entry.word}**${entry.phonetic ? `  /${entry.phonetic}/` : ''}`)
  for (const m of entry.meanings) {
    lines.push(`- ${m.pos} ${m.meaning}`)
  }
  return lines.join('\n')
}

/** 词典化 AI 请求的格式要求（词库未命中时附加到提示词） */
export const WORD_FORMAT_HINT = [
  '请像一本英汉词典一样解释这个单词，严格按以下格式输出：',
  '第一行：单词 + 国际音标（如 hello /həˈləʊ/）',
  '其后每行一条常见释义，格式：词性缩写（n./v./adj./adv./int./prep./conj.…）+ 中文释义',
  '把该词最常见的 2-4 个意思都列出来，不要解释用法，不要多余的话。',
].join('\n')
