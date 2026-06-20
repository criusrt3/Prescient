/**
 * Prescient 数据核心 — Odaily RSS 拉取与 M1–M5 映射。
 * 供 Vite dev 中间件与 Vercel Serverless 共用。
 */

const RSS_FLASH = 'https://rss.odaily.news/rss/newsflash'
const RSS_POST = 'https://rss.odaily.news/rss/post'
const UA = 'Prescient-UI/0.2 (+vite-odaily-proxy)'

const CRYPTO_KW =
  /BTC|ETH|SOL|BNB|XRP|USDT|ETF|DeFi|Web3|Polymarket|比特币|以太坊|加密|区块链|代币|合约|巨鲸|交易所|Strategy|Tether|Upbit|钱包|链上/i

/** 最新快讯分类定义（匹配逻辑见 classifyFlashCategories） */
const FLASH_CATEGORY_DEFS: { id: string; label: string }[] = [
  { id: 'prediction-market', label: '预测市场' },
  { id: 'ai', label: 'AI' },
  { id: 'celebrity-views', label: '名人观点' },
  { id: 'crypto-stocks', label: '币股动态' },
  { id: 'project-updates', label: '项目动向' },
  { id: 'onchain-data', label: '链上数据' },
  { id: 'exchange-announcements', label: '交易所公告' },
  { id: 'fundraising', label: '融资信息' },
  { id: 'macro-policy', label: '宏观政策' },
]

const CELEBRITY_TITLE_RE =
  /^(?:观点[：:]|(?:.*?(?:CEO|创始人|联创|董事长|发言人|分析师|教授|议员|记者|理事|博士|行长|部长|主席))(?:[：:]|(?=\s*(?:表示|称|认为|发文|喊话|回应|点评))|(?=疑似))|(?:Tom Lee|Michael Saylor|CZ|Vitalik|Buterin|孙宇晨|马斯克|Musk|Trump|特朗普|Arthur\s*Hayes|赵长鹏|何一|SBF|Ki Young Ju|Jake Chervinsky|Fabian Dori|Alex Svanevik|Vitalik Buterin)[：:])/i

function flashTitleClean(title: string): string {
  return title.replace(/^【快讯】\s*/, '').trim()
}

/** 标题优先 + 短正文辅助，避免「表示/认为/链上」等泛词误伤 */
function classifyFlashCategories(f: RssItem): string[] {
  const title = flashTitleClean(f.title)
  if (isPlanetDigestTitle(f.title)) return []

  const snippet = (f.body ?? '').slice(0, 180)
  const ids: string[] = []

  if (/Polymarket|Kalshi|Opinion\.trade|预测市场|押注市场|对赌市场/i.test(title + snippet)) {
    ids.push('prediction-market')
  }

  if (
    /人工智能|大模型|OpenAI|Anthropic|Claude|GPT-?\d|DeepSeek|英伟达|NVIDIA|LLM|生成式\s*AI|AI\s*基础设施|Gemini|Llama|xAI|Sora|智谱|Minimax/i.test(
      title,
    ) ||
    (/AI/i.test(title) && /基础设施|监管|模型|芯片/i.test(title))
  ) {
    ids.push('ai')
  }

  if (CELEBRITY_TITLE_RE.test(title)) {
    ids.push('celebrity-views')
  }

  if (
    /纳斯达克|纽交所|美股|港股|上市公司|矿企|矿业股|币股|MSTR|STRC|Bitdeer|Riot|Marathon|CleanSpark|IREN|MARA|RIOT/i.test(
      title + snippet,
    )
  ) {
    ids.push('crypto-stocks')
  }

  if (
    /主网上线|测试网上线|硬分叉|空投(?:开启|发放)?|代币解锁|治理提案|协议升级|跨链桥|Layer\s*2|\bL2\b|Rollup|路线图|主网将于/i.test(
      title,
    )
  ) {
    ids.push('project-updates')
  }

  if (
    /链上(?:数据|监测|分析|显示|记录)|巨鲸|TVL|Gas\s*费|资金费率|净流入|净流出|未平仓|清算(?:额|数据)|监测.*(?:增持|减持)|(?:增持|减持).*(?:枚|万美元|万枚)|转移.*\d+.*枚/i.test(
      title,
    ) ||
    (/持仓/.test(title) && /枚|万美元|万枚|BTC|ETH|SOL/i.test(title))
  ) {
    ids.push('onchain-data')
  }

  if (
    /^(?:Gate|Upbit|Binance|币安|Coinbase|OKX|Bybit|Kraken|Bitget|抹茶|Hyperliquid)/i.test(title) &&
    /上线|下架|退市|暂停|恢复|充提|公告|现货|合约/i.test(title)
  ) {
    ids.push('exchange-announcements')
  }

  if (
    /融资|领投|参投|估值达|募资|种子轮|A\s*轮融资|B\s*轮融资|完成.*亿美元|完成.*万美元|战略投资|收购|并购|拟\s*IPO/i.test(
      title,
    )
  ) {
    ids.push('fundraising')
  }

  if (
    /美联储|Fed|降息|加息|CPI|PPI|非农|央行|ECB|SEC|CFTC|监管(?:框架|政策)|法案|立法|关税|制裁|商务部|财政部|参议院|国会|白宫|停火|战争|导弹|袭击|冲突|攻击|地缘|检察官|洗钱|合规/i.test(
      title,
    ) ||
    (/伊朗|以色列|黎巴嫩|俄罗斯|乌克兰/.test(title) &&
      /战争|冲突|袭击|制裁|停火|导弹|炮击|攻击|敌对|不信任/i.test(title + snippet))
  ) {
    ids.push('macro-policy')
  }

  return ids
}
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
  const todayFlashes = flashes.filter((f) => isToday(f.publishedAt))

  for (let i = 0; i < Math.min(rising.length, 3); i++) {
    const topic = rising[i]
    const re = topicMap.get(topic.name)
    const related = re
      ? flashes.filter((f) => re.test(`${f.title} ${f.body ?? ''}`))
      : []
    const todayRelated = related.filter((f) => isToday(f.publishedAt))
    const relatedPool = todayRelated.length >= 2 ? todayRelated : related.slice(0, 10)
    const main = relatedPool[0] ?? flashes[i]
    if (!main) continue
    const body = main.body || main.title
    const src = sourceFromItem(main)[0]
    const relatedFlashes = pickDisputeRelatedFlashes(main, relatedPool, todayFlashes)
    disputes.push({
      id: `d${i + 1}`,
      name: topic.name,
      score: topic.heat,
      sources: sourceFromItem(main),
      relatedFlashes,
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
      insight: `「${topic.name}」相关报道今日出现 ${todayRelated.length || related.length || 1} 条，市场分歧指数 ${topic.heat}。`,
    })
  }

  if (disputes.length === 0 && flashes[0]) {
    const f = flashes[0]
    const body = f.body || f.title
    const src = sourceFromItem(f)[0]
    const relatedFlashes = pickDisputeRelatedFlashes(f, todayFlashes, todayFlashes)
    disputes.push({
      id: 'd1',
      name: f.title.length > 28 ? `${f.title.slice(0, 28)}…` : f.title,
      score: 68,
      sources: sourceFromItem(f),
      relatedFlashes,
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

const PLANET_DIGEST_RE = /^星球(早|午|晚)讯/
const ODAILY_ITEM_URL_RE = /^https:\/\/www\.odaily\.news\/zh-CN\/(post|newsflash)\/\d+$/

function isPlanetDigestTitle(title: string): boolean {
  return PLANET_DIGEST_RE.test(title.replace(/^【快讯】\s*/, '').trim())
}

function toDigestItem(f: RssItem): { id: string; text: string; url?: string } {
  const text = flashLine(f.title)
  const url = verifiedFlashUrl(f.url)
  return url ? { id: f.id, text, url } : { id: f.id, text }
}

function verifiedFlashUrl(url: string): string | undefined {
  return ODAILY_ITEM_URL_RE.test(url) ? url : undefined
}

function formatFlashTimeBj(iso?: string): string {
  if (!iso) return '--:--'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function flashTimeDeltaMs(a: RssItem, b: RssItem): number {
  const aTs = a.publishedAt ? new Date(a.publishedAt).getTime() : Number.MAX_SAFE_INTEGER
  const bTs = b.publishedAt ? new Date(b.publishedAt).getTime() : Number.MAX_SAFE_INTEGER
  return Math.abs(aTs - bTs)
}

function toDisputeRelatedFlash(f: RssItem) {
  return {
    id: f.id,
    title: flashTitleClean(f.title),
    time: formatFlashTimeBj(f.publishedAt),
    url: verifiedFlashUrl(f.url),
  }
}

function pickDisputeRelatedFlashes(
  main: RssItem,
  topicRelated: RssItem[],
  todayFlashes: RssItem[],
  limit = 5,
) {
  const seen = new Set<string>([main.url])
  let pool = topicRelated.filter((f) => f.url !== main.url)

  if (pool.length < 3) {
    const mainTs = main.publishedAt ? new Date(main.publishedAt).getTime() : 0
    const windowMs = 3 * 60 * 60 * 1000
    for (const f of todayFlashes) {
      if (!f.url || seen.has(f.url) || f.url === main.url) continue
      if (!mainTs || !f.publishedAt) continue
      const delta = Math.abs(new Date(f.publishedAt).getTime() - mainTs)
      if (delta <= windowMs) pool.push(f)
    }
  }

  const unique: RssItem[] = []
  for (const f of pool) {
    if (!f.url || seen.has(f.url)) continue
    seen.add(f.url)
    unique.push(f)
  }

  return unique
    .sort((a, b) => flashTimeDeltaMs(main, a) - flashTimeDeltaMs(main, b))
    .slice(0, limit)
    .map((f) => toDisputeRelatedFlash(f))
}

function todayFlashPool(flashes: RssItem[]): RssItem[] {
  return flashes.filter((f) => isToday(f.publishedAt))
}

function buildCategoryFlashes(flashes: RssItem[]) {
  const today = todayFlashPool(flashes)
  const buckets = FLASH_CATEGORY_DEFS.map(({ id, label }) => ({
    id,
    label,
    count: 0,
    items: [] as ReturnType<typeof toDigestItem>[],
  }))
  const bucketMap = new Map(buckets.map((b) => [b.id, b]))

  for (const f of today) {
    const cats = classifyFlashCategories(f)
    if (!cats.length) continue
    const item = toDigestItem(f)
    for (const catId of cats) {
      const bucket = bucketMap.get(catId)
      if (!bucket) continue
      bucket.items.push(item)
      bucket.count += 1
    }
  }

  return buckets
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

function buildBriefingOneLiner(
  rising: { name: string }[],
  cooling: { name: string }[],
  topShifts: { level: string }[],
  topOpportunities: { kindLabel: string; title: string }[],
): string {
  const hot = rising.map((r) => r.name).slice(0, 2).join('、')
  const cool = cooling.map((c) => c.name).slice(0, 2).join('、')
  const hardCount = topShifts.filter((s) => s.level === 'hard').length

  if (hot) {
    let line = `今日舆论主线围绕「${hot}」`
    if (cool) line += `，「${cool}」等话题温度回落`
    line += '。'
    line +=
      hardCount > 0
        ? `已识别 ${hardCount} 条硬事实变局，宜优先跟踪地缘与政策后续。`
        : '共识仍在形成，建议结合下方模块交叉验证。'
    if (topOpportunities.length) {
      const oppHint = topOpportunities
        .slice(0, 2)
        .map((o) => o.title.slice(0, 18))
        .join('、')
      line += ` 币圈侧有 ${topOpportunities.length} 条可参与机会（${oppHint}等）值得关注。`
    }
    return line
  }

  if (topShifts.length) {
    let line = `今日共 ${topShifts.length} 条核心变局待跟踪，详见 M1 今日变局。`
    if (topOpportunities.length) {
      line += ` 另有 ${topOpportunities.length} 条币圈机会可查看 M6。`
    }
    return line
  }

  if (topOpportunities.length) {
    return `今日暂未形成清晰宏观主线，但识别到 ${topOpportunities.length} 条币圈参与机会，建议优先查看 M6。`
  }

  return '正在汇聚 Odaily 最新报道。'
}

function pickBriefingOpportunities(
  opportunities: ReturnType<typeof buildCryptoOpportunities>,
): ReturnType<typeof toCryptoOpportunity>[] {
  const slice = opportunities.months.find((m) => m.key === opportunities.defaultMonth) ?? opportunities.months[0]
  if (!slice) return []
  return slice.buckets.flatMap((bucket) => bucket.items).slice(0, 3)
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

function buildRawFlashes(flashes: RssItem[], rising: { name: string }[]) {
  const pool = recentFlashPool(flashes)
  const topicMap = new Map(NARRATIVE_TOPICS)
  const picked: RssItem[] = []
  const seen = new Set<string>()

  const tryAdd = (f: RssItem) => {
    if (seen.has(f.url)) return
    seen.add(f.url)
    picked.push(f)
  }

  for (const topic of rising) {
    if (picked.length >= 5) break
    const re = topicMap.get(topic.name)
    if (!re) continue
    for (const f of pool) {
      if (picked.length >= 5) break
      const text = `${f.title} ${f.body ?? ''}`
      if (re.test(text)) tryAdd(f)
    }
  }

  const fromRising = picked.length

  for (const f of pool) {
    if (picked.length >= 5) break
    if (isCrypto(f.title)) tryAdd(f)
  }

  const addedCrypto = picked.length - fromRising

  for (const f of pool) {
    if (picked.length >= 5) break
    tryAdd(f)
  }

  let sectionTitle = '今日币圈 · 升温话题（Top 5）'
  if (fromRising === 0 && addedCrypto > 0) {
    sectionTitle = '今日币圈（Top 5）'
  } else if (fromRising > 0 && addedCrypto === 0) {
    sectionTitle = '升温话题（Top 5）'
  }

  return { items: picked.slice(0, 5), sectionTitle }
}

function isCrypto(title: string): boolean {
  return CRYPTO_KW.test(title)
}

type OpportunityKind = 'fundraising' | 'lottery' | 'tge' | 'airdrop'

const OPPORTUNITY_BUCKET_DEFS: { id: OpportunityKind; label: string }[] = [
  { id: 'fundraising', label: '项目融资' },
  { id: 'lottery', label: '抽奖活动' },
  { id: 'tge', label: 'TGE / 发售' },
  { id: 'airdrop', label: '空投机会' },
]

function classifyOpportunityKind(title: string, body: string): OpportunityKind | null {
  if (isPlanetDigestTitle(title)) return null
  const t = flashTitleClean(title)
  const snippet = body.slice(0, 400)
  if (/TGE|代币生成事件|公开发售|IDO|IEO|Launchpool|打新|预售|认购(?:开启|启动)|代币发行|新币上线/i.test(`${t} ${snippet}`)) {
    return 'tge'
  }
  if (/空投(?:活动|申领|开启)?|申领资格|快照|空头代币|airdrop/i.test(`${t} ${snippet}`)) {
    return 'airdrop'
  }
  if (/抽奖|幸运(?:用户|大奖)|福利活动|转盘|Galxe|TaskOn|Zealy|积分兑换|领取(?:奖励|福利)|赠品/i.test(`${t} ${snippet}`)) {
    return 'lottery'
  }
  if (isFundraisingOpportunity(t, snippet)) return 'fundraising'
  return null
}

function isFundraisingOpportunity(title: string, body: string): boolean {
  const text = `${title} ${body}`
  if (
    /投研|研报|研究报告|会重演|流动性正在|看跌|看多|观点：|警告|预测|创始人：|CEO：|分析师|主席：|董事长：/i.test(
      title,
    ) &&
    !/(?:完成|获|宣布|领投|估值达).{0,20}(?:融资|亿美元|万美元)|种子轮|A\s*轮融资|B\s*轮融资/i.test(
      title,
    )
  ) {
    return false
  }
  if (/融资市场|证券融资|链上证券/i.test(title) && !/(?:完成|获|宣布|领投|种子轮|A\s*轮)/i.test(title)) {
    return false
  }
  return /(?:完成|获|宣布|筹集).{0,12}(?:融资|投资)|领投|参投|估值达|募资|种子轮|A\s*轮融资|B\s*轮融资|战略投资|完成\s*\d+(?:\.\d+)?(?:万|亿)?美元/i.test(
    text,
  )
}

function extractOpportunityHighlight(kind: OpportunityKind, title: string, body: string): string | undefined {
  const text = `${flashTitleClean(title)} ${body}`
  if (kind === 'fundraising') {
    const amt =
      text.match(/(?:完成|获|筹集|融资)[^\d]{0,16}(\d+(?:\.\d+)?(?:万|亿)?美元)/i) ??
      text.match(/(\d+(?:\.\d+)?(?:万|亿)?美元)[^\n]{0,24}(?:融资|投资)/i)
    const round = text.match(/(种子轮|Pre-Seed|A\s*轮|B\s*轮|C\s*轮|战略投资)/i)
    if (amt) return amt[0].replace(/\s+/g, ' ').slice(0, 42)
    if (round) return round[0]
    return undefined
  }
  if (kind === 'tge') {
    const m = text.match(/(TGE|IDO|IEO|Launchpool|打新|预售)/i)
    return m?.[0]
  }
  if (kind === 'airdrop') return '空投参与'
  if (kind === 'lottery') return '福利 / 抽奖'
  return undefined
}

function toCryptoOpportunity(
  f: RssItem,
  kind: OpportunityKind,
  kindLabel: string,
): {
  id: string
  kind: OpportunityKind
  kindLabel: string
  title: string
  summary: string
  highlight?: string
  date: string
  time: string
  monthKey: string
  url?: string
  sources: { name: string; url: string }[]
} {
  const title = flashTitleClean(f.title)
  const body = (f.body ?? '').replace(/\s+/g, ' ').trim()
  const monthKey = bjMonthKey(f.publishedAt)
  return {
    id: f.id,
    kind,
    kindLabel,
    title,
    summary: body || title,
    highlight: extractOpportunityHighlight(kind, f.title, body),
    date: formatOpportunityDate(f.publishedAt),
    time: formatFlashTimeBj(f.publishedAt),
    monthKey,
    url: verifiedFlashUrl(f.url),
    sources: sourceFromItem(f),
  }
}

function bjMonthKey(iso?: string): string {
  const target = iso ? new Date(iso) : new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(target)
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  return `${year}-${month}`
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  return `${year}年${month}月`
}

function formatOpportunityDate(iso?: string): string {
  if (!iso) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function isWithinLastDays(iso: string | undefined, days: number): boolean {
  if (!iso) return false
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return new Date(iso).getTime() >= cutoff
}

function recentMonthPool(flashes: RssItem[], posts: RssItem[], days = 30): RssItem[] {
  const seen = new Set<string>()
  const out: RssItem[] = []
  for (const f of [...flashes, ...posts]) {
    if (!f.url || seen.has(f.url)) continue
    if (!isWithinLastDays(f.publishedAt, days)) continue
    seen.add(f.url)
    out.push(f)
  }
  return out.sort((a, b) => {
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return bt - at
  })
}

function buildOpportunityBuckets(
  items: ReturnType<typeof toCryptoOpportunity>[],
): { id: OpportunityKind; label: string; count: number; items: ReturnType<typeof toCryptoOpportunity>[] }[] {
  const buckets = OPPORTUNITY_BUCKET_DEFS.map(({ id, label }) => ({
    id,
    label,
    count: 0,
    items: [] as ReturnType<typeof toCryptoOpportunity>[],
  }))
  const bucketMap = new Map(buckets.map((b) => [b.id, b]))
  for (const item of items) {
    bucketMap.get(item.kind)!.items.push(item)
  }
  for (const bucket of buckets) {
    bucket.count = bucket.items.length
  }
  return buckets
}

function isCryptoRelatedItem(f: RssItem): boolean {
  const title = flashTitleClean(f.title)
  if (isPlanetDigestTitle(f.title)) return false
  const body = (f.body ?? '').slice(0, 240)
  return isCrypto(title) || isCrypto(body)
}

function toOpportunityFallback(f: RssItem): {
  id: string
  title: string
  summary: string
  date: string
  time: string
  monthKey: string
  url?: string
  sources: { name: string; url: string }[]
} {
  const title = flashTitleClean(f.title)
  const body = (f.body ?? '').replace(/\s+/g, ' ').trim()
  const monthKey = bjMonthKey(f.publishedAt)
  return {
    id: f.id,
    title,
    summary: body || title,
    date: formatOpportunityDate(f.publishedAt),
    time: formatFlashTimeBj(f.publishedAt),
    monthKey,
    url: verifiedFlashUrl(f.url),
    sources: sourceFromItem(f),
  }
}

function buildOpportunityFallbackItems(
  pool: RssItem[],
  opportunityUrls: Set<string>,
  monthKey: string | null,
  limit = 10,
): ReturnType<typeof toOpportunityFallback>[] {
  const items: ReturnType<typeof toOpportunityFallback>[] = []
  for (const f of pool) {
    if (!f.url || opportunityUrls.has(f.url)) continue
    if (!isCryptoRelatedItem(f)) continue
    if (monthKey && bjMonthKey(f.publishedAt) !== monthKey) continue
    items.push(toOpportunityFallback(f))
    if (items.length >= limit) break
  }
  return items
}

function buildMonthOpportunitiesSummary(
  monthLabel: string,
  buckets: { label: string; count: number }[],
  items: { title: string; highlight?: string }[],
  fallback: { count: number; scope: 'month' | 'recent' } | null = null,
): string {
  const active = buckets.filter((b) => b.count > 0)
  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  if (!total) {
    if (fallback?.count) {
      const hint =
        fallback.scope === 'month'
          ? `下方展示同期 ${fallback.count} 条币圈相关报道供参考`
          : `下方展示近 30 天 ${fallback.count} 条币圈相关报道供参考`
      return `${monthLabel}暂未识别到明确可参与机会，${hint}。`
    }
    return `${monthLabel}暂未识别到明确可参与机会，可切换其他月份或稍后刷新。`
  }
  const counts = active.map((b) => `${b.label} ${b.count} 条`).join('、')
  const top = items
    .filter((i) => i.highlight)
    .slice(0, 2)
    .map((i) => i.title.slice(0, 28))
    .join('、')
  let line = `${monthLabel}共 ${total} 条机会：${counts}。`
  if (top) line += `重点关注：${top}。`
  line += '参与前请核实官方渠道、时间与资格要求，注意风险。'
  return line
}

function collectOpportunityMonthKeys(pool: RssItem[], days = 30): string[] {
  const keys = new Set<string>()
  keys.add(bjMonthKey())
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  keys.add(bjMonthKey(new Date(cutoff).toISOString()))
  for (const f of pool) {
    if (f.publishedAt) keys.add(bjMonthKey(f.publishedAt))
  }
  return [...keys].sort((a, b) => b.localeCompare(a))
}

function resolveMonthFallback(
  monthKey: string,
  currentKey: string,
  opportunityCount: number,
  monthFallback: ReturnType<typeof toOpportunityFallback>[],
  recentFallback: ReturnType<typeof toOpportunityFallback>[],
): {
  items: ReturnType<typeof toOpportunityFallback>[]
  meta: { count: number; scope: 'month' | 'recent' } | null
} {
  if (opportunityCount > 0) return { items: [], meta: null }
  if (monthFallback.length > 0) {
    return { items: monthFallback, meta: { count: monthFallback.length, scope: 'month' } }
  }
  if (monthKey === currentKey && recentFallback.length > 0) {
    return { items: recentFallback, meta: { count: recentFallback.length, scope: 'recent' } }
  }
  return { items: [], meta: null }
}

function buildCryptoOpportunities(flashes: RssItem[], posts: RssItem[]) {
  const pool = recentMonthPool(flashes, posts, 30)
  const byMonth = new Map<string, ReturnType<typeof toCryptoOpportunity>[]>()
  const opportunityUrls = new Set<string>()

  for (const f of pool) {
    if (!f.url || opportunityUrls.has(f.url)) continue
    const kind = classifyOpportunityKind(f.title, f.body ?? '')
    if (!kind) continue
    opportunityUrls.add(f.url)
    const def = OPPORTUNITY_BUCKET_DEFS.find((d) => d.id === kind)!
    const item = toCryptoOpportunity(f, kind, def.label)
    const monthKey = item.monthKey
    const list = byMonth.get(monthKey) ?? []
    list.push(item)
    byMonth.set(monthKey, list)
  }

  const recentFallback = buildOpportunityFallbackItems(pool, opportunityUrls, null, 10)
  const currentKey = bjMonthKey()
  const monthKeys = collectOpportunityMonthKeys(pool, 30)

  const months = monthKeys.map((key) => {
    const items = byMonth.get(key) ?? []
    const buckets = buildOpportunityBuckets(items)
    const label = formatMonthLabel(key)
    const monthFallback = buildOpportunityFallbackItems(pool, opportunityUrls, key, 10)
    const { items: fallbackItems, meta: fallbackMeta } = resolveMonthFallback(
      key,
      currentKey,
      items.length,
      monthFallback,
      recentFallback,
    )
    return {
      key,
      label,
      summary: buildMonthOpportunitiesSummary(label, buckets, items, fallbackMeta),
      totalCount: items.length,
      buckets,
      fallbackItems,
      ...(fallbackMeta ? { fallbackScope: fallbackMeta.scope } : {}),
    }
  })

  const clock = bjClock()

  return {
    dateLabel: bjDateLabel(),
    updatedAt: `${bjDateLabel()} ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
    rangeLabel: '近 30 天',
    defaultMonth: currentKey,
    months,
    recentFallback,
  }
}

function inferDomains(title: string, body: string): string[] {
  const text = `${title} ${body}`
  const domains: string[] = []
  const rules: [RegExp, string][] = [
    [/AI|OpenAI|监管|法案|半导体|芯片|网信办/i, '科技'],
    [/比特币|BTC|ETH|加密|DeFi|代币|Tether|稳定币/i, '加密'],
    [/美联储|央行|降息|通胀|CPI|标普|宏观|利率/i, '宏观'],
    [/战争|伊朗|以色列|黎巴嫩|停火|导弹|能源/i, '地缘'],
    [/IPO|上市|交易所|Kalshi|融资|预测市场/i, '商业'],
  ]
  for (const [re, label] of rules) {
    if (re.test(text) && !domains.includes(label)) domains.push(label)
  }
  return domains.length ? domains : ['资讯']
}

function buildPrescient(flashes: RssItem[], posts: RssItem[]) {
  const shifts = flashes.slice(0, 6).map((f, i) => ({
    id: `s${i + 1}`,
    level: HARD_KW.test(f.title) ? 'hard' : 'soft',
    consensus: /预计|或将|可能/.test(f.title) ? 'seed' : 'brewing',
    title: f.title,
    analysis: (f.body || f.title).slice(0, 160),
    domains: inferDomains(f.title, f.body || f.title),
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
    todayDateLabel: bjDateLabel(),
    updatedAt: `${bjDateLabel()} ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
    nextUpdateMinutes: nextMins,
    latestFlashes: flashes.slice(0, 15).map((f) => toDigestItem(f)),
    categoryFlashes: buildCategoryFlashes(flashes),
    crypto: {
      dateLabel: cryptoDateLabel,
      items: cryptoItems.map((f) => toDigestItem(f)),
    },
    hotTopic: {
      title: hot?.title ?? 'Odaily 星球日报',
      url: hot?.url ?? 'https://www.odaily.news/zh-CN/',
    },
    live: true,
    sourceLabel: 'Odaily RSS 实时',
  }

  const topShifts = shifts.filter((s) => s.level !== 'noise').slice(0, 3)
  const rawFlashes = buildRawFlashes(flashes, rising)
  const opportunities = buildCryptoOpportunities(flashes, posts)
  const topOpportunities = pickBriefingOpportunities(opportunities)

  return {
    live: true,
    sourceLabel: 'Odaily RSS 实时',
    briefing: {
      generatedAt: clock.label,
      oneLiner: buildBriefingOneLiner(rising, cooling, topShifts, topOpportunities),
      topShifts,
      hotNarratives: rising.slice(0, 3),
      topAgenda: agenda.tomorrow.slice(0, 3),
      topDispute: disputes[0] ?? null,
      topOpportunities,
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
    opportunities,
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
      flashes: rawFlashes.items.map((f, i) => ({
        id: `f${i + 1}`,
        kind: 'flash',
        title: f.title,
        body: f.body || f.title,
        time: f.publishedAt?.slice(0, 16).replace('T', ' ') ?? '—',
        url: f.url,
        author: 'Odaily',
      })),
      flashSectionTitle: rawFlashes.sectionTitle,
      aiSummary: (() => {
        const themes = rising.slice(0, 2).map((n) => `「${n.name}」`).join('与')
        const highlights = rawFlashes.items
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

export async function loadPrescientPayload() {
  const [flashXml, postXml] = await Promise.all([fetchRss(RSS_FLASH), fetchRss(RSS_POST)])
  const flashes = parseRss(flashXml, true)
  const posts = parseRss(postXml, true)
  return buildPrescient(flashes, posts)
}
