import type { NewsSource } from './types'

/** Odaily 文章：title 与 url 均经页面核对 */
export interface OdailyPost {
  title: string
  url: string
  /** 来源链接展示名（简短，与文章一致） */
  label: string
}

export const ODAILY_POSTS = {
  worldcup: {
    title: '世界杯开赛，盘点预测市场上那些"爆赚"和"亏麻"',
    url: 'https://www.odaily.news/zh-CN/post/5211440',
    label: '世界杯预测市场盘点',
  },
  btcBottom: {
    title: '比特币筑底进行时：地缘溢价消退，耐心资本入场',
    url: 'https://www.odaily.news/zh-CN/post/5211458',
    label: '比特币筑底进行时',
  },
  coreweave: {
    title: '「英伟达概念股」CoreWeave联创访谈：AI需求似乎每天都在加剧',
    url: 'https://www.odaily.news/zh-CN/post/5211462',
    label: 'CoreWeave 联创访谈',
  },
  aiSubscription: {
    title: '你的AI月费被谁分走了？一张图拆解20美元背后的算力供应链',
    url: 'https://www.odaily.news/zh-CN/post/5211432',
    label: 'AI 月费算力供应链',
  },
  strc: {
    title: 'STRC脱锚11%，Strategy的永动机还转得动吗？',
    url: 'https://www.odaily.news/zh-CN/post/5211466',
    label: 'STRC 脱锚解读',
  },
  agentWallet: {
    title: '当世界杯碰撞 Agent：从 Web2 到 Web3，钱包如何走向 Agentic Wallet？',
    url: 'https://www.odaily.news/zh-CN/post/5211451',
    label: 'Agentic Wallet 探索',
  },
  storage: {
    title: 'Gate 研究院：存储三巨头市值集体破万亿',
    url: 'https://www.odaily.news/zh-CN/post/5211452',
    label: '存储三巨头破万亿',
  },
} as const satisfies Record<string, OdailyPost>

export type OdailyPostKey = keyof typeof ODAILY_POSTS

const ODAILY_URLS = new Set<string>(Object.values(ODAILY_POSTS).map((p) => p.url))

/** 已逐条核实的权威文档页（非首页占位） */
export const VERIFIED_DOCUMENTS = {
  eurLexAiAct: {
    name: '欧盟 AI 法案全文',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1689',
  },
  futureOfLife: {
    name: '暂停 AI 训练公开信',
    url: 'https://futureoflife.org/open-letter/pause-giant-ai-experiments/',
  },
} as const satisfies Record<string, NewsSource & { url: string }>

export type VerifiedDocumentKey = keyof typeof VERIFIED_DOCUMENTS

const VERIFIED_DOCUMENT_URLS = new Set<string>(
  Object.values(VERIFIED_DOCUMENTS).map((d) => d.url),
)

export function odailySource(key: OdailyPostKey): NewsSource {
  const post = ODAILY_POSTS[key]
  return { name: post.label, url: post.url }
}

export function documentSource(key: VerifiedDocumentKey): NewsSource {
  const doc = VERIFIED_DOCUMENTS[key]
  return { name: doc.name, url: doc.url }
}

/** 星球日报早晚报条目（快讯列表中可点击直达） */
export const PLANET_DIGEST_RE = /^星球(早|午|晚)讯/

export function isPlanetDigestTitle(title: string): boolean {
  return PLANET_DIGEST_RE.test(title.replace(/^【快讯】\s*/, '').trim())
}

/** 仅 Odaily 文章、快讯与已核实文档页视为可点击来源 */
export function isVerifiedSourceUrl(url: string | undefined): url is string {
  if (!url) return false
  if (ODAILY_URLS.has(url) || VERIFIED_DOCUMENT_URLS.has(url)) return true
  return /^https:\/\/www\.odaily\.news\/zh-CN\/(post|newsflash)\/\d+$/.test(url)
}

export function odailyHotTopics() {
  return [
    ODAILY_POSTS.worldcup,
    ODAILY_POSTS.btcBottom,
    ODAILY_POSTS.coreweave,
    ODAILY_POSTS.strc,
    ODAILY_POSTS.agentWallet,
    ODAILY_POSTS.storage,
  ]
}
