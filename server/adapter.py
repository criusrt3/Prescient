"""将 Odaily RSS（及可选 Skill 输出）转为 Prescient 前端数据结构。"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

BJ = timezone(timedelta(hours=8))

CRYPTO_KEYWORDS = re.compile(
    r"BTC|ETH|SOL|BNB|XRP|USDT|USDC|ETF|DeFi|NFT|Web3|Polymarket|"
    r"比特币|以太坊|加密|区块链|代币|合约|巨鲸|交易所|山寨|稳定币|"
    r"Strategy|Tether|Coinbase|Binance|Upbit|Solana|空投|质押|"
    r"Layer\s*2|L2|Meme|DEX|CEX|矿|算力|钱包|链上|现货|期货",
    re.IGNORECASE,
)

HARD_KEYWORDS = re.compile(
    r"监管|法案|央行|美联储|战争|制裁|SEC|CFTC|立案|通过|生效|入侵|袭击|停火",
    re.IGNORECASE,
)
NOISE_KEYWORDS = re.compile(r"口水战|吐槽|网红|恶搞", re.IGNORECASE)
AGENDA_KEYWORDS = re.compile(
    r"明日|将于|本周|下周|发布会|听证会|利率决议|数据公布|上线|开幕|公布|决议|"
    r"即将|预计|召开|峰会|解锁|空投|投票|升级|财报|业绩|审议",
    re.IGNORECASE,
)

NARRATIVE_TOPICS = [
    ("AI 监管", re.compile(r"监管|法案|SEC|CFTC|合规|立法|网信办", re.I)),
    ("AI 科技", re.compile(r"OpenAI|英伟达|半导体|芯片|LifeSciBench", re.I)),
    ("比特币", re.compile(r"比特币|BTC", re.I)),
    ("以太坊", re.compile(r"以太坊|ETH|以太", re.I)),
    ("预测市场", re.compile(r"Polymarket|预测市场|Kalshi", re.I)),
    ("宏观政策", re.compile(r"美联储|降息|通胀|CPI|非农|央行|标普", re.I)),
    ("交易所", re.compile(r"交易所|Upbit|Binance|Coinbase|币安", re.I)),
    ("Strategy", re.compile(r"Strategy|STRC|MicroStrategy", re.I)),
    ("稳定币", re.compile(r"Tether|USDT|稳定币", re.I)),
    ("DeFi", re.compile(r"DeFi|Aave|借贷|流动性", re.I)),
    ("地缘局势", re.compile(r"伊朗|以色列|黎巴嫩|战争|停火|导弹", re.I)),
]

PLANET_DIGEST_RE = re.compile(r"^星球(早|午|晚)讯")

FLASH_CATEGORY_DEFS = [
    ("prediction-market", "预测市场"),
    ("ai", "AI"),
    ("celebrity-views", "名人观点"),
    ("crypto-stocks", "币股动态"),
    ("project-updates", "项目动向"),
    ("onchain-data", "链上数据"),
    ("exchange-announcements", "交易所公告"),
    ("fundraising", "融资信息"),
    ("macro-policy", "宏观政策"),
]

CELEBRITY_TITLE_RE = re.compile(
    r"^(?:观点[：:]|(?:.*?(?:CEO|创始人|联创|董事长|发言人|分析师|教授|议员|记者|理事|博士|行长|部长|主席))"
    r"(?:[：:]|(?=\s*(?:表示|称|认为|发文|喊话|回应|点评))|(?=疑似))|"
    r"(?:Tom Lee|Michael Saylor|CZ|Vitalik|Buterin|孙宇晨|马斯克|Musk|Trump|特朗普|Arthur\s*Hayes|"
    r"赵长鹏|何一|SBF|Ki Young Ju|Jake Chervinsky|Fabian Dori|Alex Svanevik|Vitalik Buterin)[：:])",
    re.I,
)


def _flash_title_clean(title: str) -> str:
    return re.sub(r"^【快讯】\s*", "", title).strip()


def _classify_flash_categories(flash: dict[str, Any]) -> list[str]:
    title = _flash_title_clean(flash["title"])
    if PLANET_DIGEST_RE.match(title):
        return []

    snippet = (flash.get("body") or "")[:180]
    ids: list[str] = []

    if re.search(r"Polymarket|Kalshi|Opinion\.trade|预测市场|押注市场|对赌市场", title + snippet, re.I):
        ids.append("prediction-market")

    if re.search(
        r"人工智能|大模型|OpenAI|Anthropic|Claude|GPT-?\d|DeepSeek|英伟达|NVIDIA|LLM|生成式\s*AI|"
        r"AI\s*基础设施|Gemini|Llama|xAI|Sora|智谱|Minimax",
        title,
        re.I,
    ) or (re.search(r"AI", title, re.I) and re.search(r"基础设施|监管|模型|芯片", title, re.I)):
        ids.append("ai")

    if CELEBRITY_TITLE_RE.search(title):
        ids.append("celebrity-views")

    if re.search(
        r"纳斯达克|纽交所|美股|港股|上市公司|矿企|矿业股|币股|MSTR|STRC|Bitdeer|Riot|Marathon|"
        r"CleanSpark|IREN|MARA|RIOT",
        title + snippet,
        re.I,
    ):
        ids.append("crypto-stocks")

    if re.search(
        r"主网上线|测试网上线|硬分叉|空投(?:开启|发放)?|代币解锁|治理提案|协议升级|跨链桥|"
        r"Layer\s*2|\bL2\b|Rollup|路线图|主网将于",
        title,
        re.I,
    ):
        ids.append("project-updates")

    if re.search(
        r"链上(?:数据|监测|分析|显示|记录)|巨鲸|TVL|Gas\s*费|资金费率|净流入|净流出|未平仓|"
        r"清算(?:额|数据)|监测.*(?:增持|减持)|(?:增持|减持).*(?:枚|万美元|万枚)|转移.*\d+.*枚",
        title,
        re.I,
    ) or (re.search(r"持仓", title) and re.search(r"枚|万美元|万枚|BTC|ETH|SOL", title, re.I)):
        ids.append("onchain-data")

    if re.search(
        r"^(?:Gate|Upbit|Binance|币安|Coinbase|OKX|Bybit|Kraken|Bitget|抹茶|Hyperliquid)",
        title,
        re.I,
    ) and re.search(r"上线|下架|退市|暂停|恢复|充提|公告|现货|合约", title, re.I):
        ids.append("exchange-announcements")

    if re.search(
        r"融资|领投|参投|估值达|募资|种子轮|A\s*轮融资|B\s*轮融资|完成.*亿美元|完成.*万美元|"
        r"战略投资|收购|并购|拟\s*IPO",
        title,
        re.I,
    ):
        ids.append("fundraising")

    if re.search(
        r"美联储|Fed|降息|加息|CPI|PPI|非农|央行|ECB|SEC|CFTC|监管(?:框架|政策)|法案|立法|关税|"
        r"制裁|商务部|财政部|参议院|国会|白宫|停火|战争|导弹|袭击|冲突|攻击|地缘|检察官|洗钱|合规",
        title,
        re.I,
    ) or (
        re.search(r"伊朗|以色列|黎巴嫩|俄罗斯|乌克兰", title)
        and re.search(r"战争|冲突|袭击|制裁|停火|导弹|炮击|攻击|敌对|不信任", title + snippet)
    ):
        ids.append("macro-policy")

    return ids


def _now_bj() -> datetime:
    return datetime.now(BJ)


def _beijing_now_str() -> str:
    return _now_bj().strftime("%Y/%m/%d %H:%M")


def _date_label() -> str:
    return _now_bj().strftime("%m-%d")


def _format_time(iso: str | None) -> str:
    if not iso:
        return _beijing_now_str().split(" ")[1]
    try:
        dt = datetime.fromisoformat(iso)
        return dt.strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return iso


def _is_today(iso: str | None) -> bool:
    return bool(iso and iso.startswith(_now_bj().strftime("%Y-%m-%d")))


def _source(url: str, title: str = "") -> dict[str, str]:
    if not url:
        return {"name": "Odaily"}
    label = (title[:36] + "…") if len(title) > 36 else title
    return {"name": label or "Odaily", "url": url}


def _flash_text(title: str) -> str:
    clean = re.sub(r"^【快讯】\s*", "", title).strip()
    return clean if clean.endswith(("；", ";")) else f"{clean}；"


ODAILY_ITEM_URL_RE = re.compile(r"^https://www\.odaily\.news/zh-CN/(post|newsflash)/\d+$")


def _to_digest_item(flash: dict[str, Any]) -> dict[str, Any]:
    title = flash["title"]
    item: dict[str, Any] = {
        "id": str(flash["id"]),
        "text": _flash_text(title),
    }
    url = flash.get("url") or ""
    if ODAILY_ITEM_URL_RE.match(url):
        item["url"] = url
    return item


def _verified_flash_url(url: str) -> str | None:
    return url if ODAILY_ITEM_URL_RE.match(url) else None


def _format_flash_time_bj(iso: str | None) -> str:
    if not iso:
        return "--:--"
    try:
        dt = datetime.fromisoformat(iso)
        return dt.astimezone(BJ).strftime("%H:%M")
    except ValueError:
        return "--:--"


def _flash_time_delta_ms(a: dict[str, Any], b: dict[str, Any]) -> float:
    a_iso = a.get("publishedAt")
    b_iso = b.get("publishedAt")
    if not a_iso or not b_iso:
        return float("inf")
    try:
        a_ts = datetime.fromisoformat(a_iso).timestamp()
        b_ts = datetime.fromisoformat(b_iso).timestamp()
        return abs(a_ts - b_ts)
    except ValueError:
        return float("inf")


def _to_dispute_related_flash(flash: dict[str, Any]) -> dict[str, Any]:
    title = _flash_title_clean(flash["title"])
    url = flash.get("url") or ""
    row: dict[str, Any] = {
        "id": str(flash["id"]),
        "title": title,
        "time": _format_flash_time_bj(flash.get("publishedAt")),
    }
    verified = _verified_flash_url(url)
    if verified:
        row["url"] = verified
    return row


def _pick_dispute_related_flashes(
    main: dict[str, Any],
    topic_related: list[dict[str, Any]],
    today_flashes: list[dict[str, Any]],
    limit: int = 5,
) -> list[dict[str, Any]]:
    main_url = main.get("url") or ""
    seen = {main_url} if main_url else set()
    pool = [f for f in topic_related if f.get("url") and f.get("url") != main_url]

    if len(pool) < 3:
        main_iso = main.get("publishedAt")
        if main_iso:
            try:
                main_ts = datetime.fromisoformat(main_iso).timestamp()
            except ValueError:
                main_ts = None
        else:
            main_ts = None
        if main_ts is not None:
            window = 3 * 60 * 60
            for flash in today_flashes:
                url = flash.get("url") or ""
                if not url or url in seen or url == main_url:
                    continue
                iso = flash.get("publishedAt")
                if not iso:
                    continue
                try:
                    delta = abs(datetime.fromisoformat(iso).timestamp() - main_ts)
                except ValueError:
                    continue
                if delta <= window:
                    pool.append(flash)

    unique: list[dict[str, Any]] = []
    for flash in pool:
        url = flash.get("url") or ""
        if not url or url in seen:
            continue
        seen.add(url)
        unique.append(flash)

    unique.sort(key=lambda f: _flash_time_delta_ms(main, f))
    return [_to_dispute_related_flash(f) for f in unique[:limit]]


def _classify_level(title: str) -> str:
    if NOISE_KEYWORDS.search(title):
        return "noise"
    if HARD_KEYWORDS.search(title):
        return "hard"
    return "soft"


def _classify_consensus(title: str) -> str:
    if re.search(r"预计|或将|可能|传闻|据悉", title):
        return "seed"
    if re.search(r"通过|生效|发布|宣布|突破|创历史新高", title):
        return "consensus"
    return "brewing"


def _infer_domains(title: str, body: str) -> list[str]:
    text = f"{title} {body}"
    domains: list[str] = []
    rules = [
        (re.compile(r"AI|OpenAI|监管|法案|半导体|芯片", re.I), "科技"),
        (re.compile(r"比特币|BTC|ETH|加密|代币|DeFi|Tether|稳定币", re.I), "加密"),
        (re.compile(r"美联储|宏观|通胀|GDP|利率|央行|标普", re.I), "宏观"),
        (re.compile(r"战争|伊朗|以色列|黎巴嫩|停火|导弹|能源", re.I), "地缘"),
        (re.compile(r"交易所|上市|IPO|Kalshi|预测市场", re.I), "商业"),
    ]
    for pattern, label in rules:
        if pattern.search(text) and label not in domains:
            domains.append(label)
    return domains or ["资讯"]


def _shift_from_flash(flash: dict[str, Any], idx: int) -> dict[str, Any]:
    title = flash["title"]
    body = flash.get("body") or title
    url = flash.get("url") or ""
    return {
        "id": f"s{idx}",
        "level": _classify_level(title),
        "consensus": _classify_consensus(title),
        "title": title,
        "analysis": body[:160] + ("…" if len(body) > 160 else ""),
        "domains": _infer_domains(title, body),
        "sources": [_source(url, title)] if url else [],
        "relevance": 3,
    }


def _count_topic(flashes: list[dict[str, Any]], pattern: re.Pattern[str]) -> int:
    return sum(1 for f in flashes if pattern.search(f["title"]))


def _recent_flash_pool(flashes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    today = [f for f in flashes if _is_today(f.get("publishedAt"))]
    return today if len(today) >= 3 else flashes


def _flash_pool_date_label(pool: list[dict[str, Any]]) -> str:
    today_count = sum(1 for f in pool if _is_today(f.get("publishedAt")))
    if today_count >= 3:
        return _date_label()
    if not pool:
        return _date_label()
    published = pool[0].get("publishedAt")
    if not published:
        return _date_label()
    try:
        dt = datetime.fromisoformat(published.replace("Z", "+00:00")).astimezone(BJ)
        return f"{dt.month}/{dt.day}"
    except ValueError:
        return _date_label()


def _build_crypto_items(pool: list[dict[str, Any]]) -> list[dict[str, Any]]:
    crypto = [f for f in pool if _is_crypto(f["title"])]
    if len(crypto) >= 10:
        return crypto[:10]
    seen = {f["url"] for f in crypto}
    merged = list(crypto)
    for f in pool:
        if f["url"] in seen:
            continue
        merged.append(f)
        seen.add(f["url"])
        if len(merged) >= 10:
            break
    return merged


def _narrative_pool(flashes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return _recent_flash_pool(flashes)


def _build_narratives(flashes: list[dict[str, Any]]) -> dict[str, Any]:
    pool = _narrative_pool(flashes)
    scored: list[tuple[str, int]] = []
    for name, pattern in NARRATIVE_TOPICS:
        count = _count_topic(pool, pattern)
        if count:
            scored.append((name, count))
    scored.sort(key=lambda x: x[1], reverse=True)

    rising = []
    for i, (name, count) in enumerate(scored[:4]):
        pattern = next(p for n, p in NARRATIVE_TOPICS if n == name)
        sample = next((f for f in pool if pattern.search(f["title"])), None)
        rising.append(
            {
                "id": f"n{i+1}",
                "name": name,
                "heat": min(95, 42 + count * 12),
                "delta": count * 4 + 3,
                "trend": "up",
                "sources": [_source(sample["url"], sample["title"])] if sample and sample.get("url") else [],
            }
        )

    cooling = []
    rising_names = {item["name"] for item in rising}
    for i, (name, count) in enumerate(
        [(n, c) for n, c in scored if n not in rising_names][:3]
    ):
        pattern = next(p for n, p in NARRATIVE_TOPICS if n == name)
        sample = next((f for f in pool if pattern.search(f["title"])), None)
        cooling.append(
            {
                "id": f"c{i+1}",
                "name": name,
                "heat": max(12, 38 - i * 8),
                "delta": -(10 + i * 6),
                "trend": "down",
                "sources": [_source(sample["url"], sample["title"])] if sample and sample.get("url") else [],
            }
        )

    if not cooling:
        fallback: list[tuple[str, re.Pattern[str], int, int]] = []
        for name, pattern in NARRATIVE_TOPICS:
            if name in rising_names:
                continue
            today_count = _count_topic(pool, pattern)
            full_count = _count_topic(flashes, pattern)
            if full_count:
                fallback.append((name, pattern, today_count, full_count))
        fallback.sort(key=lambda x: (x[2], x[3]))
        for i, (name, pattern, today_count, full_count) in enumerate(fallback[:3]):
            sample = next((f for f in flashes if pattern.search(f["title"])), None)
            cooling.append(
                {
                    "id": f"c{i+1}",
                    "name": name,
                    "heat": max(12, 32 - i * 8 - (6 if today_count == 0 else 0)),
                    "delta": -(12 + i * 5 + max(0, full_count - today_count) * 2),
                    "trend": "down",
                    "sources": [_source(sample["url"], sample["title"])] if sample and sample.get("url") else [],
                }
            )

    dispute_mini = [
        {"name": item["name"], "score": min(90, item["heat"]), "sources": item.get("sources")}
        for item in rising[:3]
    ]

    top_names = "、".join(item["name"] for item in rising[:2]) or "市场动态"
    cool_names = "、".join(item["name"] for item in cooling[:2])
    if cool_names:
        ai_judgment = (
            f"今日 Odaily 快讯主线集中在「{top_names}」；"
            f"「{cool_names}」等话题热度相对回落。"
        )
    else:
        ai_judgment = f"今日 Odaily 快讯主线集中在「{top_names}」。"
    return {
        "rising": rising,
        "cooling": cooling,
        "disputes": dispute_mini,
        "aiJudgment": ai_judgment,
    }


def _build_agenda(flashes: list[dict[str, Any]]) -> dict[str, Any]:
    tomorrow: list[dict[str, Any]] = []
    week_ahead: list[dict[str, Any]] = []
    for i, flash in enumerate(flashes):
        title = flash["title"]
        body = flash.get("body") or ""
        if not AGENDA_KEYWORDS.search(f"{title} {body}"):
            continue
        time_match = re.search(r"(\d{1,2}:\d{2})", title)
        entry = {
            "id": f"a{i}",
            "time": time_match.group(1) if time_match else "全天",
            "date": "明日" if "明日" in title else _date_label(),
            "level": "hard" if HARD_KEYWORDS.search(title) else "soft",
            "title": title,
            "impact": (body or title)[:80],
            "isToday": "今日" in title,
            "sources": [_source(flash["url"], title)] if flash.get("url") else [],
        }
        if "本周" in title or "下周" in title:
            week_ahead.append(entry)
        else:
            tomorrow.append(entry)
        if len(tomorrow) >= 5 and len(week_ahead) >= 3:
            break

    if not tomorrow:
        for i, flash in enumerate(flashes[:8]):
            title = flash["title"]
            if not (HARD_KEYWORDS.search(title) or CRYPTO_KEYWORDS.search(title)):
                continue
            tomorrow.append(
                {
                    "id": f"f{i}",
                    "time": "全天",
                    "date": "近期关注",
                    "level": "hard" if HARD_KEYWORDS.search(title) else "soft",
                    "title": title,
                    "impact": f"延续跟踪：{(flash.get('body') or title)[:60]}",
                    "sources": [_source(flash["url"], title)] if flash.get("url") else [],
                }
            )
            if len(tomorrow) >= 4:
                break

    if not week_ahead:
        used = {x["title"] for x in tomorrow}
        for i, flash in enumerate(flashes):
            title = flash["title"]
            if title in used or not CRYPTO_KEYWORDS.search(title):
                continue
            week_ahead.append(
                {
                    "id": f"w{i}",
                    "time": "全天",
                    "date": "本周后续",
                    "level": "soft",
                    "title": title,
                    "impact": (flash.get("body") or title)[:80],
                    "sources": [_source(flash["url"], title)] if flash.get("url") else [],
                }
            )
            if len(week_ahead) >= 3:
                break

    if tomorrow:
        tip = f"明日关注 {tomorrow[0]['title'][:24]}…"
    elif week_ahead:
        tip = f"本周关注 {week_ahead[0]['title'][:24]}…"
    else:
        tip = "暂无明确议程类快讯，已展示近期重要关注事项。"
    return {"tomorrow": tomorrow[:5], "weekAhead": week_ahead[:5], "tip": tip}


def _build_disputes(
    flashes: list[dict[str, Any]],
    posts: list[dict[str, Any]],
    rising: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    topic_map = {name: pattern for name, pattern in NARRATIVE_TOPICS}
    disputes: list[dict[str, Any]] = []
    today_flashes = [f for f in flashes if _is_today(f.get("publishedAt"))]

    for i, topic in enumerate(rising[:3]):
        name = topic["name"]
        pattern = topic_map.get(name)
        related = (
            [f for f in flashes if pattern and pattern.search(f"{f['title']} {f.get('body') or ''}")]
            if pattern
            else []
        )
        today_related = [f for f in related if _is_today(f.get("publishedAt"))]
        related_pool = today_related if len(today_related) >= 2 else related[:10]
        candidate = related_pool[0] if related_pool else (flashes[i] if i < len(flashes) else None)
        if not candidate:
            continue
        url = candidate.get("url") or ""
        title = candidate["title"]
        body = candidate.get("body") or title
        src = _source(url, title) if url else None
        disputes.append(
            {
                "id": f"d{i + 1}",
                "name": name,
                "score": topic["heat"],
                "sources": [src] if src else [],
                "relatedFlashes": _pick_dispute_related_flashes(candidate, related_pool, today_flashes),
                "camps": [
                    {
                        "side": "optimistic",
                        "label": "看多派（市场参与者）",
                        "quote": f"「{body[:58]}…」" if len(body) > 58 else f"「{body}」",
                        "basis": "Odaily 快讯",
                        "source": src,
                    },
                    {
                        "side": "pessimistic",
                        "label": "谨慎派（风险观察者）",
                        "quote": "「短期波动可能放大，需关注政策与流动性变化。」",
                        "basis": "市场风险",
                    },
                    {
                        "side": "neutral",
                        "label": "中立观察",
                        "quote": "「单条快讯不足以定论，宜结合更多报道交叉验证。」",
                        "basis": "Odaily 实时流",
                        "source": src,
                    },
                ],
                "insight": f"「{name}」相关报道今日出现 {len(today_related) or len(related) or 1} 条，分歧指数 {topic['heat']}。",
            }
        )

    if disputes:
        return disputes

    candidate = flashes[0] if flashes else None
    if not candidate:
        return []

    url = candidate.get("url") or ""
    title = candidate["title"]
    body = candidate.get("body") or title
    src = _source(url, title) if url else None
    return [
        {
            "id": "d1",
            "name": f"{title[:28]}…" if len(title) > 28 else title,
            "score": 68,
            "sources": [src] if src else [],
            "relatedFlashes": _pick_dispute_related_flashes(candidate, today_flashes, today_flashes),
            "camps": [
                {
                    "side": "optimistic",
                    "label": "看多派",
                    "quote": f"「{body[:60]}…」" if len(body) > 60 else f"「{body}」",
                    "basis": "Odaily 快讯",
                    "source": src,
                },
                {
                    "side": "pessimistic",
                    "label": "谨慎派",
                    "quote": "「需警惕短期反转风险。」",
                    "basis": "市场规律",
                },
                {
                    "side": "neutral",
                    "label": "中立",
                    "quote": "「建议持续跟踪后续报道。」",
                    "basis": "Odaily",
                    "source": src,
                },
            ],
            "insight": "该话题在今日快讯中热度较高，观点仍有分歧。",
        }
    ]


def _extract_odaily_author(body: str) -> str | None:
    patterns = [
        re.compile(r"作者[｜|]\s*([^（(\n@]+)"),
        re.compile(r"原文作者[：:]\s*([^原\n,，：:]+)"),
        re.compile(r"原文编译[：:]\s*([^原\n,，：:]+)"),
    ]
    for pat in patterns:
        m = pat.search(body)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return None


def _build_raw_flashes(
    flashes: list[dict[str, Any]],
    rising: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], str]:
    pool = _recent_flash_pool(flashes)
    topic_map = {name: pattern for name, pattern in NARRATIVE_TOPICS}
    picked: list[dict[str, Any]] = []
    seen: set[str] = set()

    def try_add(flash: dict[str, Any]) -> None:
        url = flash.get("url") or ""
        if url in seen:
            return
        seen.add(url)
        picked.append(flash)

    for topic in rising or []:
        if len(picked) >= 5:
            break
        pattern = topic_map.get(topic["name"])
        if not pattern:
            continue
        for flash in pool:
            if len(picked) >= 5:
                break
            text = f"{flash['title']} {flash.get('body') or ''}"
            if pattern.search(text):
                try_add(flash)

    from_rising = len(picked)

    for flash in pool:
        if len(picked) >= 5:
            break
        if _is_crypto(flash["title"]):
            try_add(flash)

    added_crypto = len(picked) - from_rising

    for flash in pool:
        if len(picked) >= 5:
            break
        try_add(flash)

    section_title = "今日币圈 · 升温话题（Top 5）"
    if from_rising == 0 and added_crypto > 0:
        section_title = "今日币圈（Top 5）"
    elif from_rising > 0 and added_crypto == 0:
        section_title = "升温话题（Top 5）"

    return picked[:5], section_title


def _build_raw(
    posts: list[dict[str, Any]],
    flashes: list[dict[str, Any]],
    rising: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    articles = [
        {
            "id": f"r{i+1}",
            "kind": "article",
            "title": p["title"],
            "body": p.get("body") or p["title"],
            "author": _extract_odaily_author(p.get("body") or "") or "Odaily",
            "time": _format_time(p.get("publishedAt")),
            "url": p.get("url"),
        }
        for i, p in enumerate(posts[:5])
    ]
    flash_items, flash_section_title = _build_raw_flashes(flashes, rising)
    flash_rows = [
        {
            "id": f"f{i+1}",
            "kind": "flash",
            "title": f["title"],
            "body": f.get("body") or f["title"],
            "time": _format_time(f.get("publishedAt")),
            "url": f.get("url"),
            "author": "Odaily",
        }
        for i, f in enumerate(flash_items)
    ]
    highlights = "；".join(f["title"][:28] for f in flash_items[:3])
    themes = "与".join(f"「{n['name']}」" for n in (rising or [])[:2])
    if themes:
        ai_summary = (
            f"过去数小时报道主线围绕{themes}展开。{highlights}。"
            "市场共识仍在形成，宜结合深度稿与快讯交叉阅读。"
        )
    else:
        ai_summary = f"过去数小时 Odaily 报道主线：{highlights}。"
    return {
        "articles": articles,
        "flashes": flash_rows,
        "flashSectionTitle": flash_section_title,
        "aiSummary": ai_summary,
    }


def _today_flash_pool(flashes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [f for f in flashes if _is_today(f.get("publishedAt"))]


def _build_category_flashes(flashes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    today = _today_flash_pool(flashes)
    buckets = [
        {"id": cat_id, "label": label, "count": 0, "items": []}
        for cat_id, label in FLASH_CATEGORY_DEFS
    ]
    bucket_map = {bucket["id"]: bucket for bucket in buckets}

    for flash in today:
        cat_ids = _classify_flash_categories(flash)
        if not cat_ids:
            continue
        item = _to_digest_item(flash)
        for cat_id in cat_ids:
            bucket = bucket_map.get(cat_id)
            if not bucket:
                continue
            bucket["items"].append(item)
            bucket["count"] += 1

    return buckets


def _build_digest(flashes: list[dict[str, Any]], posts: list[dict[str, Any]]) -> dict[str, Any]:
    date_label = _date_label()
    fetched_at = _now_bj().strftime(f"{date_label} %H:%M")
    pool = _recent_flash_pool(flashes)
    crypto = _build_crypto_items(pool)
    crypto_date_label = _flash_pool_date_label(pool)

    hot = posts[0] if posts else None
    hour = _now_bj().hour
    next_mins = max((((hour // 2) + 1) * 120 - (hour * 60 + _now_bj().minute)) % 1440, 1)

    return {
        "dateLabel": date_label,
        "todayDateLabel": date_label,
        "updatedAt": fetched_at,
        "nextUpdateMinutes": next_mins,
        "latestFlashes": [_to_digest_item(f) for f in flashes[:15]],
        "categoryFlashes": _build_category_flashes(flashes),
        "crypto": {
            "dateLabel": crypto_date_label,
            "items": [_to_digest_item(f) for f in crypto],
        },
        "hotTopic": {
            "title": hot["title"] if hot else "Odaily 星球日报",
            "url": hot["url"] if hot else "https://www.odaily.news/zh-CN/",
        },
        "live": True,
        "sourceLabel": "Odaily RSS 实时",
    }


def _beijing_today_str() -> str:
    return _now_bj().strftime("%Y-%m-%d")


def _is_crypto(title: str) -> bool:
    return bool(CRYPTO_KEYWORDS.search(title))


def _build_briefing_one_liner(
    rising: list[dict[str, Any]],
    cooling: list[dict[str, Any]],
    top_shifts: list[dict[str, Any]],
) -> str:
    hot = "、".join(item["name"] for item in rising[:2])
    cool = "、".join(item["name"] for item in cooling[:2])
    hard_count = sum(1 for s in top_shifts if s.get("level") == "hard")

    if hot:
        line = f"今日舆论主线围绕「{hot}」"
        if cool:
            line += f"，「{cool}」等话题温度回落"
        line += "。"
        line += (
            f"已识别 {hard_count} 条硬事实变局，宜优先跟踪地缘与政策后续。"
            if hard_count > 0
            else "共识仍在形成，建议结合下方四宫格交叉验证。"
        )
        return line

    if top_shifts:
        return f"今日共 {len(top_shifts)} 条核心变局待跟踪，详见 M1 今日变局。"

    return "正在汇聚 Odaily 最新报道。"


def build_prescient_payload(
    flashes: list[dict[str, Any]],
    posts: list[dict[str, Any]],
    *,
    source: str = "odaily-rss",
) -> dict[str, Any]:
    shifts = [_shift_from_flash(f, i + 1) for i, f in enumerate(flashes[:6])]
    narratives = _build_narratives(flashes)
    agenda = _build_agenda(flashes)
    disputes = _build_disputes(flashes, posts, narratives["rising"])
    raw = _build_raw(posts, flashes, narratives["rising"])
    digest = _build_digest(flashes, posts)

    top_shifts = [s for s in shifts if s["level"] != "noise"][:3]
    one_liner = _build_briefing_one_liner(
        narratives["rising"],
        narratives["cooling"],
        top_shifts,
    )

    return {
        "live": True,
        "sourceLabel": source,
        "briefing": {
            "generatedAt": _beijing_now_str(),
            "oneLiner": one_liner,
            "topShifts": top_shifts,
            "hotNarratives": narratives["rising"][:3],
            "topAgenda": agenda["tomorrow"][:3],
            "topDispute": disputes[0] if disputes else None,
        },
        "digest": digest,
        "shifts": shifts,
        "narratives": narratives,
        "agenda": agenda,
        "disputes": disputes,
        "raw": raw,
    }
