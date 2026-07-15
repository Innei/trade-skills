#!/usr/bin/env python3
"""A-share daily kline via HiThink prices/historical."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

import _common  # noqa: E402


def main() -> dict:
    p = argparse.ArgumentParser(description="A-share daily kline via HiThink.")
    p.add_argument("thscode", nargs="?", default="600519.SH", help="Single thscode, e.g. 600519.SH")
    p.add_argument("--days", type=int, default=120, help="Convenience window: last N days (ignored if --start given).")
    p.add_argument("--start", type=int, help="Start ms epoch (overrides --days).")
    p.add_argument("--end", type=int, help="End ms epoch (default: now).")
    p.add_argument("--interval", default="1d", help="Kline interval (only 1d supported upstream).")
    p.add_argument("--adjust", choices=["none", "forward", "backward"], default="forward")
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    now_ms = int(time.time() * 1000)

    if args.smoke:
        _common.request(
            "/a-share/prices/historical",
            {
                "thscode": "600519.SH",
                "interval": "1d",
                "start": now_ms - 5 * 86400000,
                "end": now_ms,
                "adjust": "forward",
            },
            ttl=0,
        )
        return client.success({"status": "ok"}, smoke=True)

    end_ms = args.end if args.end is not None else now_ms
    start_ms = args.start if args.start is not None else end_ms - args.days * 86400000

    data = _common.request(
        "/a-share/prices/historical",
        {
            "thscode": args.thscode,
            "interval": args.interval,
            "start": start_ms,
            "end": end_ms,
            "adjust": args.adjust,
        },
        ttl=3600,
        fresh=args.fresh,
    )
    item = data.get("item") or []
    return client.success(
        item,
        thscode=args.thscode,
        start_ms=start_ms,
        end_ms=end_ms,
        adjust=args.adjust,
        count_returned=len(item),
    )


if __name__ == "__main__":
    client.run(main)
