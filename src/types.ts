export type ModuleId = 'briefing' | 'digest' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6'
export type ThemeMode = 'dark' | 'light'

export type SignalLevel = 'hard' | 'soft' | 'noise'
export type ConsensusStage = 'seed' | 'brewing' | 'consensus'

export interface NewsSource {
  name: string
  /** 仅当链接已核实可访问时提供；不确定则不设，UI 不渲染链接 */
  url?: string
}

export interface ShiftItem {
  id: string
  level: SignalLevel
  consensus: ConsensusStage
  title: string
  analysis: string
  domains: string[]
  sources: NewsSource[]
  relevance?: number
}

export interface NarrativeItem {
  id: string
  name: string
  heat: number
  delta: number
  trend: 'up' | 'down'
  sources?: NewsSource[]
}

export interface DisputeTopic {
  id: string
  name: string
  score: number
  sources?: NewsSource[]
  camps: {
    side: 'optimistic' | 'pessimistic' | 'neutral'
    label: string
    quote: string
    basis: string
    source?: NewsSource
  }[]
  insight: string
  /** 与主报道时间接近的同期相关快讯 */
  relatedFlashes?: DisputeRelatedFlash[]
}

export interface DisputeRelatedFlash {
  id: string
  title: string
  time: string
  url?: string
}

export interface AgendaItem {
  id: string
  time: string
  date: string
  level: SignalLevel
  title: string
  impact: string
  isToday?: boolean
  sources?: NewsSource[]
}

export interface RawArticle {
  id: string
  kind: 'article' | 'flash'
  title: string
  body: string
  author?: string
  time: string
  url?: string
}

export interface BriefingData {
  generatedAt: string
  oneLiner: string
  topShifts: ShiftItem[]
  hotNarratives: NarrativeItem[]
  topAgenda: AgendaItem[]
  topDispute: DisputeTopic | null
  /** 当月值得关注的币圈参与机会（M6 摘要） */
  topOpportunities: CryptoOpportunity[]
}

export interface DigestItem {
  id: string
  text: string
  /** 星球早讯 / 午讯 / 晚讯等可直达 Odaily 原文 */
  url?: string
}

export interface DigestHotTopic {
  title: string
  url: string
}

export interface FlashCategoryBucket {
  id: string
  label: string
  count: number
  items: DigestItem[]
}

export const FLASH_CATEGORY_LABELS = [
  { id: 'prediction-market', label: '预测市场' },
  { id: 'ai', label: 'AI' },
  { id: 'celebrity-views', label: '名人观点' },
  { id: 'crypto-stocks', label: '币股动态' },
  { id: 'project-updates', label: '项目动向' },
  { id: 'onchain-data', label: '链上数据' },
  { id: 'exchange-announcements', label: '交易所公告' },
  { id: 'fundraising', label: '融资信息' },
  { id: 'macro-policy', label: '宏观政策' },
] as const

export function emptyCategoryFlashes(): FlashCategoryBucket[] {
  return FLASH_CATEGORY_LABELS.map(({ id, label }) => ({
    id,
    label,
    count: 0,
    items: [],
  }))
}

export type OpportunityKind = 'fundraising' | 'lottery' | 'tge' | 'airdrop'

export interface CryptoOpportunity {
  id: string
  kind: OpportunityKind
  kindLabel: string
  title: string
  summary: string
  highlight?: string
  /** 展示用：MM-DD HH:mm */
  date: string
  time: string
  monthKey: string
  url?: string
  sources?: NewsSource[]
}

export interface OpportunityBucket {
  id: OpportunityKind
  label: string
  count: number
  items: CryptoOpportunity[]
}

/** 未命中机会规则时的同期币圈相关报道 */
export interface OpportunityFallbackItem {
  id: string
  title: string
  summary: string
  date: string
  time: string
  monthKey: string
  url?: string
  sources?: NewsSource[]
}

export interface OpportunityMonthSlice {
  key: string
  label: string
  summary: string
  totalCount: number
  buckets: OpportunityBucket[]
  /** 该月未归类为机会、但相关的币圈报道 */
  fallbackItems: OpportunityFallbackItem[]
  /** 无机会时 fallback 的数据范围 */
  fallbackScope?: 'month' | 'recent'
}

export interface CryptoOpportunitiesData {
  dateLabel: string
  updatedAt: string
  rangeLabel: string
  defaultMonth: string
  months: OpportunityMonthSlice[]
  /** 近 30 天币圈相关报道（机会规则未命中时作兜底展示） */
  recentFallback: OpportunityFallbackItem[]
}

export const OPPORTUNITY_BUCKET_LABELS: { id: OpportunityKind; label: string }[] = [
  { id: 'fundraising', label: '项目融资' },
  { id: 'lottery', label: '抽奖活动' },
  { id: 'tge', label: 'TGE / 发售' },
  { id: 'airdrop', label: '空投机会' },
]

export function emptyOpportunityBuckets(): OpportunityBucket[] {
  return OPPORTUNITY_BUCKET_LABELS.map(({ id, label }) => ({
    id,
    label,
    count: 0,
    items: [],
  }))
}

export function formatOpportunityMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  return `${year}年${month}月`
}

export function findOpportunityMonthSlice(
  opp: CryptoOpportunitiesData,
  monthKey: string,
): OpportunityMonthSlice {
  const found = opp.months.find((m) => m.key === monthKey)
  if (found) return found
  const label = formatOpportunityMonthLabel(monthKey)
  return {
    ...emptyOpportunityMonth(monthKey, label),
    summary: `${label}暂未识别到明确可参与机会，可切换其他月份或稍后刷新。`,
  }
}

export function emptyOpportunityMonth(key: string, label: string): OpportunityMonthSlice {
  return {
    key,
    label,
    summary: '加载中…',
    totalCount: 0,
    buckets: emptyOpportunityBuckets(),
    fallbackItems: [],
  }
}

export interface OdailyFlashDto {
  id: string
  title: string
  url: string
  publishedAt?: string
}

export interface OdailyDigestPayload {
  fetchedAt: string
  latestFlashes: OdailyFlashDto[]
  cryptoFlashes: OdailyFlashDto[]
  hotPost: OdailyFlashDto | null
  source: string
}

export interface DigestData {
  dateLabel: string
  /** 今日日期标签（分类筛选用） */
  todayDateLabel: string
  updatedAt: string
  nextUpdateMinutes: number
  latestFlashes: DigestItem[]
  /** 按分类聚合的今日全天快讯 */
  categoryFlashes: FlashCategoryBucket[]
  crypto: {
    dateLabel: string
    items: DigestItem[]
  }
  hotTopic: DigestHotTopic
  /** 是否为 Odaily 实时数据 */
  live?: boolean
  sourceLabel?: string
}

export interface PrescientData {
  briefing: BriefingData
  digest: DigestData
  shifts: ShiftItem[]
  narratives: {
    rising: NarrativeItem[]
    cooling: NarrativeItem[]
    disputes: { name: string; score: number; sources?: NewsSource[] }[]
    aiJudgment: string
  }
  agenda: {
    tomorrow: AgendaItem[]
    weekAhead: AgendaItem[]
    tip: string
  }
  disputes: DisputeTopic[]
  opportunities: CryptoOpportunitiesData
  raw: {
    articles: RawArticle[]
    flashes: RawArticle[]
    flashSectionTitle: string
    aiSummary: string
  }
  live?: boolean
  sourceLabel?: string
}

export interface ModuleMeta {
  id: ModuleId
  code: string
  name: string
  desc: string
  keywords: string[]
}

export const MODULES: ModuleMeta[] = [
  {
    id: 'briefing',
    code: 'ALL',
    name: '全览简报',
    desc: '今日变局 + 叙事温度 + 议程 + 分歧 一屏总览',
    keywords: ['简报', '全部', '今日快报'],
  },
  {
    id: 'm1',
    code: 'M1',
    name: '今日变局',
    desc: '筛选今日真正重要的全球变化',
    keywords: ['头条', '新闻', '发生了什么', '要闻'],
  },
  {
    id: 'm2',
    code: 'M2',
    name: '叙事温度',
    desc: '哪些话题在升温，哪些在退潮',
    keywords: ['热点', '趋势', '升温', '舆论', '什么火了'],
  },
  {
    id: 'm3',
    code: 'M3',
    name: '明日议程',
    desc: '未来 7 天确定性事件与影响预判',
    keywords: ['明天', '日历', '议程', '预告', '本周'],
  },
  {
    id: 'm4',
    code: 'M4',
    name: '分歧雷达',
    desc: '同一事件的不同阵营观点对撞',
    keywords: ['分歧', '争议', '怎么看', '辩论'],
  },
  {
    id: 'm5',
    code: 'M5',
    name: '原始脉络',
    desc: '深度报道与快讯标题索引；快讯优先升温话题与今日币圈',
    keywords: ['原文', '直达', '链接', '深度报道', '数据源'],
  },
  {
    id: 'm6',
    code: 'M6',
    name: '币圈机会',
    desc: '项目融资、TGE、空投与抽奖等可参与机会汇总',
    keywords: ['机会', '融资', 'TGE', '空投', '抽奖', '打新', 'IDO', '参与', '福利'],
  },
  {
    id: 'digest',
    code: '快讯',
    name: '快讯',
    desc: '最新快讯每两小时刷新，币圈快讯汇总当日动态与今日🔥专题',
    keywords: ['快讯', '最新快讯', '币圈快讯', '热门', '今日专题', '加密', '两小时'],
  },
]

export const INTEREST_TAGS = [
  '科技 / AI',
  '宏观 / 政策',
  '地缘 / 能源',
  '商业 / 创业',
  '金融 / 市场',
  '币圈',
  '加密',
  '空投',
  'TGE / 发售',
] as const

export type InterestTag = (typeof INTEREST_TAGS)[number]

export const CRYPTO_INTEREST_TAGS: ReadonlySet<InterestTag> = new Set([
  '币圈',
  '加密',
  '空投',
  'TGE / 发售',
  '金融 / 市场',
])
