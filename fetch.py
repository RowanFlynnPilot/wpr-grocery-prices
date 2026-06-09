"""
fetch.py — pull the WPR grocery & energy basket from the BLS Average Price API
and emit a single static JSON file for the React frontend.

This is an API CLIENT. It is not a scraper and must never become one
(see CLAUDE.md). One declared series per basket item; if a declared series
returns no current data, we fail loudly rather than substitute anything.

Run:  python fetch.py
Env:  BLS_API_KEY (optional) -> higher rate limits + deeper history.
Out:  data/prices.json
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

import yaml

API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
BASKET_PATH = Path(__file__).parent / "basket.yaml"
OUT_PATH = Path(__file__).parent / "data" / "prices.json"

MIDWEST_STATES = ("Illinois, Indiana, Iowa, Kansas, Michigan, Minnesota, "
                  "Missouri, Nebraska, North Dakota, Ohio, South Dakota, Wisconsin")
REQUIRED_FIELDS = ("key", "label", "unit", "category", "geography", "series_id")
GEO_LABEL = {"midwest": "Midwest region", "us": "U.S. city average"}


def load_basket(path):
    """Load and validate the editorial basket. Fail loudly on any malformed row."""
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    items = doc["items"]
    history_years = int(doc.get("settings", {}).get("history_years", 3))

    seen_keys, seen_series = set(), set()
    for row in items:
        missing = [f for f in REQUIRED_FIELDS if not row.get(f)]
        if missing:
            raise ValueError(f"basket row {row!r} missing fields: {missing}")
        if row["geography"] not in GEO_LABEL:
            raise ValueError(f"{row['key']}: bad geography {row['geography']!r}")
        if row["key"] in seen_keys:
            raise ValueError(f"duplicate basket key: {row['key']}")
        if row["series_id"] in seen_series:
            raise ValueError(f"duplicate series_id: {row['series_id']}")
        seen_keys.add(row["key"])
        seen_series.add(row["series_id"])
    return items, history_years


def chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def bls_request(series_ids, start_year, end_year, api_key):
    """POST one batch to the BLS API. Raise on transport or API-level failure."""
    body = {"seriesid": series_ids, "startyear": str(start_year), "endyear": str(end_year)}
    if api_key:
        body["registrationkey"] = api_key
    req = urllib.request.Request(
        API_URL, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
    except urllib.error.URLError as exc:
        raise RuntimeError(f"BLS API transport error: {exc}") from exc

    if payload.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError(f"BLS API rejected request: {payload.get('status')} "
                           f"{payload.get('message')}")
    return {s["seriesID"]: s["data"] for s in payload["Results"]["series"]}


def to_records(raw):
    """Monthly, non-null observations as (pkey, period, value), oldest first.

    pkey = year*12 + (month-1), for exact month arithmetic.
    Skips the M13 annual average and any withheld ('-') values.
    """
    records = []
    for d in raw:
        period = d["period"]
        if not (period.startswith("M") and period != "M13"):
            continue
        value = d["value"].strip()
        if value in ("", "-"):
            continue
        month = int(period[1:])
        records.append({
            "pkey": int(d["year"]) * 12 + (month - 1),
            "period": f"{d['year']}-{period[1:]}",
            "period_name": f"{d['periodName']} {d['year']}",
            "value": round(float(value), 3),
        })
    records.sort(key=lambda r: r["pkey"])
    return records


def pct_change(now, then):
    if then in (None, 0):
        return None
    return round((now / then - 1) * 100, 1)


def build_item(row, records):
    """Assemble one output item. Latest must exist (precondition); MoM/YoY may be None."""
    if not records:
        raise RuntimeError(
            f"{row['key']} ({row['series_id']}): BLS returned no usable data. "
            f"Basket precondition violated — re-validate the series, do not patch around it."
        )
    by_pkey = {r["pkey"]: r for r in records}
    latest = records[-1]
    prior = by_pkey.get(latest["pkey"] - 1)
    year_ago = by_pkey.get(latest["pkey"] - 12)

    return {
        "key": row["key"],
        "label": row["label"],
        "unit": row["unit"],
        "category": row["category"],
        "geography": row["geography"],
        "geography_label": GEO_LABEL[row["geography"]],
        "series_id": row["series_id"],
        "latest": {"period": latest["period"], "period_name": latest["period_name"],
                   "value": latest["value"]},
        "prior_month_value": prior["value"] if prior else None,
        "year_ago_value": year_ago["value"] if year_ago else None,
        "change_mom_pct": pct_change(latest["value"], prior["value"] if prior else None),
        "change_yoy_pct": pct_change(latest["value"], year_ago["value"] if year_ago else None),
        "history": [{"period": r["period"], "value": r["value"]} for r in records],
    }


def main():
    items, history_years = load_basket(BASKET_PATH)
    api_key = os.environ.get("BLS_API_KEY", "").strip()
    batch_size = 50 if api_key else 25  # BLS per-query series cap

    end_year = datetime.now(timezone.utc).year
    start_year = end_year - history_years

    series_ids = [row["series_id"] for row in items]
    raw_by_series = {}
    for batch in chunked(series_ids, batch_size):
        raw_by_series.update(bls_request(batch, start_year, end_year, api_key))

    out_items = []
    for row in items:
        raw = raw_by_series.get(row["series_id"])
        if raw is None:
            raise RuntimeError(f"{row['key']}: series {row['series_id']} absent from BLS response")
        out_items.append(build_item(row, to_records(raw)))

    latest = max(out_items, key=lambda it: it["latest"]["period"])["latest"]
    document = {
        "meta": {
            "source": "U.S. Bureau of Labor Statistics — Average Price Data (AP)",
            "source_url": "https://www.bls.gov/cpi/data.htm",
            "midwest_region": MIDWEST_STATES,
            "latest_period": latest["period_name"],
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "note": ("Average retail prices. Items labeled 'U.S. city average' lack a current "
                     "Midwest regional breakout. Data lags roughly two months."),
            "used_api_key": bool(api_key),
        },
        "categories": list(dict.fromkeys(it["category"] for it in out_items)),
        "items": out_items,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH} — {len(out_items)} items, latest {latest['period_name']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
