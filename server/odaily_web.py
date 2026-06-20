"""Odaily Web API — 币圈机会模块深度分页拉取。"""
from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from http.client import IncompleteRead
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

BJ = timezone(timedelta(hours=8))
ODAILY_WEB_API = "https://web-api.odaily.news"
UA = "Prescient-UI/0.2 (+odaily-web-api)"

OPPORTUNITY_LOOKBACK_DAYS = 120
OPPORTUNITY_FETCH_CONCURRENCY = 8
OPPORTUNITY_MAX_FLASH_PAGES = 200
OPPORTUNITY_MAX_POST_PAGES = 20
OPPORTUNITY_PAGE_SIZE = 50


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()


def _fetch_json(path: str) -> dict[str, Any]:
    req = Request(
        f"{ODAILY_WEB_API}{path}",
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "x-locale": "zh-CN",
            "Origin": "https://www.odaily.news",
            "Referer": "https://www.odaily.news/zh-CN/newsflash",
        },
    )
    with urlopen(req, timeout=25) as resp:
        payload = json.loads(resp.read().decode())
    if payload.get("code") != 200:
        raise RuntimeError(f"Odaily Web API error: {path}")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise RuntimeError(f"Odaily Web API malformed: {path}")
    return data


def _newsflash_to_feed(row: dict[str, Any]) -> dict[str, Any]:
    body = _strip_html(row.get("description") or "").replace("Odaily星球日报讯 ", "", 1)
    item_id = row.get("id")
    return {
        "id": str(item_id),
        "title": row.get("title") or "",
        "url": row.get("newsUrl") or f"https://www.odaily.news/zh-CN/newsflash/{item_id}",
        "publishedAt": datetime.fromtimestamp(row["publishTimestamp"] / 1000, BJ).isoformat(),
        "body": body,
    }


def _post_to_feed(row: dict[str, Any]) -> dict[str, Any]:
    post_id = row.get("id")
    return {
        "id": f"post-{post_id}",
        "title": row.get("title") or "",
        "url": f"https://www.odaily.news/zh-CN/post/{post_id}",
        "publishedAt": datetime.fromtimestamp(row["publishTimestamp"] / 1000, BJ).isoformat(),
        "body": _strip_html(row.get("summary") or ""),
    }


def _fetch_newsflash_page(page: int, size: int = OPPORTUNITY_PAGE_SIZE) -> list[dict[str, Any]]:
    for attempt in range(3):
        try:
            data = _fetch_json(f"/newsflash/page?page={page}&size={size}")
            return list(data.get("list") or [])
        except (OSError, URLError, ValueError, RuntimeError, IncompleteRead):
            if attempt == 2:
                return []
            time.sleep(0.25 * (attempt + 1))
    return []


def _fetch_post_page(page: int, size: int = 30) -> list[dict[str, Any]]:
    for attempt in range(3):
        try:
            data = _fetch_json(f"/post/page?page={page}&size={size}")
            return list(data.get("list") or [])
        except (OSError, URLError, ValueError, RuntimeError, IncompleteRead):
            if attempt == 2:
                return []
            time.sleep(0.25 * (attempt + 1))
    return []


def fetch_odaily_newsflash_pool(days_back: int = OPPORTUNITY_LOOKBACK_DAYS) -> list[dict[str, Any]]:
    cutoff_ms = int((datetime.now(BJ) - timedelta(days=days_back)).timestamp() * 1000)
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    page = 1
    done = False

    with ThreadPoolExecutor(max_workers=OPPORTUNITY_FETCH_CONCURRENCY) as executor:
        while page <= OPPORTUNITY_MAX_FLASH_PAGES and not done:
            pages = [p for p in range(page, page + OPPORTUNITY_FETCH_CONCURRENCY) if p <= OPPORTUNITY_MAX_FLASH_PAGES]
            futures = {executor.submit(_fetch_newsflash_page, p): p for p in pages}
            page_results: dict[int, list[dict[str, Any]]] = {}
            for future in as_completed(futures):
                p = futures[future]
                try:
                    page_results[p] = future.result()
                except (OSError, URLError, ValueError, RuntimeError, IncompleteRead):
                    page_results[p] = []

            empty_batch = True
            for p in sorted(pages):
                batch = page_results.get(p, [])
                if not batch:
                    done = True
                    break
                empty_batch = False
                for item in batch:
                    ts = item.get("publishTimestamp") or 0
                    if ts < cutoff_ms:
                        done = True
                        break
                    feed = _newsflash_to_feed(item)
                    url = feed.get("url") or ""
                    if not url or url in seen:
                        continue
                    seen.add(url)
                    rows.append(feed)
                if done:
                    break

            if empty_batch:
                break
            page += OPPORTUNITY_FETCH_CONCURRENCY
            time.sleep(0.12)

    rows.sort(
        key=lambda item: datetime.fromisoformat(item["publishedAt"]).timestamp()
        if item.get("publishedAt")
        else 0,
        reverse=True,
    )
    return rows


def fetch_odaily_post_pool(
    days_back: int = OPPORTUNITY_LOOKBACK_DAYS,
    max_pages: int = OPPORTUNITY_MAX_POST_PAGES,
) -> list[dict[str, Any]]:
    cutoff_ms = int((datetime.now(BJ) - timedelta(days=days_back)).timestamp() * 1000)
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []

    for page in range(1, max_pages + 1):
        try:
            batch = _fetch_post_page(page)
        except OSError:
            break
        if not batch:
            break
        reached = False
        for item in batch:
            ts = item.get("publishTimestamp") or 0
            if ts < cutoff_ms:
                reached = True
                break
            feed = _post_to_feed(item)
            url = feed.get("url") or ""
            if not url or url in seen:
                continue
            seen.add(url)
            rows.append(feed)
        if reached:
            break

    return rows


def fetch_odaily_opportunity_feed() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    flashes = fetch_odaily_newsflash_pool()
    posts = fetch_odaily_post_pool()
    return flashes, posts
