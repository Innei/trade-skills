#!/usr/bin/env python3
"""A-share ticker search / batch list via HiThink meta endpoints."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

import _common  # noqa: E402


def main() -> dict:
    p = argparse.ArgumentParser(description="A-share ticker search / list via HiThink.")
    p.add_argument("query", nargs="?", help="Search keyword: thscode, ticker, or CN/EN name.")
    p.add_argument("--asset-type", dest="asset_type", choices=["a-share", "a-share-index"], help="Filter by asset type.")
    p.add_argument("--limit", type=int, default=10, help="Max results (search: <=50, list: <=10000).")
    p.add_argument("--list", action="store_true", help="Use tickers/list (batch) instead of tickers/search.")
    p.add_argument("--offset", type=int, default=0, help="--list only: pagination offset.")
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if args.smoke:
        _common.request("/meta/tickers/search", {"q": "600519.SH", "limit": 1}, ttl=0)
        return client.success({"status": "ok"}, smoke=True)

    if args.list:
        data = _common.request(
            "/meta/tickers/list",
            {"asset_type": args.asset_type or "a-share", "limit": args.limit or 1000, "offset": args.offset},
            ttl=24 * 3600,
            fresh=args.fresh,
        )
        return client.success(data.get("item") or [], timestamp=data.get("timestamp"))

    if not args.query:
        raise client.ClientError(
            "query is required unless --list is set.",
            exit_code=1,
            hint="e.g. search.py 600519.SH  or  search.py 贵州茅台",
        )

    data = _common.request(
        "/meta/tickers/search",
        {"q": args.query, "asset_type": args.asset_type, "limit": args.limit},
        ttl=24 * 3600,
        fresh=args.fresh,
    )
    return client.success(data.get("item") or [], timestamp=data.get("timestamp"), query=args.query)


if __name__ == "__main__":
    client.run(main)
