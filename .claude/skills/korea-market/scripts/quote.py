#!/usr/bin/env python3
"""Korean market quotes + exhaustion evidence for the memory complex.

Longbridge does not cover KRX. US-listed proxies (EWY / KORU) lie: they are
FX-contaminated and frozen while Seoul is still trading. On 2026-07-14 EWY read
"flat" while SK Hynix actually ran -9.1% intraday and closed +2.9% on the
heaviest volume of the entire selloff — a capitulation bottom the proxy hid.

This script reports EVIDENCE, not a verdict. The four exhaustion conditions
carry reference thresholds, not laws — a name clearing three of four with the
fourth just short is a different animal from one clearing none, and collapsing
that into a boolean throws away the distinction that matters. Read the numbers
and judge in context.

Source: Yahoo Finance chart API (stdlib urllib, no third-party deps).
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # .claude/skills/
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range={rng}&interval=1d"
UA = {"User-Agent": "Mozilla/5.0"}

MEMORY_SET = {
    "^KS11": "KOSPI",
    "^KQ11": "KOSDAQ",
    "000660.KS": "SK Hynix",
    "005930.KS": "Samsung Electronics",
}

# Reference thresholds — starting points for judgement, not thresholds that decide.
REF_REL_VOLUME = 1.3      # volume vs 20-session average
REF_CLOSE_POSITION = 0.6  # (close-low)/(high-low): where the close sits in the day's range


def _rows(sym: str, rng: str, fresh: bool) -> list[dict]:
    payload = client.fetch(
        CHART_URL.format(sym=sym, rng=rng),
        source="yahoo",
        ttl=300,
        headers=UA,
        fresh=fresh,
    )
    result = (payload.get("chart") or {}).get("result")
    if not result:
        err = (payload.get("chart") or {}).get("error")
        raise client.ClientError(
            f"no data for {sym}: {err}",
            hint="Check the Yahoo symbol (KRX stocks are 000660.KS, indices are ^KS11).",
        )
    r = result[0]
    stamps = r.get("timestamp") or []
    q = (r["indicators"]["quote"] or [{}])[0]
    out = []
    for i, ts in enumerate(stamps):
        c, h, low, v = q["close"][i], q["high"][i], q["low"][i], q["volume"][i]
        if c is None or h is None or low is None:
            continue
        out.append({
            "date": datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d"),
            "close": c, "high": h, "low": low, "volume": v or 0,
        })
    if len(out) < 2:
        raise client.ClientError(f"insufficient history for {sym}", hint="Widen --range.")
    return out


def _analyse(sym: str, name: str, rows: list[dict], ref_vol: float, ref_pos: float) -> dict:
    cur, prev = rows[-1], rows[-2]
    close, high, low = cur["close"], cur["high"], cur["low"]
    prev_close, prev_low = prev["close"], prev["low"]

    hist = [r["volume"] for r in rows[-21:-1] if r["volume"]]
    avg_vol = sum(hist) / len(hist) if hist else 0
    rel_vol = round(cur["volume"] / avg_vol, 2) if avg_vol else None

    rng = high - low
    close_pos = round((close - low) / rng, 2) if rng > 0 else None
    run_high = max(r["high"] for r in rows[-21:])
    change_pct = round((close / prev_close - 1) * 100, 2)

    # Each condition reports its measurement AND the reference it is being read
    # against, so a near-miss stays visible as a near-miss.
    evidence = {
        "made_new_low": {
            "value": low, "prior_low": prev_low, "clears": low < prev_low,
            "why": "sellers pushed below the prior floor — a capitulation bottom prints a new low by definition",
        },
        "heavy_volume": {
            "value": rel_vol, "reference": ref_vol, "clears": bool(rel_vol and rel_vol >= ref_vol),
            "why": "selling was maximal, not a drift; volume separates 'sellers are done' from 'buyers left'",
        },
        "green_close": {
            "value": change_pct, "reference": 0.0, "clears": close > prev_close,
            "why": "buyers won the session outright",
        },
        "closed_strong": {
            "value": close_pos, "reference": ref_pos, "clears": bool(close_pos and close_pos >= ref_pos),
            "why": "they won it decisively, not in a last-minute bounce off the bell",
        },
    }
    clears = sum(1 for e in evidence.values() if e["clears"])

    return {
        "symbol": sym,
        "name": name,
        "date": cur["date"],
        "is_index": sym.startswith("^"),
        "close": close,
        "prev_close": prev_close,
        "change_pct": change_pct,
        "high": high,
        "low": low,
        "volume": cur["volume"],
        "rel_volume": rel_vol,
        "recovery_from_low_pct": round((close / low - 1) * 100, 2) if low else None,
        "close_position_in_range": close_pos,
        "drawdown_from_20d_high_pct": round((close / run_high - 1) * 100, 2) if run_high else None,
        "exhaustion_evidence": evidence,
        "conditions_cleared": f"{clears}/4",
    }


def main() -> dict:
    p = argparse.ArgumentParser(
        description="Korean market quotes + exhaustion evidence (KOSPI / KOSDAQ / SK Hynix / Samsung). "
                    "Reports evidence; the caller judges."
    )
    p.add_argument("symbols", nargs="*", help="Yahoo symbols. Default: KOSPI, KOSDAQ, SK Hynix, Samsung.")
    p.add_argument("--range", default="2mo", help="History window (default 2mo).")
    p.add_argument("--min-rel-volume", type=float, default=REF_REL_VOLUME,
                   help=f"Reference for heavy volume (default {REF_REL_VOLUME}). A reference, not a rule.")
    p.add_argument("--min-close-position", type=float, default=REF_CLOSE_POSITION,
                   help=f"Reference for a strong close (default {REF_CLOSE_POSITION}). A reference, not a rule.")
    p.add_argument("--fresh", action="store_true", help="Bypass cache.")
    p.add_argument("--smoke", action="store_true", help="Connectivity self-test.")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    if args.smoke:
        rows = _rows("^KS11", "5d", fresh=True)
        return client.success(
            {"status": "ok", "kospi_last_close": rows[-1]["close"], "session": rows[-1]["date"]},
            smoke=True,
        )

    targets = {s: s for s in args.symbols} if args.symbols else MEMORY_SET
    results = [
        _analyse(sym, name, _rows(sym, args.range, args.fresh),
                 args.min_rel_volume, args.min_close_position)
        for sym, name in targets.items()
    ]

    return client.success(
        {"symbols": results},
        session=results[0]["date"] if results else None,
        source="Yahoo Finance (KRX)",
        thresholds_are_references=(
            "conditions_cleared is a tally, not a verdict. Three of four with the fourth just short "
            "is not the same as zero of four — read the measurements, weigh them against the tape, "
            "and judge. Indices are context; their volume is a poor exhaustion gauge (diluted across "
            "~900 constituents), so weight the individual names more heavily."
        ),
        caveat=(
            "A leverage flush explains the VIOLENCE of a move, not its DIRECTION. An exhaustion bottom "
            "does not un-announce a supply-side signal."
        ),
        note="Longbridge does not cover KRX; EWY/KORU are FX-contaminated, lagging proxies.",
    )


if __name__ == "__main__":
    client.run(main)
