import type { DigestData, DigestItem, OdailyDigestPayload } from './types'

function getBeijingTime(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  return {
    hour: parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10),
    minute: parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10),
  }
}

function beijingDateLabel(): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const month = parts.find((p) => p.type === 'month')?.value ?? '06'
  const day = parts.find((p) => p.type === 'day')?.value ?? '19'
  return `${month}-${day}`
}

function twoHourSlot(hour: number): number {
  return Math.floor(hour / 2) * 2
}

function formatFlashLine(title: string): string {
  const clean = title.replace(/^【快讯】\s*/, '').trim()
  return clean.endsWith('；') || clean.endsWith(';') ? clean : `${clean}；`
}

function toDigestItems(items: { id: string; title: string; url?: string }[]): DigestItem[] {
  return items.map((item) => {
    const row: DigestItem = {
      id: String(item.id),
      text: formatFlashLine(item.title),
    }
    if (item.url) row.url = item.url
    return row
  })
}

export function minutesToNextUpdate(): number {
  const { hour, minute } = getBeijingTime()
  const totalMins = hour * 60 + minute
  const nextBoundary = (Math.floor(totalMins / 120) + 1) * 120
  return Math.max(nextBoundary - totalMins, 1)
}

export function buildDigestLoading(): DigestData {
  const dateLabel = beijingDateLabel()
  const { hour } = getBeijingTime()
  const slot = twoHourSlot(hour)
  return {
    dateLabel,
    updatedAt: `${dateLabel} ${String(slot).padStart(2, '0')}:00`,
    nextUpdateMinutes: minutesToNextUpdate(),
    latestFlashes: [{ id: 'loading', text: '正在从 Odaily 拉取最新快讯…' }],
    crypto: {
      dateLabel,
      items: [{ id: 'loading-c', text: '正在加载币圈快讯…' }],
    },
    hotTopic: { title: '加载中', url: 'https://www.odaily.news/zh-CN/' },
    live: false,
    sourceLabel: 'Odaily RSS',
  }
}

export function buildDigestFromOdaily(payload: OdailyDigestPayload): DigestData {
  const dateLabel = beijingDateLabel()
  const hot = payload.hotPost

  return {
    dateLabel,
    updatedAt: payload.fetchedAt,
    nextUpdateMinutes: minutesToNextUpdate(),
    latestFlashes: toDigestItems(payload.latestFlashes),
    crypto: {
      dateLabel,
      items: toDigestItems(payload.cryptoFlashes),
    },
    hotTopic: hot
      ? { title: hot.title, url: hot.url }
      : { title: '暂无专题', url: 'https://www.odaily.news/zh-CN/' },
    live: true,
    sourceLabel: 'Odaily RSS 实时',
  }
}

/** Mock 回退（API 不可用时） */
const FALLBACK_LATEST: DigestItem[] = [
  { id: 'h1', text: '快讯服务暂不可用，请确认已启动 Odaily 代理（python server/main.py）；' },
]

export function buildDigestFallback(error?: string): DigestData {
  const dateLabel = beijingDateLabel()
  const { hour } = getBeijingTime()
  const slot = twoHourSlot(hour)
  const msg = error ? `拉取失败：${error}；` : FALLBACK_LATEST[0].text
  return {
    dateLabel,
    updatedAt: `${dateLabel} ${String(slot).padStart(2, '0')}:00`,
    nextUpdateMinutes: minutesToNextUpdate(),
    latestFlashes: [{ id: 'err', text: msg }],
    crypto: { dateLabel, items: [{ id: 'err-c', text: msg }] },
    hotTopic: { title: 'Odaily 星球日报', url: 'https://www.odaily.news/zh-CN/' },
    live: false,
    sourceLabel: '离线回退',
  }
}
