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
EIA_URL = "https://api.eia.gov/v2/seriesid/"
BASKET_PATH = Path(__file__).parent / "basket.yaml"
OUT_PATH = Path(__file__).parent / "data" / "prices.json"

MIDWEST_STATES = ("Illinois, Indiana, Iowa, Kansas, Michigan, Minnesota, "
                  "Missouri, Nebraska, North Dakota, Ohio, South Dakota, Wisconsin")
REQUIRED_FIELDS = ("key", "label", "unit", "category", "geography", "series_id")
GEO_LABEL = {
    "midwest": "Midwest region",
    "us": "U.S. city average",
    "wisconsin": "Wisconsin",
    "padd2": "Midwest (PADD 2)",
}
SOURCES = ("bls", "eia")


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
        if row.get("source", "bls") not in SOURCES:
            raise ValueError(f"{row['key']}: bad source {row['source']!r} (expected one of {SOURCES})")
        if row["key"] in seen_keys:
            raise ValueError(f"duplicate basket key: {row['key']}")
        if row["series_id"] in seen_series:
            raise ValueError(f"duplicate series_id: {row['series_id']}")
        seen_keys.add(row["key"])
        seen_series.add(row["series_id"])

    context = doc["context"]          # required: powers real-$ + minutes-of-work
    market_basket = doc["market_basket"]
    item_keys = {row["key"] for row in items}
    for entry in market_basket["items"]:
        if entry["key"] not in item_keys:
            raise ValueError(f"market_basket references unknown item key: {entry['key']!r}")

    weekly_fuel = doc.get("weekly_fuel")  # optional near-real-time widget
    if weekly_fuel and weekly_fuel["geography"] not in GEO_LABEL:
        raise ValueError(f"weekly_fuel: bad geography {weekly_fuel['geography']!r}")
    return items, history_years, context, market_basket, weekly_fuel


def context_series_ids(context):
    """The auxiliary BLS series (CPI x2, earnings) fetched alongside the basket."""
    return [
        context["cpi"]["us"]["series_id"],
        context["cpi"]["midwest"]["series_id"],
        context["earnings"]["series_id"],
    ]


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


def eia_request(series_id, start, api_key):
    """Fetch one EIA series via the v2 /seriesid endpoint. Raise loudly.

    `start` is an EIA period string ("YYYY-MM" for monthly, "YYYY-MM-DD" for
    weekly). EIA requires a key on every call (no unauthenticated tier). One
    series per request — fine for our handful of energy items.
    """
    # The /seriesid endpoint returns the series with its value column already
    # included — keep params minimal (extra data[]/frequency facets can suppress
    # the value column). We bound history client-side in the parsers.
    url = f"{EIA_URL}{series_id}?api_key={api_key}&start={start}&length=5000"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        raise RuntimeError(f"EIA API error for {series_id}: HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"EIA API transport error for {series_id}: {exc}") from exc

    if "error" in payload:
        raise RuntimeError(f"EIA API rejected {series_id}: {payload['error']}")
    try:
        return payload["response"]["data"]
    except (KeyError, TypeError) as exc:
        raise RuntimeError(f"EIA API unexpected shape for {series_id}: {payload}") from exc


def _eia_value(d):
    """Pull the observation value from an EIA row, tolerant of the column name."""
    value = d.get("value")
    if value not in (None, ""):
        return value
    # Insurance: if the value column isn't named "value", take the first other
    # float-coercible field (seriesid rows carry little else).
    for k, v in d.items():
        if k in ("period", "value") or v in (None, ""):
            continue
        try:
            return float(v)
        except (TypeError, ValueError):
            continue
    return None


def eia_to_records(raw, value_factor=1.0, start_year=None):
    """EIA monthly observations as records, oldest first. Mirrors to_records().

    EIA gives period 'YYYY-MM' directly and a numeric value (or null).
    value_factor applies a documented unit conversion (e.g. natural gas $/Mcf ->
    $/therm). start_year bounds history client-side if the API ignores `start`.
    """
    records = []
    for d in raw:
        value = _eia_value(d)
        if value in (None, ""):
            continue
        parts = d.get("period", "").split("-")
        if len(parts) != 2:  # monthly only; skip anything else
            continue
        year, month = int(parts[0]), int(parts[1])
        if start_year is not None and year < start_year:
            continue
        records.append({
            "pkey": year * 12 + (month - 1),
            "period": f"{year}-{month:02d}",
            "period_name": datetime(year, month, 1).strftime("%B %Y"),
            "value": round(float(value) * value_factor, 3),
        })
    records.sort(key=lambda r: r["pkey"])
    return records


def eia_weekly_records(raw):
    """EIA weekly observations as records, oldest first.

    Weekly periods are full dates 'YYYY-MM-DD'. Each record carries the date and
    its ordinal (day count) for week/year arithmetic.
    """
    records = []
    for d in raw:
        value = _eia_value(d)
        if value in (None, ""):
            continue
        period = d.get("period", "")
        try:
            dt = datetime.strptime(period, "%Y-%m-%d")
        except ValueError:
            continue  # not a weekly date row
        records.append({
            "date": period,
            "ordinal": dt.toordinal(),
            "value": round(float(value), 3),
        })
    records.sort(key=lambda r: r["ordinal"])
    return records


def build_weekly_fuel(weekly_cfg, api_key, end_year):
    """The near-real-time weekly fuel widget data (EIA weekly retail prices)."""
    history_weeks = int(weekly_cfg.get("history_weeks", 78))
    geo = weekly_cfg["geography"]
    start = f"{end_year - 2}-01-01"  # ~2 years; trimmed to history_weeks below

    out = []
    for entry in weekly_cfg["items"]:
        records = eia_weekly_records(eia_request(entry["series_id"], start, api_key))
        if not records:
            raise RuntimeError(f"weekly_fuel {entry['key']} ({entry['series_id']}): "
                               f"EIA returned no usable data — re-validate the series")
        latest = records[-1]
        prior = records[-2] if len(records) > 1 else None
        # Year-ago = the observation closest to 364 days before latest.
        target = latest["ordinal"] - 364
        year_ago = min(records, key=lambda r: abs(r["ordinal"] - target))
        if abs(year_ago["ordinal"] - target) > 21:  # no point within 3 weeks
            year_ago = None

        out.append({
            "key": entry["key"],
            "label": entry["label"],
            "unit": entry["unit"],
            "geography": geo,
            "geography_label": GEO_LABEL[geo],
            "source": "eia",
            "series_id": entry["series_id"],
            "latest": {"date": latest["date"], "value": latest["value"]},
            "prior_week_value": prior["value"] if prior else None,
            "year_ago_value": year_ago["value"] if year_ago else None,
            "change_wow_pct": pct_change(latest["value"], prior["value"] if prior else None),
            "change_yoy_pct": pct_change(latest["value"], year_ago["value"] if year_ago else None),
            "history": [{"date": r["date"], "value": r["value"]} for r in records[-history_weeks:]],
        })

    return {
        "label": weekly_cfg.get("label", "Pump prices this week"),
        "geography_label": GEO_LABEL[geo],
        "latest_date": out[0]["latest"]["date"] if out else None,
        "items": out,
    }


def pct_change(now, then):
    if then in (None, 0):
        return None
    return round((now / then - 1) * 100, 1)


def build_item(row, records):
    """Assemble one output item. Latest must exist (precondition); MoM/YoY may be None."""
    if not records:
        raise RuntimeError(
            f"{row['key']} ({row['series_id']}): API returned no usable data. "
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
        "source": row.get("source", "bls"),
        "series_id": row["series_id"],
        "latest": {"period": latest["period"], "period_name": latest["period_name"],
                   "value": latest["value"]},
        "prior_month_value": prior["value"] if prior else None,
        "year_ago_value": year_ago["value"] if year_ago else None,
        "change_mom_pct": pct_change(latest["value"], prior["value"] if prior else None),
        "change_yoy_pct": pct_change(latest["value"], year_ago["value"] if year_ago else None),
        "history": [{"period": r["period"], "value": r["value"]} for r in records],
    }


def build_series(raw, series_id, label, extra=None):
    """A context series (CPI, earnings) as latest + monthly history. Fail if empty."""
    records = to_records(raw)
    if not records:
        raise RuntimeError(f"context series {series_id} returned no usable data — re-validate it")
    latest = records[-1]
    out = {
        "series_id": series_id,
        "label": label,
        "latest": {"period": latest["period"], "period_name": latest["period_name"],
                   "value": latest["value"]},
        "history": [{"period": r["period"], "value": r["value"]} for r in records],
    }
    if extra:
        out.update(extra)
    return out


def build_context(raw_by_series, context):
    cpi_us = context["cpi"]["us"]
    cpi_mw = context["cpi"]["midwest"]
    earn = context["earnings"]
    return {
        "cpi": {
            "us": build_series(raw_by_series[cpi_us["series_id"]], cpi_us["series_id"], cpi_us["label"]),
            "midwest": build_series(raw_by_series[cpi_mw["series_id"]], cpi_mw["series_id"], cpi_mw["label"]),
        },
        "earnings": build_series(
            raw_by_series[earn["series_id"]], earn["series_id"], earn["label"],
            extra={"unit": earn.get("unit", "per hour"),
                   "geography_label": earn.get("geography_label", "")},
        ),
    }


def build_market_basket(records_by_key, mb_cfg, items_by_key):
    """Sum a fixed editorial cart to a dollar total per month.

    Trend spans only months where EVERY cart item reports (no carry-forward,
    no zero-fill). Latest/MoM/YoY computed from that common set.
    """
    parts, period_by_pkey = [], {}
    for entry in mb_cfg["items"]:
        key, qty = entry["key"], float(entry["qty"])
        recs = records_by_key[key]
        by_pkey = {}
        for r in recs:
            by_pkey[r["pkey"]] = r["value"]
            period_by_pkey[r["pkey"]] = (r["period"], r["period_name"])
        item = items_by_key[key]
        parts.append({"key": key, "qty": qty, "label": item["label"],
                      "unit": item["unit"], "geography": item["geography"], "by_pkey": by_pkey})

    common = set(parts[0]["by_pkey"])
    for p in parts[1:]:
        common &= set(p["by_pkey"])
    if not common:
        raise RuntimeError("market_basket: no month where every cart item reports")

    totals = {pk: round(sum(p["qty"] * p["by_pkey"][pk] for p in parts), 2) for pk in common}
    pkeys = sorted(common)
    latest_pk = pkeys[-1]

    return {
        "label": mb_cfg.get("label", "Market basket"),
        "unit": "cart total",
        "components": [{"key": p["key"], "label": p["label"], "qty": p["qty"],
                        "unit": p["unit"], "geography": p["geography"]} for p in parts],
        "latest": {"period": period_by_pkey[latest_pk][0],
                   "period_name": period_by_pkey[latest_pk][1], "value": totals[latest_pk]},
        "prior_month_value": totals.get(latest_pk - 1),
        "year_ago_value": totals.get(latest_pk - 12),
        "change_mom_pct": pct_change(totals[latest_pk], totals.get(latest_pk - 1)),
        "change_yoy_pct": pct_change(totals[latest_pk], totals.get(latest_pk - 12)),
        "history": [{"period": period_by_pkey[pk][0], "value": totals[pk]} for pk in pkeys],
    }


def build_summary(market_basket, out_items):
    """One newsroom-ready sentence summarizing the latest month."""
    mb = market_basket
    cost = f"${mb['latest']['value']:.2f}"
    when = mb["latest"]["period_name"]
    yoy = mb["change_yoy_pct"]
    if yoy is None:
        lead = f"The {mb['label'].lower()} costs {cost} in {when}."
    elif abs(yoy) < 0.05:
        lead = f"The {mb['label'].lower()} costs {cost} in {when}, little changed from a year ago."
    else:
        move = "up" if yoy > 0 else "down"
        lead = f"The {mb['label'].lower()} costs {cost} in {when}, {move} {abs(yoy)}% from a year ago."

    movers = [it for it in out_items if it["change_yoy_pct"] is not None]
    if not movers:
        return lead
    up = max(movers, key=lambda it: it["change_yoy_pct"])
    down = min(movers, key=lambda it: it["change_yoy_pct"])
    up_txt = f"{up['label']} rose the most over the year (+{up['change_yoy_pct']}%)"
    if down["change_yoy_pct"] < 0:
        down_txt = f"{down['label']} fell the most ({down['change_yoy_pct']}%)"
    else:
        down_txt = f"{down['label']} rose the least (+{down['change_yoy_pct']}%)"
    return f"{lead} {up_txt}; {down_txt}."


def main():
    items, history_years, context, market_basket, weekly_fuel = load_basket(BASKET_PATH)
    api_key = os.environ.get("BLS_API_KEY", "").strip()
    batch_size = 50 if api_key else 25  # BLS per-query series cap

    end_year = datetime.now(timezone.utc).year
    start_year = end_year - history_years

    # BLS items + the CPI/earnings context all come from the BLS batch API.
    bls_series = ([row["series_id"] for row in items if row.get("source", "bls") == "bls"]
                  + context_series_ids(context))
    raw_by_series = {}
    for batch in chunked(bls_series, batch_size):
        raw_by_series.update(bls_request(batch, start_year, end_year, api_key))

    # EIA items (energy) come from the EIA API — one series per call, key required.
    eia_rows = [row for row in items if row.get("source") == "eia"]
    eia_key = os.environ.get("EIA_API_KEY", "").strip()
    if eia_rows and not eia_key:
        raise RuntimeError("basket has EIA items but EIA_API_KEY is not set")

    out_items, records_by_key = [], {}
    for row in items:
        if row.get("source") == "eia":
            raw = eia_request(row["series_id"], f"{start_year}-01", eia_key)
            records = eia_to_records(raw, float(row.get("value_factor", 1.0)), start_year)
        else:
            raw = raw_by_series.get(row["series_id"])
            if raw is None:
                raise RuntimeError(f"{row['key']}: series {row['series_id']} absent from BLS response")
            records = to_records(raw)
        records_by_key[row["key"]] = records
        out_items.append(build_item(row, records))

    items_by_key = {row["key"]: row for row in items}
    ctx = build_context(raw_by_series, context)
    mb = build_market_basket(records_by_key, market_basket, items_by_key)
    summary = build_summary(mb, out_items)
    weekly = build_weekly_fuel(weekly_fuel, eia_key, end_year) if weekly_fuel else None

    latest = max(out_items, key=lambda it: it["latest"]["period"])["latest"]
    document = {
        "meta": {
            "source": "U.S. Bureau of Labor Statistics (food, CPI, earnings) & "
                      "U.S. Energy Information Administration (energy)",
            "source_url": "https://www.bls.gov/cpi/data.htm",
            "source_url_energy": "https://www.eia.gov/opendata/",
            "midwest_region": MIDWEST_STATES,
            "latest_period": latest["period_name"],
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "note": ("Average retail prices. Food from BLS Average Price Data; energy from EIA "
                     "(Wisconsin electricity & natural gas, Midwest/PADD 2 motor fuels). Items "
                     "labeled 'U.S. city average' lack a current regional breakout. "
                     "Data lags roughly two months."),
            "used_api_key": bool(api_key),
        },
        "summary": summary,
        "categories": list(dict.fromkeys(it["category"] for it in out_items)),
        "items": out_items,
        "market_basket": mb,
        "context": ctx,
        "weekly_fuel": weekly,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH} — {len(out_items)} items + market basket + context, "
          f"latest {latest['period_name']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
