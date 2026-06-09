# CLAUDE.md — wpr-grocery-prices

## What this is
A monthly **Midwest grocery & energy price tracker** for Wausau Pilot & Review.
It pulls a fixed editorial basket from the U.S. Bureau of Labor Statistics
**Average Price Data (AP)** API and emits one static JSON file the React
frontend renders. It is a cost-of-living tracker, not a store/brand price
comparison — BLS publishes regional averages, not shelf prices.

Pipeline: `BLS API + EIA API -> fetch.py -> data/prices.json -> React/Vite -> GitHub Pages -> WP iframe`

Food, CPI, and wages come from BLS; **energy comes from EIA** (added 2026-06-09,
see `docs/decisions/0001-eia-energy-data.md`). Both are free, public-domain
federal statistics APIs — this stays an API client, not a scraper.

## HARD GUARDRAIL: this is an API client, never a scraper
The whole reason we chose BLS over Open Prices, MealMe, or scraping a grocer is
that the data is public-domain, free, current, and carries zero ToS or
collection burden. **Do not add a scraper, a headless browser, proxies, or any
"supplemental" source.** If someone wants store-level or brand-level prices,
that is a different project with a different (and much harder) data story — say
so, don't bolt it on here.

EIA was added for energy because it is the *same kind* of source: a free,
public-domain federal API. That's the only bar a new source clears — it does not
open the door to scraping or commercial feeds.

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

## The geography rule (now four tiers, two sources)
Each item declares one `geography`; `fetch.py` maps it to a `geography_label`:
- **`midwest`** — BLS area `0200`, the 12-state Midwest region (most BLS food).
- **`us`** — BLS area `0000`, U.S. city average (7 food items whose Midwest
  breakout is missing/stale: eggs, milk, cheddar, flour, rice, coffee, sugar).
- **`wisconsin`** — EIA Wisconsin series (electricity, natural gas).
- **`padd2`** — EIA's "Midwest (PADD 2)" petroleum region (gasoline, diesel).
  Note PADD 2 is **15 states** (the BLS 12 + KY, OK, TN) — broader than `midwest`,
  which is exactly why it gets its own honest label rather than reusing it.

Every item carries `geography` + `geography_label`, and now `source` (`bls`|`eia`).
**The frontend must show the geography label** so a reader is never misled about
which geography (or which agency's methodology) a number represents. That
labeling is the editorial honesty of the whole widget — do not hide it.

`source` selects the API path in `fetch.py`: BLS items batch through the BLS API;
EIA items hit the EIA `/v2/seriesid` endpoint one at a time. Still one
authoritative series per item, still fail-fast, still no cross-source fallback.

## Output contract (`data/prices.json`)
```
meta:          source, source_url, midwest_region, latest_period,
               generated_utc, note, used_api_key
summary:       one auto-generated newsroom sentence (basket cost + top movers)
categories:    ordered category names (render sections in this order)
items[]:       key, label, unit, category, geography, geography_label,
               source (bls|eia), series_id,
               latest{period, period_name, value},
               prior_month_value, year_ago_value,
               change_mom_pct, change_yoy_pct,      # may be null on a data gap
               history[]{period, value}             # monthly, oldest-first, for charts
market_basket: label, unit, components[]{key,label,qty,unit,geography},
               latest{period,period_name,value}, prior_month_value,
               year_ago_value, change_mom_pct, change_yoy_pct,
               history[]{period,value}              # months where EVERY item reports
context:       cpi{ us, midwest }, earnings           # auxiliary BLS series
               each: series_id, label, latest{period,period_name,value}, history[]
               earnings also carries unit ("per hour")
```
Cards: `latest.value` + `unit`, MoM/YoY chips, geography label, sparkline from
`history`. A "biggest movers" panel = sort items by `abs(change_yoy_pct)`.

**Derived views (frontend):**
- **Inflation-adjusted ("real $")** = deflate each item's `history` by a
  `context.cpi` series to the latest period's dollars
  (`real = nominal * cpi_latest / cpi_period`). `midwest` items use Midwest CPI;
  everything else (`us`, `wisconsin`, `padd2`) uses U.S. CPI (we don't pull a
  Wisconsin CPI). The basket total deflates by U.S. CPI.
- **Minutes of work** = `latest.value / context.earnings.latest.value * 60`.
  Always a current-dollar snapshot (not affected by the real/nominal toggle).
- **Market basket** renders as a headline hero (cost + MoM/YoY + sparkline);
  it mixes geographies by design — say so in the UI.

## Run it
```powershell
pip install pyyaml
python fetch.py            # writes data/prices.json
```
`EIA_API_KEY` is **required** (energy items): EIA has no unauthenticated tier.
Free at https://www.eia.gov/opendata/register.php. `fetch.py` raises if EIA
items are present and the key is unset.

`BLS_API_KEY` is optional but recommended (50 series/query, 500/day, deeper
history). Without it `fetch.py` auto-splits the BLS series into unregistered
25-series queries. Both keys are repo secrets, consumed by `update.yml`.

## Gotchas (learned the hard way)
- **Energy is EIA now, not BLS.** The old BLS energy series (`APU0200726…`,
  `APU020074714`, etc.) are retired from the basket. EIA series IDs are stored
  whole in `basket.yaml`. EIA natural gas reports **$/Mcf**, converted to
  **$/therm** via `value_factor` (÷10.37) so the trend stays comparable.
- **For remaining BLS food: item codes are 6 chars** (e.g. `074714`-style). Store
  series IDs whole so nobody rebuilds them by string concat.
- **Skip the M13 annual average.** AP series include a yearly mean as period
  `M13`; `to_records` filters it so it never pollutes the monthly trend.
- **Withheld months come back as `"-"`** — treated as null, not zero.
- **~2-month lag.** April data publishes in mid-June. The monthly cron runs on
  the 16th to land after the CPI/AP release.
- **eggs/milk/coffee** are the items most likely to flip geography on a future
  BLS revision — they're the ones to recheck if a run starts failing.
