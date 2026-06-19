import type { PrescientData } from './types'
import { buildDigestFallback, buildDigestLoading } from './digestEngine'

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
    raw: {
      articles: [],
      flashes: [{ id: 'l1', kind: 'flash', title: '加载中', body: '加载中', time: '—' }],
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
    raw: {
      articles: [],
      flashes: [],
      aiSummary: error,
    },
  }
}

export function filterShiftsByInterests(
  shifts: PrescientData['shifts'],
  interests: string[],
): PrescientData['shifts'] {
  if (interests.length === 0) return shifts
  const keywords = interests.flatMap((tag) => tag.split('/').map((s) => s.trim()))
  return shifts
    .map((s) => {
      const match = s.domains.some((d) =>
        keywords.some((k) => d.includes(k) || k.includes(d.slice(0, 2))),
      )
      return { ...s, relevance: match ? (s.relevance ?? 3) + 2 : s.relevance }
    })
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
}
