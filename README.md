# wpr-grocery-prices

Midwest grocery & energy price tracker for Wausau Pilot & Review, built on the
U.S. Bureau of Labor Statistics **Average Price Data (AP)** API. A fixed
editorial basket is pulled monthly and written to `data/prices.json` for the
React frontend.

It tracks **regional average prices over time** (a cost-of-living view) — not
store-level or brand-level shelf prices. See `CLAUDE.md` for why, and for the
engineering contract.

## Run
```powershell
pip install pyyaml
python fetch.py        # -> data/prices.json
```
Set `BLS_API_KEY` (free) for higher limits and a single-query pull.

## Layout
- `basket.yaml` — the tracked items + validated BLS series IDs (edit here)
- `fetch.py` — the pipeline (API client; never a scraper)
- `data/prices.json` — generated output, the frontend's only input
- `.github/workflows/update.yml` — monthly refresh + commit

## Status
- [x] Basket validated against the live API (28 items: 21 Midwest, 7 U.S. avg)
- [x] Pipeline emitting `data/prices.json`
- [x] Monthly GitHub Actions cron
- [ ] React/Vite frontend (next)
