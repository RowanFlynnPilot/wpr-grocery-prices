# CLAUDE.md — wpr-grocery-prices

## What this is
A monthly **Midwest grocery & energy price tracker** for Wausau Pilot & Review.
It pulls a fixed editorial basket from the U.S. Bureau of Labor Statistics
**Average Price Data (AP)** API and emits one static JSON file the React
frontend renders. It is a cost-of-living tracker, not a store/brand price
comparison — BLS publishes regional averages, not shelf prices.

Pipeline: `BLS API -> fetch.py -> data/prices.json -> React/Vite -> GitHub Pages -> WP iframe`

## HARD GUARDRAIL: this is an API client, never a scraper
The whole reason we chose BLS over Open Prices, MealMe, or scraping a grocer is
that the data is public-domain, free, current, and carries zero ToS or
collection burden. **Do not add a scraper, a headless browser, proxies, or any
"supplemental" source.** If someone wants store-level or brand-level prices,
that is a different project with a different (and much harder) data story — say
so, don't bolt it on here.

## Design principles (same as every WPR repo)
- **One correct path, no fallbacks.** Each basket item declares exactly one
  authoritative `series_id`. There is no runtime US->Midwest substitution. If a
  declared series stops returning current data, `fetch.py` raises — we fix the
  basket on purpose, in `basket.yaml`, after re-validating.
- **Fail fast and loud.** Bad API status, a missing series, or an item with zero
  usable observations all raise and exit non-zero. A green run means every
  declared series delivered.
- **Single responsibility.** `load_basket` validates, `bls_request` talks to the
  API, `to_records` parses, `build_item` computes, `main` assembles. No god
  functions.
- **No overengineering.** stdlib + PyYAML. No caching layer, no retry storm, no
  ORM. The basket config *is* the series map.

## The two-tier geography rule
BLS area `0200` = the 12-state Midwest region; `0000` = U.S. city average.
The Midwest breakout is uneven, so the basket is split by evidence (validated
2026-06-08):
- **21 items have current Midwest data** (meat, most produce, beer/wine,
  potato chips, white bread, and all energy).
- **7 fall back to U.S. city average** because Midwest is missing or stale:
  eggs, milk, cheddar, flour, rice, coffee, sugar.

Every item carries `geography` + `geography_label`. **The frontend must show that
label** ("Midwest region" vs "U.S. city average") so a reader is never misled
about which geography a number represents. That labeling is the editorial
honesty of the whole widget — do not hide it.

## Output contract (`data/prices.json`)
```
meta:        source, source_url, midwest_region, latest_period,
             generated_utc, note, used_api_key
categories:  ordered category names (render sections in this order)
items[]:     key, label, unit, category, geography, geography_label, series_id,
             latest{period, period_name, value},
             prior_month_value, year_ago_value,
             change_mom_pct, change_yoy_pct,        # may be null on a data gap
             history[]{period, value}               # monthly, oldest-first, for charts
```
Cards: `latest.value` + `unit`, MoM/YoY chips, geography label, sparkline from
`history`. A "biggest movers" panel = sort items by `abs(change_yoy_pct)`.

## Run it
```powershell
pip install pyyaml
python fetch.py            # writes data/prices.json
```
Optional: set `BLS_API_KEY` (free at https://data.bls.gov/registrationEngine/)
for 50 series/query, 500/day, and deeper history. Without it the basket still
fits in one query well under the unregistered 25-series cap... it doesn't:
28 items > 25, so `fetch.py` auto-splits into two unregistered queries. A key
collapses it to one and is the right move for the Action.

## Gotchas (learned the hard way)
- **Energy item codes are 5 chars, food codes are 6** (`74714` not `074714`).
  Series IDs are stored whole in `basket.yaml` precisely so nobody rebuilds them
  by string concat and reintroduces this bug.
- **Skip the M13 annual average.** AP series include a yearly mean as period
  `M13`; `to_records` filters it so it never pollutes the monthly trend.
- **Withheld months come back as `"-"`** — treated as null, not zero.
- **~2-month lag.** April data publishes in mid-June. The monthly cron runs on
  the 16th to land after the CPI/AP release.
- **eggs/milk/coffee** are the items most likely to flip geography on a future
  BLS revision — they're the ones to recheck if a run starts failing.
