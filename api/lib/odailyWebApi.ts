/**
 * Odaily Web API — 分页拉取快讯/文章，供币圈机会模块深度扫描。
 * 文档入口：https://www.odaily.news （web-api.odaily.news）
 */

const ODAILY_WEB_API = 'https://web-api.odaily.news'
const UA = 'Prescient-UI/0.2 (+odaily-web-api)'

export const OPPORTUNITY_LOOKBACK_DAYS = 120
export const OPPORTUNITY_FETCH_CONCURRENCY = 8
export const OPPORTUNITY_MAX_FLASH_PAGES = 200
export const OPPORTUNITY_MAX_POST_PAGES = 20
export const OPPORTUNITY_PAGE_SIZE = 50

export interface OdailyFeedItem {
  id: string
  title: string
  url: string
  publishedAt?: string
  body?: string
}

interface OdailyNewsflashDto {
  id: number
  title: string
  description?: string
  publishTimestamp: number
  newsUrl?: string
}

interface OdailyPostDto {
  id: number
  title: string
  summary?: string
  publishTimestamp: number
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toBjIso(ms: number): string {
  return new Date(ms).toISOString()
}

function newsflashToFeedItem(row: OdailyNewsflashDto): OdailyFeedItem {
  const body = stripHtml(row.description ?? '').replace(/^Odaily星球日报讯\s*/, '')
  return {
    id: String(row.id),
    title: row.title,
    url: row.newsUrl || `https://www.odaily.news/zh-CN/newsflash/${row.id}`,
    publishedAt: toBjIso(row.publishTimestamp),
    body,
  }
}

function postToFeedItem(row: OdailyPostDto): OdailyFeedItem {
  return {
    id: `post-${row.id}`,
    title: row.title,
    url: `https://www.odaily.news/zh-CN/post/${row.id}`,
    publishedAt: toBjIso(row.publishTimestamp),
    body: stripHtml(row.summary ?? ''),
  }
}

async function fetchOdailyJson<T>(path: string): Promise<T> {
  const res = await fetch(`${ODAILY_WEB_API}${path}`, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      'x-locale': 'zh-CN',
      Origin: 'https://www.odaily.news',
      Referer: 'https://www.odaily.news/zh-CN/newsflash',
    },
  })
  if (!res.ok) {
    throw new Error(`Odaily Web API ${res.status}: ${path}`)
  }
  const json = (await res.json()) as { code?: number; data?: T }
  if (json.code !== 200 || !json.data) {
    throw new Error(`Odaily Web API error: ${path}`)
  }
  return json.data
}

async function fetchNewsflashPage(page: number, size = OPPORTUNITY_PAGE_SIZE): Promise<OdailyNewsflashDto[]> {
  const data = await fetchOdailyJson<{ list?: OdailyNewsflashDto[] }>(
    `/newsflash/page?page=${page}&size=${size}`,
  )
  return data.list ?? []
}

async function fetchPostPage(page: number, size = 30): Promise<OdailyPostDto[]> {
  const data = await fetchOdailyJson<{ list?: OdailyPostDto[] }>(`/post/page?page=${page}&size=${size}`)
  return data.list ?? []
}

export async function fetchOdailyNewsflashPool(
  daysBack = OPPORTUNITY_LOOKBACK_DAYS,
): Promise<OdailyFeedItem[]> {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000
  const seen = new Set<string>()
  const out: OdailyFeedItem[] = []
  let page = 1
  let done = false

  while (page <= OPPORTUNITY_MAX_FLASH_PAGES && !done) {
    const pages = Array.from({ length: OPPORTUNITY_FETCH_CONCURRENCY }, (_, i) => page + i).filter(
      (p) => p <= OPPORTUNITY_MAX_FLASH_PAGES,
    )
    const pageResults = await Promise.all(
      pages.map(async (p) => {
        try {
          return { page: p, list: await fetchNewsflashPage(p) }
        } catch {
          return { page: p, list: [] as OdailyNewsflashDto[] }
        }
      }),
    )

    let emptyBatch = true
    for (const { page: p, list } of pageResults.sort((a, b) => a.page - b.page)) {
      if (!list.length) {
        done = true
        break
      }
      emptyBatch = false
      for (const row of list) {
        if (row.publishTimestamp < cutoff) {
          done = true
          break
        }
        const item = newsflashToFeedItem(row)
        if (seen.has(item.url)) continue
        seen.add(item.url)
        out.push(item)
      }
      if (done) break
    }

    if (emptyBatch) break
    page += OPPORTUNITY_FETCH_CONCURRENCY
  }

  return out.sort((a, b) => {
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return bt - at
  })
}

export async function fetchOdailyPostPool(
  daysBack = OPPORTUNITY_LOOKBACK_DAYS,
  maxPages = OPPORTUNITY_MAX_POST_PAGES,
): Promise<OdailyFeedItem[]> {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000
  const seen = new Set<string>()
  const out: OdailyFeedItem[] = []

  for (let page = 1; page <= maxPages; page++) {
    const list = await fetchPostPage(page).catch(() => [])
    if (!list.length) break
    let reached = false
    for (const row of list) {
      if (row.publishTimestamp < cutoff) {
        reached = true
        break
      }
      const item = postToFeedItem(row)
      if (seen.has(item.url)) continue
      seen.add(item.url)
      out.push(item)
    }
    if (reached) break
  }

  return out
}

export async function fetchOdailyOpportunityFeed(): Promise<{
  flashes: OdailyFeedItem[]
  posts: OdailyFeedItem[]
}> {
  const [flashes, posts] = await Promise.all([fetchOdailyNewsflashPool(), fetchOdailyPostPool()])
  return { flashes, posts }
}
