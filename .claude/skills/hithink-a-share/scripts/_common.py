"""Shared HTTP/auth glue for hithink-a-share scripts. Local to this skill (not _shared/)."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[2]  # .claude/skills/
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

BASE = "https://fuyao.aicubes.cn/api"
SOURCE = "hithink"

client.THROTTLE.setdefault(SOURCE, {"min_interval": 0.5})


def api_key() -> str:
    key = os.environ.get("HITHINK_FINANCE_API_KEY")
    if not key:
        raise client.ClientError(
            "Missing HITHINK_FINANCE_API_KEY.",
            exit_code=2,
            hint="Set HITHINK_FINANCE_API_KEY in .env at project root",
        )
    return key


def request(path: str, params: dict, *, ttl: float = 300, fresh: bool = False) -> dict:
    key = api_key()
    query = {k: v for k, v in params.items() if v is not None}
    url = f"{BASE}{path}"
    if query:
        url += f"?{urlencode(query)}"
    resp = client.fetch(url, source=SOURCE, ttl=ttl, headers={"X-API-Key": key}, fresh=fresh)
    code = resp.get("code")
    if code != 0:
        raise client.ClientError(
            f"hithink error {code}: {resp.get('message')}",
            exit_code=3,
            hint=f"request_id={resp.get('request_id')}",
        )
    return resp.get("data") or {}
