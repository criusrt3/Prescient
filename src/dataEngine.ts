import type {
  CryptoOpportunity,
  CryptoOpportunitiesData,
  InterestTag,
  OpportunityFallbackItem,
  PrescientData,
} from './types'
import { CRYPTO_INTEREST_TAGS, currentOpportunityMonthKey } from './types'
import { buildDigestFallback, buildDigestLoading } from './digestEngine'
import { emptyOpportunityMonth } from './types'

function currentMonthKey(): string {
  return currentOpportunityMonthKey()
}

const emptyOpportunities = () => {
  const key = currentMonthKey()
  const label = `${key.slice(0, 4)}年${key.slice(5)}月`
  return {
    dateLabel: '—',
    updatedAt: '—',
    rangeLabel: '近 4 个月',
    sourceNote: '币圈机会单独拉取 Odaily Web API（近 4 个月）',
    defaultMonth: key,
    months: [emptyOpportunityMonth(key, label)],
    recentFallback: [],
  }
}

export const INTEREST_MATCHERS: Record<InterestTag, RegExp> = {
  '科技 / AI': /AI|OpenAI|科技|监管|法案|半导体|芯片|网信办|LifeSciBench|英伟达/i,
  '宏观 / 政策': /宏观|政策|美联储|央行|降息|通胀|CPI|非农|标普|GDP|利率/i,
  '地缘 / 能源': /地缘|能源|战争|伊朗|以色列|黎巴嫩|停火|导弹|石油|海峡|中东/i,
  '商业 / 创业': /商业|创业|IPO|上市|融资|初创|Kalshi|预测市场/i,
  '金融 / 市场': /金融|市场|比特币|BTC|ETH|加密|DeFi|美股|ETF|币安|Tether|稳定币|Strategy/i,
  币圈: /币圈|比特币|BTC|ETH|以太坊|加密市场|数字货币|虚拟货币|Meme|山寨|Solana|SOL/i,
  加密: /加密|Crypto|DeFi|Web3|区块链|代币|NFT|稳定币|Layer2|L2|智能合约|链上/i,
  空投: /空投|airdrop|快照|申领|空头代币|领取资格/i,
  'TGE / 发售': /TGE|IDO|IEO|Launchpool|打新|预售|代币发行|公开发售|认购/i,
}

export function matchesInterestTags(text: string, interests: string[]): boolean {
  if (interests.length === 0) return true
  return interests.some((tag) => INTEREST_MATCHERS[tag as InterestTag]?.test(text))
}

export function filterListByInterests<T>(
  items: T[],
  getText: (item: T) => string,
  interests: string[],
): T[] {
  if (interests.length === 0) return items
  const matched = items.filter((item) => matchesInterestTags(getText(item), interests))
  return matched.length > 0 ? matched : items
}

export function hasCryptoInterest(interests: string[]): boolean {
  return interests.some((tag) => CRYPTO_INTEREST_TAGS.has(tag as InterestTag))
}

function matchesOpportunityInterests(item: CryptoOpportunity, interests: string[]): boolean {
  const text = `${item.title} ${item.summary} ${item.kindLabel} ${item.highlight ?? ''}`
  if (matchesInterestTags(text, interests)) return true
  if (interests.includes('空投') && item.kind === 'airdrop') return true
  if (interests.includes('TGE / 发售') && item.kind === 'tge') return true
  if (
    (interests.includes('币圈') || interests.includes('加密')) &&
    ['fundraising', 'lottery', 'tge', 'airdrop'].includes(item.kind)
  ) {
    return true
  }
  return false
}

function filterOpportunityMonthSlice<T extends {
  buckets: CryptoOpportunitiesData['months'][0]['buckets']
  fallbackItems: OpportunityFallbackItem[]
  totalCount: number
}>(
  slice: T,
  interests: string[],
  filterItem: (item: CryptoOpportunity) => boolean,
): T {
  const buckets = slice.buckets.map((bucket) => {
    const items = bucket.items.filter(filterItem)
    return { ...bucket, items, count: items.length }
  })
  const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  if (totalCount === 0 && slice.totalCount > 0) {
    return slice
  }
  const filteredFallback =
    totalCount === 0
      ? slice.fallbackItems.filter((item) =>
          matchesInterestTags(`${item.title} ${item.summary}`, interests),
        )
      : []
  const fallbackItems =
    totalCount === 0
      ? filteredFallback.length > 0
        ? filteredFallback
        : slice.fallbackItems
      : []
  return {
    ...slice,
    buckets,
    totalCount,
    fallbackItems,
    ...(totalCount === 0 && fallbackItems.length === 0 ? { fallbackScope: undefined } : {}),
  } as T
}

export function filterOpportunitiesByInterests(
  opportunities: CryptoOpportunitiesData,
  interests: string[],
): CryptoOpportunitiesData {
  if (interests.length === 0 || !hasCryptoInterest(interests)) return opportunities
  const filterItem = (item: CryptoOpportunity) => matchesOpportunityInterests(item, interests)
  return {
    ...opportunities,
    months: opportunities.months.map((month) => filterOpportunityMonthSlice(month, interests, filterItem)),
    recentFallback: opportunities.recentFallback.filter((item) =>
      matchesInterestTags(`${item.title} ${item.summary}`, interests),
    ),
  }
}

export interface InterestFilteredView {
  shifts: PrescientData['shifts']
  briefing: PrescientData['briefing']
  opportunities: CryptoOpportunitiesData
}

export function applyInterestFilters(data: PrescientData, interests: string[]): InterestFilteredView {
  const shifts = filterShiftsByInterests(data.shifts, interests)
  const opportunities = filterOpportunitiesByInterests(data.opportunities, interests)

  if (interests.length === 0) {
    return { shifts, briefing: data.briefing, opportunities }
  }

  const topDispute = data.briefing.topDispute
    ? filterListByInterests(
        [data.briefing.topDispute],
        (d) => `${d.name} ${d.insight} ${d.camps.map((c) => c.quote).join(' ')}`,
        interests,
      )[0] ?? data.briefing.topDispute
    : null

  const briefing = {
    ...data.briefing,
    topShifts: filterListByInterests(
      data.briefing.topShifts,
      (s) => `${s.title} ${s.analysis} ${s.domains.join(' ')}`,
      interests,
    ).slice(0, 3),
    hotNarratives: filterListByInterests(data.briefing.hotNarratives, (n) => n.name, interests).slice(0, 3),
    topAgenda: filterListByInterests(
      data.briefing.topAgenda,
      (a) => `${a.title} ${a.impact}`,
      interests,
    ).slice(0, 3),
    topDispute,
    topOpportunities:
      hasCryptoInterest(interests)
        ? data.briefing.topOpportunities
            .filter((item) => matchesOpportunityInterests(item, interests))
            .slice(0, 3)
        : [],
  }

  return { shifts, briefing, opportunities }
}

export function buildDataLoading(): PrescientData {
  const digest = buildDigestLoading()
  return {
    live: false,
    sourceLabel: '加载中',
    briefing: {
      generatedAt: '—',
      oneLiner: '正在连接 Odaily 数据服务…',
      topShifts: [],
      hotNarratives: [],
      topAgenda: [],
      topDispute: null,
      topOpportunities: [],
    },
    digest,
    shifts: [],
    narratives: {
      rising: [],
      cooling: [],
      disputes: [],
      aiJudgment: '加载中…',
    },
    agenda: { tomorrow: [], weekAhead: [], tip: '加载中…' },
    disputes: [],
    opportunities: emptyOpportunities(),
    raw: {
      articles: [],
      flashes: [{ id: 'l1', kind: 'flash', title: '加载中', body: '加载中', time: '—' }],
      flashSectionTitle: '今日币圈 · 升温话题（Top 5）',
      aiSummary: '加载中…',
    },
  }
}

export function buildDataFallback(error: string): PrescientData {
  const digest = buildDigestFallback(error)
  return {
    live: false,
    sourceLabel: '离线',
    briefing: {
      generatedAt: '—',
      oneLiner: `数据拉取失败：${error}。请确认 /api/prescient 可访问（本地需 npm run dev；Vercel 部署需 api 函数）。`,
      topShifts: [],
      hotNarratives: [],
      topAgenda: [],
      topDispute: null,
      topOpportunities: [],
    },
    digest,
    shifts: [],
    narratives: {
      rising: [],
      cooling: [],
      disputes: [],
      aiJudgment: error,
    },
    agenda: { tomorrow: [], weekAhead: [], tip: error },
    disputes: [],
    opportunities: {
      dateLabel: '—',
      updatedAt: '—',
      rangeLabel: 'Odaily 最新流',
      sourceNote: 'Odaily RSS 仅保留最新约 20 条快讯/文章，历史月份通常无缓存数据',
      defaultMonth: currentMonthKey(),
      months: [
        {
          ...emptyOpportunityMonth(
            currentMonthKey(),
            `${currentMonthKey().slice(0, 4)}年${currentMonthKey().slice(5)}月`,
          ),
          summary: `数据不可用：${error}`,
        },
      ],
      recentFallback: [],
    },
    raw: {
      articles: [],
      flashes: [],
      flashSectionTitle: '今日币圈 · 升温话题（Top 5）',
      aiSummary: error,
    },
  }
}

export function filterShiftsByInterests(
  shifts: PrescientData['shifts'],
  interests: string[],
): PrescientData['shifts'] {
  if (interests.length === 0) return shifts
  return shifts
    .map((s) => {
      const text = `${s.title} ${s.analysis} ${s.domains.join(' ')}`
      const match = matchesInterestTags(text, interests)
      return { ...s, relevance: match ? (s.relevance ?? 3) + 2 : s.relevance }
    })
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
}
