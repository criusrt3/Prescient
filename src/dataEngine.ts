import type { PrescientData } from './types'
import { buildDigestFallback, buildDigestLoading } from './digestEngine'
import { emptyOpportunityBuckets } from './types'

const emptyOpportunities = () => ({
  dateLabel: '—',
  updatedAt: '—',
  summary: '正在加载币圈机会…',
  buckets: emptyOpportunityBuckets(),
  highlights: [],
})

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
      summary: `数据不可用：${error}`,
      buckets: emptyOpportunityBuckets(),
      highlights: [],
    },
    raw: {
      articles: [],
      flashes: [],
      flashSectionTitle: '今日币圈 · 升温话题（Top 5）',
      aiSummary: error,
    },
  }
}

const INTEREST_MATCHERS: Record<string, RegExp> = {
  '科技 / AI': /AI|OpenAI|科技|监管|法案|半导体|芯片|网信办|LifeSciBench|英伟达/i,
  '宏观 / 政策': /宏观|政策|美联储|央行|降息|通胀|CPI|非农|标普|GDP|利率|央行/i,
  '地缘 / 能源': /地缘|能源|战争|伊朗|以色列|黎巴嫩|停火|导弹|石油|海峡|中东/i,
  '商业 / 创业': /商业|创业|IPO|上市|融资|初创|交易所|Kalshi|预测市场/i,
  '金融 / 市场': /金融|市场|比特币|BTC|ETH|加密|DeFi|美股|ETF|币安|Tether|稳定币|Strategy/i,
}

export function filterShiftsByInterests(
  shifts: PrescientData['shifts'],
  interests: string[],
): PrescientData['shifts'] {
  if (interests.length === 0) return shifts
  return shifts
    .map((s) => {
      const text = `${s.title} ${s.analysis} ${s.domains.join(' ')}`
      const match = interests.some((tag) => INTEREST_MATCHERS[tag]?.test(text))
      return { ...s, relevance: match ? (s.relevance ?? 3) + 2 : s.relevance }
    })
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
}
