#!/usr/bin/env python3
"""A-share financial statements & indicators via HiThink."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

import _common  # noqa: E402

PATHS = {
    "income": "/a-share/financials/income-statements",
    "balance": "/a-share/financials/balance-sheets",
    "cashflow": "/a-share/financials/cash-flow-statements",
    "indicators": "/a-share/financials/indicators",
}


def main() -> dict:
    p = argparse.ArgumentParser(description="A-share financials via HiThink.")
    p.add_argument("thscode", nargs="?", default="600519.SH")
    p.add_argument("--kind", choices=list(PATHS), default="income")
    p.add_argument("--period", choices=["annual", "quarterly"], default="annual")
    p.add_argument("--limit", type=int, help="Most-recent-N mode; mutually exclusive with --start/--end.")
    p.add_argument("--start", type=int, help="Window mode start ms epoch.")
    p.add_argument("--end", type=int, help="Window mode end ms epoch.")
    p.add_argument("--report", help="indicators only: report period, e.g. 2025-1 (1=Q1 2=H1 3=Q3 4=FY).")
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if args.smoke:
        _common.request(
            PATHS["income"],
            {"thscode": "600519.SH", "period": "annual", "limit": 1},
            ttl=0,
        )
        return client.success({"status": "ok"}, smoke=True)

    path = PATHS[args.kind]

    if args.kind == "indicators":
        if not args.report:
            raise client.ClientError(
                "--report is required for --kind indicators",
                exit_code=1,
                hint="Format: yyyy-N, e.g. 2025-1 (1=Q1 2=H1 3=Q3 4=FY)",
            )
        data = _common.request(
            path, {"thscode": args.thscode, "report": args.report}, ttl=3600, fresh=args.fresh
        )
        return client.success(data.get("abilities") or [], thscode=args.thscode, report=args.report)

    if args.start is not None or args.end is not None:
        if args.start is None or args.end is None:
            raise client.ClientError(
                "--start and --end must be supplied together (window mode).",
                exit_code=1,
                hint="Or use --limit for most-recent-N mode instead.",
            )
        if args.limit is not None:
            raise client.ClientError(
                "--limit and --start/--end are mutually exclusive.",
                exit_code=1,
            )
        params = {"thscode": args.thscode, "period": args.period, "start": args.start, "end": args.end}
    else:
        params = {"thscode": args.thscode, "period": args.period, "limit": args.limit or 4}

    data = _common.request(path, params, ttl=3600, fresh=args.fresh)
    item = data.get("item") or []
    return client.success(item, thscode=args.thscode, kind=args.kind, period=args.period, count_returned=len(item))


if __name__ == "__main__":
    client.run(main)
