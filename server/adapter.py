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
    clean = title.replace("【快讯】", "").strip()
    return clean if clean.endswith("；") else f"{clean}；"


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
        (re.compile(r"AI|OpenAI|监管|法案", re.I), "科技监管"),
        (re.compile(r"比特币|BTC|ETH|加密|代币|DeFi", re.I), "加密"),
        (re.compile(r"美联储|宏观|通胀|GDP|利率", re.I), "宏观"),
        (re.compile(r"战争|伊朗|以色列|海峡|能源", re.I), "地缘"),
        (re.compile(r"交易所|上市|IPO", re.I), "商业"),
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

    for i, topic in enumerate(rising[:3]):
        name = topic["name"]
        pattern = topic_map.get(name)
        related = [f for f in flashes if pattern and pattern.search(f["title"])] if pattern else []
        candidate = related[0] if related else (flashes[i] if i < len(flashes) else None)
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
                "insight": f"「{name}」相关报道今日出现 {len(related) or 1} 条，分歧指数 {topic['heat']}。",
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
        for i, f in enumerate(flashes[:5])
    ]
    highlights = "；".join(f["title"][:28] for f in flashes[:3])
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
        "aiSummary": ai_summary,
    }


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
        "updatedAt": fetched_at,
        "nextUpdateMinutes": next_mins,
        "latestFlashes": [{"id": str(f["id"]), "text": _flash_text(f["title"])} for f in flashes[:15]],
        "crypto": {
            "dateLabel": crypto_date_label,
            "items": [{"id": str(f["id"]), "text": _flash_text(f["title"])} for f in crypto],
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
