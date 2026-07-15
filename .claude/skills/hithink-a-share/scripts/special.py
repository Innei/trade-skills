#!/usr/bin/env python3
"""A-share special data (limit-up / dragon-tiger / hot lists / anomaly) via HiThink."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

import _common  # noqa: E402

KINDS = {
    "limit-up-pool": "/a-share/special-data/limit-up-pool",
    "limit-up-ladder": "/a-share/special-data/limit-up-ladder",
    "dragon-tiger": "/a-share/special-data/dragon-tiger-list",
    "skyrocket": "/a-share/special-data/skyrocket-list",
    "hot": "/a-share/special-data/hot-stock-list",
    "hot-history": "/a-share/special-data/hot-stock-list-history",
    "hot-rank-trend": "/a-share/special-data/hot-stock-rank-trend",
    "anomaly": "/a-share/special-data/anomaly-analysis-list",
    "anomaly-stock": "/a-share/special-data/anomaly-analysis-stock",
}


def build_params(kind: str, args: argparse.Namespace) -> dict:
    if kind == "limit-up-pool":
        return {
            "date_ms": args.date_ms,
            "page": args.page,
            "size": args.size,
            "sort_field": args.sort_field,
            "sort_dir": args.sort_dir,
        }
    if kind == "limit-up-ladder":
        return {}
    if kind == "dragon-tiger":
        return {"board_type": args.board_type, "date": args.date}
    if kind in ("skyrocket", "hot"):
        return {"period": args.period}
    if kind == "hot-history":
        if not args.date:
            raise client.ClientError(
                "--date is required for --kind hot-history", exit_code=1, hint="Format: yyyy-MM-dd"
            )
        return {"date": args.date}
    if kind == "hot-rank-trend":
        if not (args.thscode and args.start_date and args.end_date):
            raise client.ClientError(
                "--thscode, --start-date, --end-date are all required for --kind hot-rank-trend",
                exit_code=1,
            )
        return {"thscode": args.thscode, "start_date": args.start_date, "end_date": args.end_date}
    if kind == "anomaly":
        return {"tag_codes": args.tag_codes}
    if kind == "anomaly-stock":
        if not args.thscodes:
            raise client.ClientError("--thscodes is required for --kind anomaly-stock", exit_code=1)
        return {"thscodes": args.thscodes}
    raise client.ClientError(f"unhandled kind: {kind}", exit_code=1)


def main() -> dict:
    p = argparse.ArgumentParser(description="A-share special data via HiThink.")
    p.add_argument("--kind", choices=list(KINDS), default="limit-up-pool")
    p.add_argument("--date-ms", dest="date_ms", type=int, help="limit-up-pool: target trading day ms epoch.")
    p.add_argument("--page", type=int, help="limit-up-pool: page number (>=1).")
    p.add_argument("--size", type=int, help="limit-up-pool: page size (1-200).")
    p.add_argument(
        "--sort-field",
        dest="sort_field",
        choices=["last_price", "continue_day_cnt", "seal_money", "limit_up_time"],
        help="limit-up-pool: sort field.",
    )
    p.add_argument("--sort-dir", dest="sort_dir", choices=["asc", "desc"], help="limit-up-pool: sort direction.")
    p.add_argument(
        "--board-type", dest="board_type", choices=["all", "org", "hot_money"], help="dragon-tiger: board type."
    )
    p.add_argument("--date", help="dragon-tiger / hot-history: yyyy-MM-dd.")
    p.add_argument("--period", choices=["day", "hour"], help="skyrocket / hot: day or hour period.")
    p.add_argument("--thscode", help="hot-rank-trend: single thscode.")
    p.add_argument("--start-date", dest="start_date", help="hot-rank-trend: yyyy-MM-dd.")
    p.add_argument("--end-date", dest="end_date", help="hot-rank-trend: yyyy-MM-dd.")
    p.add_argument("--tag-codes", dest="tag_codes", help="anomaly: comma-separated tags, e.g. LIMIT_UP,SHARP_FALL.")
    p.add_argument("--thscodes", help="anomaly-stock: comma-separated thscodes.")
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if args.smoke:
        _common.request(KINDS["skyrocket"], {"period": "day"}, ttl=0)
        return client.success({"status": "ok"}, smoke=True)

    path = KINDS[args.kind]
    params = build_params(args.kind, args)
    data = _common.request(path, params, ttl=60, fresh=args.fresh)

    if args.kind == "limit-up-pool":
        return client.success(
            data.get("item") or [],
            kind=args.kind,
            pagination=data.get("pagination"),
            timestamp=data.get("timestamp"),
        )
    if args.kind == "limit-up-ladder":
        return client.success(
            data.get("item") or [], kind=args.kind, window=data.get("window"), timestamp=data.get("timestamp")
        )
    if args.kind == "dragon-tiger":
        return client.success(
            data.get("stock_items") or data.get("hot_money_items") or [],
            kind=args.kind,
            board_type=data.get("board_type"),
            trade_date=data.get("trade_date"),
            count=data.get("count"),
            stock_count=data.get("stock_count"),
        )
    return client.success(
        data.get("item") or [], kind=args.kind, timestamp=data.get("timestamp") or data.get("date_ms")
    )


if __name__ == "__main__":
    client.run(main)
