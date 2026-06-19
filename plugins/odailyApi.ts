/**
 * Vite 内置 Odaily API — 无需单独启动 Python 即可 dev/preview。
 * 解决仅 `npm run dev` 时代理 5181 未启动导致 502 的问题。
 */
import type { Connect, Plugin } from 'vite'

const RSS_FLASH = 'https://rss.odaily.news/rss/newsflash'
const RSS_POST = 'https://rss.odaily.news/rss/post'
const UA = 'Prescient-UI/0.2 (+vite-odaily-proxy)'

const CRYPTO_KW =
  /BTC|ETH|SOL|BNB|XRP|USDT|ETF|DeFi|Web3|Polymarket|比特币|以太坊|加密|区块链|代币|合约|巨鲸|交易所|Strategy|Tether|Upbit|钱包|链上/i
const HARD_KW = /监管|法案|央行|美联储|战争|制裁|SEC|CFTC|立案|通过|生效/i
const AGENDA_KW =
  /明日|将于|本周|下周|发布会|听证会|利率决议|数据公布|上线|开幕|公布|决议|即将|预计|召开|峰会|解锁|空投|投票|升级|财报|业绩|审议|听证/i

function toAgendaItem(f: RssItem, idx: number, bucket: 'tomorrow' | 'week') {
  return {
    id: `a${idx}`,
    time: f.title.match(/\d{1,2}:\d{2}/)?.[0] ?? '全天',
    date:
      bucket === 'week'
        ? f.title.includes('下周')
          ? '下周'
          : '本周'
        : f.title.includes('明日')
          ? '明日'
          : bjDateLabel(),
    level: (HARD_KW.test(f.title) ? 'hard' : 'soft') as 'hard' | 'soft',
    title: f.title,
    impact: (f.body || f.title).slice(0, 80),
    sources: sourceFromItem(f),
  }
}

function buildAgenda(flashes: RssItem[]) {
  const tomorrow: ReturnType<typeof toAgendaItem>[] = []
  const weekAhead: ReturnType<typeof toAgendaItem>[] = []

  for (const f of flashes) {
    const text = `${f.title} ${f.body ?? ''}`
    if (!AGENDA_KW.test(text)) continue
    if (/本周|下周/.test(f.title)) {
      if (weekAhead.length < 5) weekAhead.push(toAgendaItem(f, weekAhead.length, 'week'))
    } else if (tomorrow.length < 5) {
      tomorrow.push(toAgendaItem(f, tomorrow.length, 'tomorrow'))
    }
  }

  if (tomorrow.length === 0) {
    flashes
      .filter((f) => HARD_KW.test(f.title) || isCrypto(f.title))
      .slice(0, 4)
      .forEach((f, i) => {
        tomorrow.push({
          ...toAgendaItem(f, i, 'tomorrow'),
          date: '近期关注',
          impact: `延续跟踪：${(f.body || f.title).slice(0, 60)}`,
        })
      })
  }

  if (weekAhead.length === 0) {
    flashes
      .filter((f) => isCrypto(f.title) && !tomorrow.some((t) => t.title === f.title))
      .slice(0, 3)
      .forEach((f, i) => {
        weekAhead.push({
          ...toAgendaItem(f, i, 'week'),
          date: '本周后续',
        })
      })
  }

  const tip = tomorrow[0]
    ? `明日关注：${tomorrow[0].title.slice(0, 30)}…`
    : weekAhead[0]
      ? `本周关注：${weekAhead[0].title.slice(0, 30)}…`
      : '暂无明确议程类快讯，已展示近期重要关注事项。'

  return { tomorrow, weekAhead, tip }
}

function buildDisputes(
  flashes: RssItem[],
  rising: { name: string; heat: number; sources?: { name: string; url: string }[] }[],
) {
  const topicMap = new Map(NARRATIVE_TOPICS)
  const disputes = []

  for (let i = 0; i < Math.min(rising.length, 3); i++) {
    const topic = rising[i]
    const re = topicMap.get(topic.name)
    const related = re ? flashes.filter((f) => re.test(f.title)) : []
    const main = related[0] ?? flashes[i]
    if (!main) continue
    const body = main.body || main.title
    const src = sourceFromItem(main)[0]
    disputes.push({
      id: `d${i + 1}`,
      name: topic.name,
      score: topic.heat,
      sources: sourceFromItem(main),
      camps: [
        {
          side: 'optimistic' as const,
          label: '看多派（市场参与者）',
          quote: `「${body.slice(0, 58)}${body.length > 58 ? '…' : ''}」`,
          basis: 'Odaily 快讯',
          source: src,
        },
        {
          side: 'pessimistic' as const,
          label: '谨慎派（风险观察者）',
          quote: '「短期波动可能放大，需关注政策与流动性变化。」',
          basis: '市场风险',
        },
        {
          side: 'neutral' as const,
          label: '中立观察',
          quote: '「单条快讯不足以定论，宜结合更多报道交叉验证。」',
          basis: 'Odaily 实时流',
          source: src,
        },
      ],
      insight: `「${topic.name}」相关报道今日出现 ${related.length || 1} 条，市场分歧指数 ${topic.heat}。`,
    })
  }

  if (disputes.length === 0 && flashes[0]) {
    const f = flashes[0]
    const body = f.body || f.title
    const src = sourceFromItem(f)[0]
    disputes.push({
      id: 'd1',
      name: f.title.length > 28 ? `${f.title.slice(0, 28)}…` : f.title,
      score: 68,
      sources: sourceFromItem(f),
      camps: [
        {
          side: 'optimistic' as const,
          label: '看多派',
          quote: `「${body.slice(0, 58)}…」`,
          basis: 'Odaily 快讯',
          source: src,
        },
        {
          side: 'pessimistic' as const,
          label: '谨慎派',
          quote: '「需警惕短期反转风险。」',
          basis: '市场规律',
        },
        {
          side: 'neutral' as const,
          label: '中立',
          quote: '「建议持续跟踪后续报道。」',
          basis: 'Odaily',
          source: src,
        },
      ],
      insight: '该话题在今日快讯中热度较高，观点仍有分歧。',
    })
  }

  return disputes
}
const NARRATIVE_TOPICS: [string, RegExp][] = [
  ['AI 监管', /监管|法案|SEC|CFTC|合规|立法|网信办/i],
  ['AI 科技', /OpenAI|英伟达|半导体|芯片|LifeSciBench/i],
  ['比特币', /比特币|BTC/i],
  ['以太坊', /以太坊|ETH|以太/i],
  ['预测市场', /Polymarket|预测市场|Kalshi/i],
  ['宏观政策', /美联储|降息|通胀|CPI|非农|央行|标普/i],
  ['交易所', /交易所|Upbit|Binance|Coinbase|币安/i],
  ['Strategy', /Strategy|STRC|MicroStrategy/i],
  ['稳定币', /Tether|USDT|稳定币/i],
  ['DeFi', /DeFi|Aave|借贷|流动性/i],
  ['地缘局势', /伊朗|以色列|黎巴嫩|战争|停火|导弹/i],
]

function buildCooling(
  scored: { name: string; count: number; re: RegExp }[],
  rising: { name: string }[],
  todayPool: RssItem[],
  allFlashes: RssItem[],
) {
  const risingNames = new Set(rising.map((r) => r.name))

  const fromToday = scored
    .filter((x) => !risingNames.has(x.name))
    .slice(0, 3)
    .map((x, i) => {
      const sample = todayPool.find((f) => x.re.test(f.title))
      return {
        id: `c${i + 1}`,
        name: x.name,
        heat: Math.max(12, 38 - i * 8),
        delta: -(10 + i * 6),
        trend: 'down' as const,
        sources: sourceFromItem(sample),
      }
    })
  if (fromToday.length) return fromToday

  const fallback = NARRATIVE_TOPICS.map(([name, re]) => ({
    name,
    todayCount: todayPool.filter((f) => re.test(f.title)).length,
    fullCount: allFlashes.filter((f) => re.test(f.title)).length,
    re,
  }))
    .filter((x) => x.fullCount > 0 && !risingNames.has(x.name))
    .sort((a, b) => a.todayCount - b.todayCount || a.fullCount - b.fullCount)
    .slice(0, 3)

  return fallback.map((x, i) => {
    const sample = allFlashes.find((f) => x.re.test(f.title))
    return {
      id: `c${i + 1}`,
      name: x.name,
      heat: Math.max(12, 32 - i * 8 - (x.todayCount === 0 ? 6 : 0)),
      delta: -(12 + i * 5 + Math.max(0, x.fullCount - x.todayCount) * 2),
      trend: 'down' as const,
      sources: sourceFromItem(sample),
    }
  })
}

function sourceFromItem(item?: { title: string; url: string }): { name: string; url: string }[] {
  if (!item?.url) return []
  const name = item.title.length > 36 ? `${item.title.slice(0, 36)}…` : item.title
  return [{ name, url: item.url }]
}

interface RssItem {
  id: string
  title: string
  url: string
  publishedAt?: string
  body?: string
}

function bjParts() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
}

function bjDateLabel(): string {
  const p = bjParts()
  const m = p.find((x) => x.type === 'month')?.value ?? '01'
  const d = p.find((x) => x.type === 'day')?.value ?? '01'
  return `${m}-${d}`
}

function bjTodayIso(): string {
  const p = bjParts()
  const y = p.find((x) => x.type === 'year')?.value ?? '2026'
  const m = p.find((x) => x.type === 'month')?.value ?? '01'
  const d = p.find((x) => x.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

function bjClock(): { hour: number; minute: number; label: string } {
  const p = bjParts()
  const hour = parseInt(p.find((x) => x.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(p.find((x) => x.type === 'minute')?.value ?? '0', 10)
  const y = p.find((x) => x.type === 'year')?.value ?? ''
  const m = p.find((x) => x.type === 'month')?.value ?? ''
  const d = p.find((x) => x.type === 'day')?.value ?? ''
  return {
    hour,
    minute,
    label: `${y}/${m}/${d} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripHtml(s: string): string {
  let decoded = decodeXml(s)
  // 部分 RSS 双重转义，再解一层
  if (/&lt;|&gt;|&amp;/.test(decoded)) {
    decoded = decodeXml(decoded)
  }
  return decoded
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractOdailyAuthor(body: string): string | undefined {
  const patterns = [
    /作者[｜|]\s*([^（(\n@]+)/,
    /原文作者[：:]\s*([^原\n,，：:]+)/,
    /原文编译[：:]\s*([^原\n,，：:]+)/,
  ]
  for (const re of patterns) {
    const m = body.match(re)
    const name = m?.[1]?.trim()
    if (name) return name
  }
  return undefined
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].trim() : ''
}

function parseRss(xml: string, withBody = false): RssItem[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []
  return blocks.map((block) => {
    const title = stripHtml(tag(block, 'title'))
    const url = stripHtml(tag(block, 'link'))
    const pubRaw = tag(block, 'pubDate')
    let publishedAt: string | undefined
    if (pubRaw) {
      const d = new Date(pubRaw)
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString()
    }
    const body = withBody
      ? stripHtml(tag(block, 'description')).replace(/^Odaily星球日报讯\s*/, '')
      : undefined
    return {
      id: url.split('/').pop() || title.slice(0, 32),
      title,
      url,
      publishedAt,
      body,
    }
  })
}

async function fetchRss(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`RSS ${res.status}: ${url}`)
  return res.text()
}

function flashLine(title: string): string {
  const clean = title.replace(/^【快讯】\s*/, '').trim()
  return clean.endsWith('；') ? clean : `${clean}；`
}

function isToday(iso?: string): boolean {
  if (!iso) return false
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
  return day === bjTodayIso()
}

/** 今日快讯不足时回退到 RSS 近期流，避免跨日时空列表 */
function recentFlashPool(flashes: RssItem[]): RssItem[] {
  const today = flashes.filter((f) => isToday(f.publishedAt))
  return today.length >= 3 ? today : flashes
}

function flashPoolDateLabel(pool: RssItem[]): string {
  const todayCount = pool.filter((f) => isToday(f.publishedAt)).length
  if (todayCount >= 3) return bjDateLabel()
  const latest = pool[0]?.publishedAt
  if (!latest) return bjDateLabel()
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(latest))
}

function buildCryptoItems(pool: RssItem[]): RssItem[] {
  const crypto = pool.filter((f) => isCrypto(f.title))
  if (crypto.length >= 10) return crypto.slice(0, 10)
  const seen = new Set(crypto.map((f) => f.url))
  const merged = [...crypto]
  for (const f of pool) {
    if (seen.has(f.url)) continue
    merged.push(f)
    seen.add(f.url)
    if (merged.length >= 10) break
  }
  return merged
}

function isCrypto(title: string): boolean {
  return CRYPTO_KW.test(title)
}

function buildPrescient(flashes: RssItem[], posts: RssItem[]) {
  const shifts = flashes.slice(0, 6).map((f, i) => ({
    id: `s${i + 1}`,
    level: HARD_KW.test(f.title) ? 'hard' : 'soft',
    consensus: /预计|或将|可能/.test(f.title) ? 'seed' : 'brewing',
    title: f.title,
    analysis: (f.body || f.title).slice(0, 160),
    domains: isCrypto(f.title) ? ['加密'] : ['资讯'],
    sources: sourceFromItem(f),
    relevance: 3,
  }))

  const pool = recentFlashPool(flashes)
  const scored = NARRATIVE_TOPICS.map(([name, re]) => ({
    name,
    count: pool.filter((f) => re.test(f.title)).length,
    re,
  }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)

  const rising = scored.slice(0, 4).map((x, i) => {
    const sample = pool.find((f) => x.re.test(f.title))
    return {
      id: `n${i + 1}`,
      name: x.name,
      heat: Math.min(95, 42 + x.count * 12),
      delta: x.count * 4 + 3,
      trend: 'up' as const,
      sources: sourceFromItem(sample),
    }
  })

  const cooling = buildCooling(scored, rising, pool, flashes)

  const agenda = buildAgenda(flashes)
  const disputes = buildDisputes(flashes, rising)

  const hot = posts[0]
  const cryptoItems = buildCryptoItems(pool)
  const cryptoDateLabel = flashPoolDateLabel(pool)

  const clock = bjClock()
  const nextMins = Math.max(120 - ((clock.hour * 60 + clock.minute) % 120), 1)

  const digest = {
    dateLabel: bjDateLabel(),
    updatedAt: `${bjDateLabel()} ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
    nextUpdateMinutes: nextMins,
    latestFlashes: flashes.slice(0, 15).map((f) => ({ id: f.id, text: flashLine(f.title) })),
    crypto: {
      dateLabel: cryptoDateLabel,
      items: cryptoItems.map((f) => ({ id: f.id, text: flashLine(f.title) })),
    },
    hotTopic: {
      title: hot?.title ?? 'Odaily 星球日报',
      url: hot?.url ?? 'https://www.odaily.news/zh-CN/',
    },
    live: true,
    sourceLabel: 'Odaily RSS 实时',
  }

  const topShifts = shifts.filter((s) => s.level !== 'noise').slice(0, 3)

  return {
    live: true,
    sourceLabel: 'Odaily RSS 实时',
    briefing: {
      generatedAt: clock.label,
      oneLiner: topShifts.length
        ? `今日 Odaily 主线：${topShifts.map((s) => s.title.slice(0, 22)).join(' · ')}。`
        : '正在汇聚 Odaily 最新报道。',
      topShifts,
      hotNarratives: rising.slice(0, 3),
      topAgenda: agenda.tomorrow.slice(0, 3),
      topDispute: disputes[0] ?? null,
    },
    digest,
    shifts,
    narratives: {
      rising,
      cooling,
      disputes: rising.slice(0, 3).map((n) => ({
        name: n.name,
        score: n.heat,
        sources: n.sources,
      })),
      aiJudgment: (() => {
        const hot = rising.map((r) => r.name).slice(0, 2).join('、') || '市场动态'
        const cool = cooling.map((c) => c.name).slice(0, 2).join('、')
        if (cool) {
          return `今日 Odaily 快讯主线集中在「${hot}」；「${cool}」等话题热度相对回落。`
        }
        return `今日 Odaily 快讯主线集中在「${hot}」。`
      })(),
    },
    agenda,
    disputes,
    raw: {
      articles: posts.slice(0, 5).map((p, i) => ({
        id: `r${i + 1}`,
        kind: 'article',
        title: p.title,
        body: p.body || p.title,
        author: extractOdailyAuthor(p.body || '') ?? 'Odaily',
        time: p.publishedAt?.slice(0, 16).replace('T', ' ') ?? '—',
        url: p.url,
      })),
      flashes: flashes.slice(0, 5).map((f, i) => ({
        id: `f${i + 1}`,
        kind: 'flash',
        title: f.title,
        body: f.body || f.title,
        time: f.publishedAt?.slice(0, 16).replace('T', ' ') ?? '—',
        url: f.url,
        author: 'Odaily',
      })),
      aiSummary: (() => {
        const themes = rising.slice(0, 2).map((n) => `「${n.name}」`).join('与')
        const highlights = flashes
          .slice(0, 3)
          .map((f) => f.title.slice(0, 28))
          .join('；')
        if (themes) {
          return `过去数小时报道主线围绕${themes}展开。${highlights}。市场共识仍在形成，宜结合深度稿与快讯交叉阅读。`
        }
        return `过去数小时 Odaily 报道主线：${highlights}。`
      })(),
    },
  }
}

async function handleApi(req: Connect.IncomingMessage, res: Connect.ServerResponse, url: string) {
  try {
    if (url === '/api/health' || url.startsWith('/api/health?')) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, service: 'vite-odaily-proxy' }))
      return
    }
    if (url === '/api/prescient' || url.startsWith('/api/prescient?')) {
      const [flashXml, postXml] = await Promise.all([fetchRss(RSS_FLASH), fetchRss(RSS_POST)])
      const flashes = parseRss(flashXml, true)
      const posts = parseRss(postXml, true)
      const payload = buildPrescient(flashes, posts)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
      return
    }
    res.statusCode = 404
    res.end('Not found')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[prescient-api]', msg)
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: msg }))
  }
}

function apiMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url?.split('?')[0] ?? ''
    if (!url.startsWith('/api/')) return next()
    void handleApi(req, res, req.url ?? '')
  }
}

export function prescientApiPlugin(): Plugin {
  return {
    name: 'prescient-odaily-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware())
    },
  }
}
