#!/usr/bin/env python3
"""A-share quote snapshot(s) via HiThink prices/snapshot."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

import _common  # noqa: E402


def main() -> dict:
    p = argparse.ArgumentParser(description="A-share quote snapshot via HiThink.")
    p.add_argument("thscodes", nargs="*", help="thscode(s), e.g. 600519.SH 000001.SZ")
    p.add_argument("--limit", type=int, help="Full-market page size (only when thscodes omitted).")
    p.add_argument("--offset", type=int, help="Full-market page offset (only when thscodes omitted).")
    p.add_argument("--fresh", action="store_true", help="Bypass cache.")
    p.add_argument("--smoke", action="store_true", help="Connectivity self-test.")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--json", action="store_true", help="No-op; output is always JSON.")
    args = p.parse_args()

    if args.smoke:
        _common.request("/a-share/prices/snapshot", {"thscodes": "600519.SH"}, ttl=0)
        return client.success({"status": "ok"}, smoke=True)

    params: dict = {}
    if args.thscodes:
        params["thscodes"] = ",".join(args.thscodes)
    else:
        params["limit"] = args.limit
        params["offset"] = args.offset

    data = _common.request("/a-share/prices/snapshot", params, ttl=15, fresh=args.fresh)
    return client.success(
        data.get("item") or [],
        total=data.get("total"),
        timestamp=data.get("timestamp"),
    )


if __name__ == "__main__":
    client.run(main)
