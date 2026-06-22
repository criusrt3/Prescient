import { applyInterestFilters, buildDataLoading } from './dataEngine'
import { loadOpportunitiesInto, loadPrescientData } from './prescientClient'
import { resolveSourceUrl } from './verifiedSources'
import {
  INTEREST_TAGS,
  MODULES,
  type AgendaItem,
  type DisputeTopic,
  type DigestItem,
  type InterestTag,
  type ModuleId,
  type NarrativeItem,
  type PrescientData,
  type RawArticle,
  type ShiftItem,
  type SignalLevel,
  type ConsensusStage,
  type CryptoOpportunity,
  type BriefingData,
  type OpportunityFallbackItem,
  type NewsSource,
  type ThemeMode,
  findOpportunityMonthSlice,
  buildSelectableMonthKeys,
  formatOpportunityMonthLabel,
} from './types'

const THEME_KEY = 'prescient-theme'

const SIGNAL_LABEL: Record<SignalLevel, { icon: string; label: string; cls: string }> = {
  hard: { icon: '🔴', label: '硬事实', cls: 'signal-hard' },
  soft: { icon: '🟡', label: '软信号', cls: 'signal-soft' },
  noise: { icon: '🟢', label: '背景参考', cls: 'signal-noise' },
}

const CONSENSUS_LABEL: Record<ConsensusStage, { icon: string; label: string }> = {
  seed: { icon: '⬜', label: '萌芽' },
  brewing: { icon: '🟡', label: '发酵中' },
  consensus: { icon: '🟢', label: '已共识' },
}

const CAMP_STYLE = {
  optimistic: { cls: 'camp-opt', label: '乐观派' },
  pessimistic: { cls: 'camp-pes', label: '悲观派' },
  neutral: { cls: 'camp-neu', label: '中立' },
} as const

export function mountApp(root: HTMLElement) {
  let activeModule: ModuleId = 'briefing'
  let interests: InterestTag[] = ['科技 / AI', '宏观 / 政策']
  let data = buildDataLoading()
  let query = ''
  let theme: ThemeMode =
    (localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? 'dark'
  let digestTimer: ReturnType<typeof setTimeout> | null = null
  let digestTab: 'hourly' | 'crypto' = 'hourly'
  let digestFlashCategory: string | null = null
  let opportunityMonth: string | null = null
  let dataRefreshing = false
  let opportunitiesLoading = false

  const refreshAllData = async () => {
    if (dataRefreshing) return
    dataRefreshing = true
    opportunitiesLoading = true
    render()
    try {
      data = await loadPrescientData()
      render()
      data = await loadOpportunitiesInto(data)
    } finally {
      dataRefreshing = false
      opportunitiesLoading = false
      render()
    }
  }

  const applyTheme = () => {
    document.documentElement.setAttribute('data-theme', theme)
  }

  root.addEventListener('change', (e) => {
    const select = (e.target as HTMLElement).closest<HTMLSelectElement>('#opp-month-select')
    if (!select) return
    const key = select.value
    if (!key || key === (opportunityMonth ?? data.opportunities.defaultMonth)) return
    opportunityMonth = key
    render()
    requestAnimationFrame(() => {
      root.querySelector('#opp-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  })

  const render = () => {
    applyTheme()
    const view = applyInterestFilters(data, interests)
    root.innerHTML = `
      <div class="shell">
        ${renderHeader()}
        <div class="layout">
          ${renderSidebar()}
          <main class="main">
            ${renderSearchBar()}
            ${renderModulePanel(activeModule, data, view)}
            ${renderModuleFooter()}
          </main>
        </div>
      </div>
    `
    bindEvents()
    scheduleDigestUpdate()
  }

  const scheduleDigestUpdate = () => {
    if (digestTimer) clearTimeout(digestTimer)
    if (activeModule !== 'digest') return
    const ms = Math.max(data.digest.nextUpdateMinutes * 60 * 1000, 30_000)
    digestTimer = setTimeout(() => {
      void refreshAllData()
    }, ms)
  }

  const renderHeader = () => `
    <header class="header">
      <div class="brand">
        <div class="brand-mark">先</div>
        <div>
          <h1 class="brand-title">先觉 <span>Prescient</span></h1>
          <p class="brand-sub">在共识形成之前，读懂变化</p>
        </div>
      </div>
      <div class="header-meta">
        <span class="live-dot"></span>
        <span>北京时间 ${escapeHtml(data.briefing.generatedAt)}</span>
        <span class="data-source-tag ${data.live ? 'live' : ''}">${dataRefreshing ? '刷新中…' : escapeHtml(data.sourceLabel ?? (data.live ? 'Odaily 实时' : '离线'))}</span>
        <button type="button" class="btn-ghost theme-toggle" id="btn-theme" title="切换主题">
          ${theme === 'dark' ? '☀️ 亮白' : '🌙 深色'}
        </button>
        <button type="button" class="btn-ghost" id="btn-refresh">刷新数据</button>
      </div>
    </header>
  `

  const renderSidebar = () => `
    <aside class="sidebar">
      <section class="sidebar-block">
        <h3>模块导航</h3>
        <nav class="module-nav">
          ${MODULES.map(
            (m) => `
            <button
              type="button"
              class="module-btn ${activeModule === m.id ? 'active' : ''}"
              data-module="${m.id}"
            >
              <span class="module-code">${m.code}</span>
              <span class="module-info">
                <strong>${m.name}</strong>
                <small>${m.desc}</small>
              </span>
            </button>
          `,
          ).join('')}
        </nav>
      </section>

      <section class="sidebar-block">
        <h3>关注领域</h3>
        <p class="sidebar-hint">影响 M1 排序、全览简报内容与币圈机会筛选</p>
        <div class="tag-list">
          ${INTEREST_TAGS.map(
            (tag) => `
            <label class="tag-chip ${interests.includes(tag) ? 'on' : ''}">
              <input type="checkbox" value="${tag}" ${interests.includes(tag) ? 'checked' : ''} />
              ${tag}
            </label>
          `,
          ).join('')}
        </div>
      </section>

      <section class="sidebar-block signal-legend">
        <h3>图例</h3>
        <ul>
          <li><span class="dot hard"></span> 硬事实 — 已确认、不可逆</li>
          <li><span class="dot soft"></span> 软信号 — 可信但未定论</li>
          <li><span class="dot noise"></span> 背景参考 — 有热度无实质</li>
        </ul>
      </section>
    </aside>
  `

  const renderSearchBar = () => `
    <div class="search-bar">
      <input
        id="query-input"
        type="search"
        placeholder="输入关键词路由模块，如：明天有什么大事、分歧、热点趋势…"
        value="${escapeHtml(query)}"
      />
      <button type="button" class="btn-primary" id="btn-route">智能路由</button>
    </div>
    ${query ? `<p class="route-hint">${routeHint(query)}</p>` : ''}
  `

  const renderModulePanel = (
    mod: ModuleId,
    d: PrescientData,
    view: ReturnType<typeof applyInterestFilters>,
  ) => {
    switch (mod) {
      case 'briefing':
        return renderBriefing(view.briefing)
      case 'digest':
        return renderDigest(d)
      case 'm1':
        return renderM1(view.shifts)
      case 'm2':
        return renderM2(d)
      case 'm3':
        return renderM3(d)
      case 'm4':
        return renderM4(d)
      case 'm5':
        return renderM5(d)
      case 'm6':
        return renderM6(d, view.opportunities)
      default:
        return ''
    }
  }

  const renderBriefingOppCompact = (item: CryptoOpportunity) => {
    const linkUrl = resolveSourceUrl(item.url)
    const title = linkUrl
      ? `<a class="brief-opp-link" href="${linkUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
      : escapeHtml(item.title)
    return `
      <div class="compact-item brief-opp-item">
        <span class="brief-opp-kind">${escapeHtml(item.kindLabel)}</span>
        <p class="compact-title">${title}</p>
        ${item.highlight ? `<span class="brief-opp-hint">${escapeHtml(item.highlight)}</span>` : ''}
      </div>
    `
  }

  const renderBriefing = (briefing: BriefingData) => `
    <section class="panel">
      <div class="panel-head">
        <h2>🌅 全览简报</h2>
        <span class="divider-line"></span>
      </div>
      <div class="one-liner">
        <span class="one-liner-label">一句话主线</span>
        <p>${escapeHtml(briefing.oneLiner)}</p>
      </div>

      <div class="briefing-grid">
        <div class="brief-card">
          <h3>M1 · 今日变局</h3>
          ${briefing.topShifts.length ? briefing.topShifts.map((s) => renderShiftCompact(s)).join('') : '<p class="muted">暂无匹配变局</p>'}
        </div>
        <div class="brief-card">
          <h3>M2 · 叙事温度 Top 3</h3>
          ${briefing.hotNarratives.length ? briefing.hotNarratives.map((n) => renderHeatRow(n)).join('') : '<p class="muted">暂无匹配叙事</p>'}
        </div>
        <div class="brief-card">
          <h3>M3 · 明日议程</h3>
          ${briefing.topAgenda.length ? briefing.topAgenda.map((a) => renderAgendaCompact(a)).join('') : '<p class="muted">暂无匹配议程</p>'}
        </div>
        <div class="brief-card">
          <h3>M4 · 高分歧话题</h3>
          ${
            briefing.topDispute
              ? `
            <p class="dispute-name">${escapeHtml(briefing.topDispute.name)}</p>
            <div class="dispute-score">分歧指数 ${briefing.topDispute.score}/100</div>
            <p class="muted">${escapeHtml(briefing.topDispute.insight)}</p>
            ${renderSourceActions(briefing.topDispute.sources, { compact: true })}
          `
              : '<p class="muted">暂无</p>'
          }
        </div>
        <div class="brief-card brief-card-opp">
          <h3>M6 · 币圈机会</h3>
          ${
            briefing.topOpportunities.length
              ? briefing.topOpportunities.map((item) => renderBriefingOppCompact(item)).join('')
              : '<p class="muted">本月暂未识别到明确参与机会</p>'
          }
          <button type="button" class="brief-opp-more" data-goto-module="m6">查看全部币圈机会 →</button>
        </div>
      </div>
    </section>
  `

  const renderDigestLineText = (item: DigestItem) => {
    const linkUrl = resolveSourceUrl(item.url)
    if (linkUrl) {
      return `<a class="digest-flash-link" href="${linkUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.text)}</a>`
    }
    return escapeHtml(item.text)
  }

  const renderDigestSourceLink = (item: DigestItem) => {
    const linkUrl = resolveSourceUrl(item.url)
    if (!linkUrl) return ''
    return `<a class="digest-source-link" href="${linkUrl}" target="_blank" rel="noopener noreferrer" title="打开 Odaily 原文">来源</a>`
  }

  const renderDigestLines = (items: DigestItem[], showSourceLink = false) =>
    items
      .map(
        (item, i) => `
      <p class="digest-line${showSourceLink ? ' digest-line-with-source' : ''}">
        <span class="digest-index">${i + 1}.</span>
        <span class="digest-line-main">
          ${renderDigestLineText(item)}
          ${showSourceLink ? renderDigestSourceLink(item) : ''}
        </span>
      </p>
    `,
      )
      .join('')

  const renderDigestHotTopic = (topic: PrescientData['digest']['hotTopic']) => `
    <p class="digest-hotline">
      <strong>今日🔥: <a class="digest-hot-link" href="${topic.url}" target="_blank" rel="noopener">${escapeHtml(topic.title)}</a></strong>
    </p>
    <a class="digest-url" href="${topic.url}" target="_blank" rel="noopener">${escapeHtml(topic.url)}</a>
  `

  const renderDigestCategoryNav = (d: PrescientData) => {
    const categories = d.digest.categoryFlashes ?? []
    const chips = categories
      .map(
        (cat) => `
        <button
          type="button"
          class="digest-cat ${digestFlashCategory === cat.id ? 'active' : ''}"
          data-flash-cat="${cat.id}"
        >
          ${escapeHtml(cat.label)}
          <span class="digest-cat-count">${cat.count}</span>
        </button>
      `,
      )
      .join('')

    return `
      <nav class="digest-categories" aria-label="快讯分类">
        <button
          type="button"
          class="digest-cat ${digestFlashCategory === null ? 'active' : ''}"
          data-flash-cat="all"
        >
          全部
        </button>
        ${chips}
      </nav>
    `
  }

  const renderDigest = (d: PrescientData) => {
    const cryptoTitle = `币圈快讯 (${d.digest.crypto.dateLabel}）`
    const categories = d.digest.categoryFlashes ?? []
    const activeCategory = digestFlashCategory
      ? categories.find((c) => c.id === digestFlashCategory)
      : null

    const tabContent = () => {
      switch (digestTab) {
        case 'hourly': {
          const hourlyItems = activeCategory?.items ?? d.digest.latestFlashes
          const hourlyMeta = activeCategory
            ? `今日 ${escapeHtml(activeCategory.label)} · ${escapeHtml(d.digest.todayDateLabel ?? d.digest.dateLabel)} · 共 ${activeCategory.count} 条 · ${escapeHtml(d.digest.sourceLabel ?? 'Odaily')}`
            : `更新时间 ${escapeHtml(d.digest.updatedAt)} · ${escapeHtml(d.digest.sourceLabel ?? 'Odaily')} · 每两小时更新 · ${d.digest.nextUpdateMinutes} 分钟后刷新${
                d.digest.live ? '<span class="digest-live">· 实时</span>' : ''
              }`

          const hourlyBody =
            hourlyItems.length > 0
              ? renderDigestLines(hourlyItems, Boolean(activeCategory))
              : `<p class="digest-line muted">今日暂无「${escapeHtml(activeCategory?.label ?? '')}」相关快讯，请切换其他分类或稍后刷新。</p>`

          return `
            <h3 class="digest-content-title">最新快讯</h3>
            ${renderDigestCategoryNav(d)}
            <p class="digest-meta">${hourlyMeta}</p>
            <div class="digest-body">${hourlyBody}</div>
          `
        }
        case 'crypto':
          return `
            <h3 class="digest-content-title">${escapeHtml(cryptoTitle)}</h3>
            <div class="digest-body">${
              d.digest.crypto.items.length
                ? renderDigestLines(d.digest.crypto.items)
                : '<p class="digest-line muted">暂无币圈快讯，请稍后刷新。</p>'
            }</div>
            ${renderDigestHotTopic(d.digest.hotTopic)}
          `
      }
    }

    return `
    <section class="panel digest-panel">
      <article class="digest-sheet">
        <nav class="digest-tabs" role="tablist">
          <button type="button" role="tab" class="digest-tab ${digestTab === 'hourly' ? 'active' : ''}" data-digest-tab="hourly">
            最新快讯
            <span class="digest-badge">每两小时</span>
          </button>
          <button type="button" role="tab" class="digest-tab ${digestTab === 'crypto' ? 'active' : ''}" data-digest-tab="crypto">
            币圈快讯
          </button>
        </nav>
        <div class="digest-tab-panel" role="tabpanel">
          ${tabContent()}
        </div>
      </article>
    </section>
  `
  }

  const renderM1 = (shifts: ShiftItem[]) => `
    <section class="panel">
      <div class="panel-head">
        <h2>📌 今日变局</h2>
        <span class="divider-line"></span>
        <p class="panel-desc">AI 提炼的核心事件，附信号强度与共识阶段</p>
      </div>
      <div class="shift-list">
        ${shifts.map((s) => renderShiftCard(s)).join('')}
      </div>
    </section>
  `

  const renderM2 = (d: PrescientData) => `
    <section class="panel">
      <div class="panel-head">
        <h2>🌡️ 叙事温度</h2>
        <span class="divider-line"></span>
      </div>
      <div class="narrative-grid">
        <div class="narrative-col">
          <h3>📈 升温中</h3>
          ${
            d.narratives.rising.length
              ? d.narratives.rising.map((n) => renderHeatRow(n, true)).join('')
              : '<p class="muted">今日暂无明确升温话题，请稍后刷新。</p>'
          }
        </div>
        <div class="narrative-col">
          <h3>📉 退潮中</h3>
          ${
            d.narratives.cooling.length
              ? d.narratives.cooling.map((n) => renderHeatRow(n, true)).join('')
              : '<p class="muted">今日暂无明确退潮话题，各叙事热度整体偏集中。</p>'
          }
        </div>
      </div>
      <div class="dispute-list-mini">
        <h3>🔀 高分歧话题</h3>
        ${d.narratives.disputes
          .map(
            (item) => `
          <div class="dispute-mini-row">
            <span>${escapeHtml(item.name)}</span>
            <div class="dispute-mini-actions">
              <span class="score-pill">${item.score}</span>
              ${renderSourceActions(item.sources, { compact: true })}
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
      <div class="ai-box">
        <strong>🤖 AI 判断</strong>
        <p>${escapeHtml(d.narratives.aiJudgment)}</p>
      </div>
    </section>
  `

  const renderM3 = (d: PrescientData) => `
    <section class="panel">
      <div class="panel-head">
        <h2>📅 明日议程</h2>
        <span class="divider-line"></span>
      </div>
      <div class="agenda-timeline">
        <h3>近期关注</h3>
        ${
          d.agenda.tomorrow.length
            ? d.agenda.tomorrow.map((a) => renderAgendaCard(a)).join('')
            : '<p class="muted">暂无议程数据，请稍后刷新。</p>'
        }
      </div>
      <div class="agenda-timeline week">
        <h3>本周后续</h3>
        ${
          d.agenda.weekAhead.length
            ? d.agenda.weekAhead.map((a) => renderAgendaCard(a)).join('')
            : '<p class="muted">暂无本周议程。</p>'
        }
      </div>
      <div class="ai-box tip">
        <strong>💡 综合建议</strong>
        <p>${escapeHtml(d.agenda.tip)}</p>
      </div>
    </section>
  `

  const renderM4 = (d: PrescientData) => `
    <section class="panel">
      <div class="panel-head">
        <h2>⚡ 分歧雷达</h2>
        <span class="divider-line"></span>
        <p class="panel-desc">同一事件，不同阵营怎么说</p>
      </div>
      ${
        d.disputes.length
          ? d.disputes.map((topic) => renderDisputeCard(topic)).join('')
          : '<p class="muted">暂无分歧话题数据，请稍后刷新。</p>'
      }
    </section>
  `

  const renderM5 = (d: PrescientData) => `
    <section class="panel">
      <div class="panel-head">
        <h2>🔌 原始脉络</h2>
        <span class="divider-line"></span>
        <p class="panel-desc">Top 5 深度稿；快讯优先展示升温话题与今日币圈相关条目</p>
      </div>
      <h3 class="raw-section-title">📰 深度报道（Top 5）</h3>
      <div class="raw-list">
        ${d.raw.articles
          .map(
            (a, i) => `
          <article class="raw-card">
            <div class="raw-index">${i + 1}</div>
            <div>
              ${renderRawTitleLink(a)}
              <div class="raw-meta">
                ${a.author ? `<span>✍️ ${escapeHtml(a.author)}</span>` : ''}
                <span>⏱ ${escapeHtml(a.time)}</span>
              </div>
            </div>
          </article>
        `,
          )
          .join('')}
      </div>
      <h3 class="raw-section-title">⚡ ${escapeHtml(d.raw.flashSectionTitle ?? '今日币圈 · 升温话题（Top 5）')}</h3>
      <div class="raw-list">
        ${d.raw.flashes
          .map(
            (f, i) => `
          <article class="raw-card flash">
            <div class="raw-index">${i + 1}</div>
            <div>
              ${renderRawTitleLink(f)}
              <div class="raw-meta">
                <span>⏱ ${escapeHtml(f.time)}</span>
              </div>
            </div>
          </article>
        `,
          )
          .join('')}
      </div>
      <div class="ai-box">
        <strong>💡 AI 提炼</strong>
        <p>${escapeHtml(d.raw.aiSummary)}</p>
      </div>
    </section>
  `

  const OPPORTUNITY_KIND_STYLE: Record<CryptoOpportunity['kind'], { cls: string; emoji: string }> = {
    fundraising: { cls: 'opp-fundraising', emoji: '💰' },
    lottery: { cls: 'opp-lottery', emoji: '🎁' },
    tge: { cls: 'opp-tge', emoji: '🚀' },
    airdrop: { cls: 'opp-airdrop', emoji: '🪂' },
  }

  const renderOpportunityCard = (item: CryptoOpportunity) => {
    const style = OPPORTUNITY_KIND_STYLE[item.kind]
    const linkUrl = resolveSourceUrl(item.url)
    const titleHtml = linkUrl
      ? `<a class="opp-title-link" href="${linkUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
      : escapeHtml(item.title)
    return `
      <article class="opp-card ${style.cls}">
        <div class="opp-card-head">
          <span class="opp-kind">${style.emoji} ${escapeHtml(item.kindLabel)}</span>
          <span class="opp-time">${escapeHtml(item.date)}</span>
        </div>
        <h4 class="opp-title">${titleHtml}</h4>
        ${item.highlight ? `<p class="opp-highlight">${escapeHtml(item.highlight)}</p>` : ''}
        <p class="opp-summary">${escapeHtml(item.summary.slice(0, 140))}${item.summary.length > 140 ? '…' : ''}</p>
        ${renderOdailySourceLink(linkUrl)}
        ${renderSourceActions(item.sources, { compact: true })}
      </article>
    `
  }

  const renderOpportunityFallbackCard = (item: OpportunityFallbackItem) => {
    const linkUrl = resolveSourceUrl(item.url)
    const titleHtml = linkUrl
      ? `<a class="opp-title-link" href="${linkUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
      : escapeHtml(item.title)
    return `
      <article class="opp-card opp-fallback">
        <div class="opp-card-head">
          <span class="opp-kind">📰 近期动态</span>
          <span class="opp-time">${escapeHtml(item.date)}</span>
        </div>
        <h4 class="opp-title">${titleHtml}</h4>
        <p class="opp-summary">${escapeHtml(item.summary.slice(0, 140))}${item.summary.length > 140 ? '…' : ''}</p>
        ${renderOdailySourceLink(linkUrl)}
        ${renderSourceActions(item.sources, { compact: true })}
      </article>
    `
  }

  const renderM6 = (d: PrescientData, opportunities = d.opportunities) => {
    const opp = opportunities
    const monthKey = opportunityMonth ?? opp.defaultMonth
    const slice = findOpportunityMonthSlice(opp, monthKey)
    const activeBuckets = slice.buckets.filter((b) => b.count > 0)
    const fallbackItems = slice.fallbackItems
    const fallbackScope = slice.fallbackScope ?? null
    const monthDataMap = new Map(opp.months.map((m) => [m.key, m]))

    const monthOptions = buildSelectableMonthKeys().map((key) => {
      const row = monthDataMap.get(key)
      const label = row?.label ?? formatOpportunityMonthLabel(key)
      const oppCount = row?.totalCount ?? 0
      const feedCount = row?.fallbackItems.length ?? 0
      const suffix =
        oppCount > 0
          ? `${oppCount} 条机会`
          : feedCount > 0
            ? `${feedCount} 条动态`
            : '暂无数据'
      return `<option value="${key}" ${monthKey === key ? 'selected' : ''}>${escapeHtml(label)}（${suffix}）</option>`
    })

    const monthPicker = `
      <div class="opp-month-picker">
        <label class="opp-month-picker-label" for="opp-month-select">选择月份</label>
        <select id="opp-month-select" class="opp-month-select" aria-label="选择查看月份">
          ${monthOptions.join('')}
        </select>
      </div>
    `

    return `
    <section class="panel" id="opp-panel">
      <div class="panel-head">
        <h2>🎯 币圈机会</h2>
        <span class="divider-line"></span>
        <p class="panel-desc">当前查看 <strong>${escapeHtml(slice.label)}</strong> · 项目融资、TGE / 发售、空投与抽奖等可参与机会（${escapeHtml(opp.rangeLabel)}）</p>
        <p class="opp-source-note muted">${escapeHtml(opp.sourceNote)}${opp.feedEarliestLabel ? ` · 最早报道 ${escapeHtml(opp.feedEarliestLabel)}` : ''}${opportunitiesLoading ? ' · <strong>正在拉取近 4 个月数据…</strong>' : ''}</p>
      </div>
      ${monthPicker}
      <div class="ai-box tip">
        <strong>📋 参与机会摘要</strong>
        <p>${escapeHtml(slice.summary)}</p>
        <p class="opp-meta muted">更新 ${escapeHtml(opp.updatedAt)} · ${escapeHtml(opp.sourceNote)}，参与前请核实官方信息</p>
      </div>
      ${
        activeBuckets.length
          ? activeBuckets
              .map(
                (bucket) => `
          <h3 class="opp-section-title">
            ${escapeHtml(bucket.label)}
            <span class="opp-count">${bucket.count}</span>
          </h3>
          <div class="opp-grid">${bucket.items.map((item) => renderOpportunityCard(item)).join('')}</div>
        `,
              )
              .join('')
          : fallbackItems.length
            ? `
          <p class="muted opp-empty-hint">该月份暂未识别到明确参与机会（TGE / 空投 / 抽奖 / 融资）。</p>
          <h3 class="opp-section-title opp-fallback-title">
            ${fallbackScope === 'month' ? '同期币圈动态' : '近 30 天币圈动态'}
            <span class="opp-count">${fallbackItems.length}</span>
          </h3>
          <div class="opp-grid">${fallbackItems.map((item) => renderOpportunityFallbackCard(item)).join('')}</div>
        `
            : '<p class="muted">该月份暂未识别到明确参与机会，请切换其他月份或稍后刷新。</p>'
      }
    </section>
  `
  }

  const renderShiftCard = (s: ShiftItem) => {
    const sig = SIGNAL_LABEL[s.level]
    const con = CONSENSUS_LABEL[s.consensus]
    return `
      <article class="shift-card ${sig.cls}">
        <div class="shift-top">
          <span class="signal-badge">${sig.icon} ${sig.label}</span>
          <span class="consensus-badge">${con.icon} ${con.label}</span>
          ${s.relevance && s.relevance >= 4 ? '<span class="relevance">高关联</span>' : ''}
        </div>
        <h3>${escapeHtml(s.title)}</h3>
        <p class="shift-analysis">${escapeHtml(s.analysis)}</p>
        <div class="domains">${s.domains.map((d) => `<span class="domain-tag">${escapeHtml(d)}</span>`).join('')}</div>
        ${renderSourceActions(s.sources)}
      </article>
    `
  }

  const renderShiftCompact = (s: ShiftItem) => {
    const sig = SIGNAL_LABEL[s.level]
    return `
      <div class="compact-item">
        <div class="compact-main">
          <span class="compact-icon">${sig.icon}</span>
          <span class="compact-text">${escapeHtml(s.title)}</span>
          ${s.relevance && s.relevance >= 5 ? '<span class="relevance sm">高关联</span>' : ''}
        </div>
      </div>
    `
  }

  const renderHeatRow = (n: NarrativeItem, showBar = false) => `
    <div class="heat-row ${n.trend}">
      <div class="heat-label">
        <span>${escapeHtml(n.name)}</span>
        <span class="heat-val">${n.heat}°C <small>${n.delta > 0 ? '+' : ''}${n.delta}</small></span>
      </div>
      ${
        showBar
          ? `<div class="heat-bar"><div class="heat-fill" style="width:${n.heat}%"></div></div>`
          : ''
      }
      ${renderSourceActions(n.sources, { compact: true })}
    </div>
  `

  const renderAgendaCard = (a: AgendaItem) => {
    const sig = SIGNAL_LABEL[a.level]
    return `
      <div class="agenda-card">
        <div class="agenda-time">
          <span class="signal-badge sm">${sig.icon}</span>
          <strong>${escapeHtml(a.time)}</strong>
          <span class="muted">${escapeHtml(a.date)}</span>
        </div>
        <h4>${escapeHtml(a.title)}</h4>
        <p>→ ${escapeHtml(a.impact)}</p>
        ${renderSourceActions(a.sources, { compact: true })}
      </div>
    `
  }

  const renderAgendaCompact = (a: AgendaItem) => `
    <div class="compact-item">
      <div class="compact-main">
        <span class="compact-icon">${escapeHtml(a.time)}</span>
        <span class="compact-text">${escapeHtml(a.title)}</span>
      </div>
      ${renderSourceActions(a.sources, { compact: true })}
    </div>
  `

  const renderDisputeRelatedFlashes = (items: DisputeTopic['relatedFlashes']) => {
    if (!items?.length) return ''
    return `
      <div class="dispute-related">
        <h4 class="dispute-related-title">话题相关快讯</h4>
        <ul class="dispute-related-list">
          ${items
            .map((item) => {
              const linkUrl = resolveSourceUrl(item.url)
              const titleHtml = linkUrl
                ? `<a class="dispute-related-link" href="${linkUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
                : `<span class="dispute-related-text">${escapeHtml(item.title)}</span>`
              return `
            <li class="dispute-related-item">
              <span class="dispute-related-time">${escapeHtml(item.time)}</span>
              ${titleHtml}
            </li>
          `
            })
            .join('')}
        </ul>
      </div>
    `
  }

  const renderDisputeCard = (topic: DisputeTopic) => `
    <article class="dispute-card">
      <div class="dispute-head">
        <h3>${escapeHtml(topic.name)}</h3>
        <div class="dispute-head-actions">
          <div class="dispute-score-lg">${topic.score}<small>/100</small></div>
          ${renderSourceActions(topic.sources, { compact: true })}
        </div>
      </div>
      ${renderDisputeRelatedFlashes(topic.relatedFlashes)}
      <div class="camps">
        ${topic.camps
          .map((c) => {
            const style = CAMP_STYLE[c.side]
            return `
            <div class="camp ${style.cls}">
              <div class="camp-label">${style.label} · ${escapeHtml(c.label.split('（')[1]?.replace('）', '') ?? c.label)}</div>
              <blockquote>${escapeHtml(c.quote)}</blockquote>
              <div class="camp-basis">依据：${escapeHtml(c.basis)}</div>
              ${renderSourceActions(sourcesFromOne(c.source), { compact: true })}
            </div>
          `
          })
          .join('')}
      </div>
      <div class="ai-box sm">
        <strong>📌 解读</strong>
        <p>${escapeHtml(topic.insight)}</p>
      </div>
    </article>
  `

  const renderModuleFooter = () => `
    <footer class="module-footer">
      <p>需要查询其他模块吗？</p>
      <div class="footer-modules">
        ${MODULES.filter((m) => m.id !== 'briefing')
          .map(
            (m) => `
          <button type="button" class="footer-mod-btn" data-module="${m.id}">
            ${m.code} ${m.name}
          </button>
        `,
          )
          .join('')}
      </div>
    </footer>
  `

  const routeHint = (q: string) => {
    const lower = q.toLowerCase()
    for (const m of MODULES) {
      if (m.keywords.some((k) => lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower))) {
        return `路由建议 → ${m.code} ${m.name}`
      }
    }
    return '未匹配到模块，将展示全览简报'
  }

  const resolveRoute = (q: string): ModuleId => {
    const lower = q.trim().toLowerCase()
    if (!lower) return 'briefing'
    for (const m of MODULES) {
      if (m.keywords.some((k) => lower.includes(k.toLowerCase()))) return m.id
    }
    if (/m[1-6]/.test(lower)) {
      const num = lower.match(/m([1-6])/)?.[1]
      if (num) return `m${num}` as ModuleId
    }
    if (/快讯|最新快讯|币圈快讯|今日专题/.test(lower)) return 'digest'
    if (/机会|TGE|空投|抽奖|打新|IDO/.test(lower)) return 'm6'
    return 'briefing'
  }

  const bindEvents = () => {
    root.querySelectorAll('[data-module]').forEach((el) => {
      el.addEventListener('click', () => {
        activeModule = (el as HTMLElement).dataset.module as ModuleId
        render()
      })
    })

    root.querySelector('#btn-refresh')?.addEventListener('click', () => {
      void refreshAllData()
    })

    root.querySelector('#btn-theme')?.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, theme)
      render()
    })

    const input = root.querySelector('#query-input') as HTMLInputElement | null
    input?.addEventListener('input', () => {
      query = input.value
      const hint = root.querySelector('.route-hint')
      if (hint) hint.textContent = routeHint(query)
    })

    root.querySelector('#btn-route')?.addEventListener('click', () => {
      activeModule = resolveRoute(query)
      render()
    })

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        activeModule = resolveRoute(query)
        render()
      }
    })

    root.querySelectorAll('.tag-chip input').forEach((el) => {
      el.addEventListener('change', () => {
        const val = (el as HTMLInputElement).value as InterestTag
        if ((el as HTMLInputElement).checked) {
          if (!interests.includes(val)) interests.push(val)
        } else {
          interests = interests.filter((t) => t !== val)
        }
        render()
      })
    })

    root.querySelectorAll('[data-digest-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        digestTab = (el as HTMLElement).dataset.digestTab as typeof digestTab
        render()
      })
    })

    root.querySelectorAll('[data-flash-cat]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.flashCat
        digestFlashCategory = id === 'all' ? null : (id ?? null)
        render()
      })
    })

    root.querySelectorAll('[data-goto-module]').forEach((el) => {
      el.addEventListener('click', () => {
        activeModule = ((el as HTMLElement).dataset.gotoModule ?? 'briefing') as ModuleId
        render()
      })
    })
  }

  render()
  void refreshAllData()
}

function renderRawTitleLink(item: RawArticle): string {
  const title = escapeHtml(item.title)
  const linkUrl = resolveSourceUrl(item.url)
  if (linkUrl) {
    return `<h4><a class="raw-title-link" href="${linkUrl}" target="_blank" rel="noopener noreferrer" title="直达原文">${title}</a></h4>`
  }
  return `<h4>${title}</h4>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sourcesFromOne(source?: NewsSource): NewsSource[] | undefined {
  return source ? [source] : undefined
}

function renderOdailySourceLink(url: string | undefined): string {
  if (!url) return ''
  return `<a class="opp-source-link" href="${url}" target="_blank" rel="noopener noreferrer">查看 Odaily 原文 →</a>`
}

function renderSourceActions(
  sources: NewsSource[] | undefined,
  options: { compact?: boolean; inline?: boolean } = {},
): string {
  const linked =
    sources
      ?.map((s) => {
        const url = resolveSourceUrl(s.url)
        return url ? { name: s.name, url } : null
      })
      .filter((s): s is { name: string; url: string } => Boolean(s)) ?? []
  if (!linked.length) return ''
  const cls = ['source-actions', options.compact && 'compact', options.inline && 'inline']
    .filter(Boolean)
    .join(' ')
  return `
    <div class="${cls}">
      ${linked
        .map(
          (s) => `
        <a
          class="source-link"
          href="${s.url}"
          target="_blank"
          rel="noopener noreferrer"
          title="查看来源：${escapeHtml(s.name)}"
        >${escapeHtml(s.name)}</a>
      `,
        )
        .join('')}
    </div>
  `
}
