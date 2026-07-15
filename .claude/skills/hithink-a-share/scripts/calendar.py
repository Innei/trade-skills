#!/usr/bin/env python3
"""A-share trading day calendar (trailing 1 year) via HiThink."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

import _common  # noqa: E402


def main() -> dict:
    p = argparse.ArgumentParser(description="A-share trading day calendar via HiThink.")
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if args.smoke:
        _common.request("/a-share/calendar/trading-days", {}, ttl=0)
        return client.success({"status": "ok"}, smoke=True)

    data = _common.request("/a-share/calendar/trading-days", {}, ttl=6 * 3600, fresh=args.fresh)
    return client.success(data.get("item") or [], timestamp=data.get("timestamp"))


if __name__ == "__main__":
    client.run(main)
