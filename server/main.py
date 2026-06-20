"""
Odaily 数据代理 — RSS 实时流 + 可选 Odaily Skill。

启动:
  python server/main.py
"""
from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.request import Request, urlopen

import httpx

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from adapter import build_opportunities_payload, build_prescient_payload
from skill_bridge import skill_status

RSS_FLASH = "https://rss.odaily.news/rss/newsflash"
RSS_POST = "https://rss.odaily.news/rss/post"
BJ = timezone(timedelta(hours=8))

CRYPTO_KEYWORDS = re.compile(
    r"BTC|ETH|SOL|BNB|XRP|USDT|USDC|ETF|DeFi|NFT|Web3|Polymarket|"
    r"比特币|以太坊|加密|区块链|代币|合约|巨鲸|交易所|山寨|稳定币|"
    r"Strategy|Tether|Coinbase|Binance|Upbit|Solana|空投|质押|"
    r"Layer\s*2|L2|Meme|DEX|CEX|矿|算力|钱包|链上|现货|期货",
    re.IGNORECASE,
)

app = FastAPI(title="Prescient Odaily Proxy", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _fetch(url: str) -> bytes:
    headers = {"User-Agent": "Prescient-UI/0.2 (+odaily-proxy)"}
    try:
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            res = client.get(url, headers=headers)
            res.raise_for_status()
            return res.content
    except httpx.HTTPError:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=20) as resp:
            return resp.read()


def _strip_html(text: str) -> str:
    text = html.unescape(text or "")
    if "&lt;" in text or "&gt;" in text:
        text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _parse_rss(xml_bytes: bytes, *, with_body: bool = False) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_bytes)
    items: list[dict[str, Any]] = []
    for item in root.findall(".//item"):
        title = _strip_html(item.findtext("title", "") or "")
        link = (item.findtext("link", "") or "").strip()
        pub_raw = item.findtext("pubDate", "") or ""
        published_at = None
        if pub_raw:
            try:
                published_at = parsedate_to_datetime(pub_raw).astimezone(BJ).isoformat()
            except (TypeError, ValueError, OverflowError):
                published_at = pub_raw
        entry: dict[str, Any] = {
            "id": link.rsplit("/", 1)[-1] if link else title[:32],
            "title": title,
            "url": link,
            "publishedAt": published_at,
        }
        if with_body:
            body = _strip_html(item.findtext("description", "") or "")
            body = re.sub(r"^Odaily星球日报讯\s*", "", body)
            entry["body"] = body
        items.append(entry)
    return items


def _beijing_today() -> str:
    return datetime.now(BJ).strftime("%Y-%m-%d")


def _is_crypto(title: str) -> bool:
    return bool(CRYPTO_KEYWORDS.search(title))


def _load_rss_feeds() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    flashes = _parse_rss(_fetch(RSS_FLASH), with_body=True)
    posts = _parse_rss(_fetch(RSS_POST), with_body=True)
    return flashes, posts


@app.get("/api/health")
def health():
    return {"ok": True, "service": "prescient-odaily-proxy", "skill": skill_status()}


@app.get("/api/opportunities")
def opportunities_data():
    """币圈机会专用 — Odaily Web API 分页（近 4 个月）。"""
    return build_opportunities_payload()


@app.get("/api/prescient")
def prescient_data():
    """全量 Prescient 数据（M1–M5 + 简报 + 快讯），源自 Odaily RSS。"""
    flashes, posts = _load_rss_feeds()
    return build_prescient_payload(flashes, posts, source="odaily-rss")


@app.get("/api/odaily/digest")
def odaily_digest(latest_limit: int = 15, crypto_limit: int = 10):
    """快讯专用（兼容旧接口）。"""
    payload = prescient_data()
    digest = payload["digest"]
    digest["latestFlashes"] = digest["latestFlashes"][:latest_limit]
    digest["crypto"]["items"] = digest["crypto"]["items"][:crypto_limit]
    return {
        "fetchedAt": digest["updatedAt"],
        "latestFlashes": [
            {
                "id": i["id"],
                "title": i["text"].rstrip("；"),
                "url": i.get("url") or "",
                "publishedAt": None,
            }
            for i in digest["latestFlashes"]
        ],
        "cryptoFlashes": [
            {
                "id": i["id"],
                "title": i["text"].rstrip("；"),
                "url": i.get("url") or "",
                "publishedAt": None,
            }
            for i in digest["crypto"]["items"]
        ],
        "hotPost": {
            "id": "hot",
            "title": digest["hotTopic"]["title"],
            "url": digest["hotTopic"]["url"],
        },
        "source": payload.get("sourceLabel", "odaily-rss"),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=5181)
