/**
 * dictionary/index.ts —— 本地词库（纯逻辑层，不含存储）
 *
 * 职责：
 * 1. 判断"选中内容是词还是语段"（isSingleWord）
 * 2. 提供内置词库数据（BUILTIN_WORDS，随构建打包，只读）
 * 3. 在词表数组中查词（lookupInWords，大小写不敏感）
 * 4. 词条格式化 / 词典化 AI 格式要求
 *
 * 分层说明：用户词库的持久化在 core/storage.ts（user_dictionary），
 * 查询时由 background 组装「用户词库优先 + 内置兜底」，本模块保持纯函数可测。
 */
import data from './data.json'
import type { DictionaryEntry } from '@/core/types'

/** 内置词库（随扩展打包，只读） */
export const BUILTIN_WORDS: DictionaryEntry[] = data.words

export const DICTIONARY_SIZE = BUILTIN_WORDS.length

/** 在词表数组中精确查词（忽略大小写）；未命中返回 null */
export function lookupInWords(words: DictionaryEntry[], word: string): DictionaryEntry | null {
  const key = word.trim().toLowerCase()
  if (!key) return null
  return words.find((w) => w.word.toLowerCase() === key) ?? null
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

/** 词条 → Markdown 输出（与 AI 词典格式保持一致，渲染层通用） */
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
