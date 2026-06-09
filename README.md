# wpr-grocery-prices

Midwest grocery & energy price tracker for Wausau Pilot & Review, built on the
U.S. Bureau of Labor Statistics **Average Price Data (AP)** API. A fixed
editorial basket is pulled monthly and written to `data/prices.json` for the
React frontend.

It tracks **regional average prices over time** (a cost-of-living view) — not
store-level or brand-level shelf prices. See `CLAUDE.md` for why, and for the
engineering contract.

## Run the data pipeline
```powershell
pip install pyyaml
python fetch.py        # -> data/prices.json
```
Set `BLS_API_KEY` (free) for higher limits and a single-query pull.

## Run the frontend
```powershell
npm install
npm run dev            # local dev server (http://localhost:5173)
npm run build          # production build -> dist/
npm run preview        # serve the production build locally
```
The frontend is React + Vite. It renders `data/prices.json`:

- **Category sections** in `meta.categories` order
- A **Biggest movers** panel up top, sorted by `abs(change_yoy_pct)`
- **Per-item cards**: latest price + unit, MoM/YoY chips, a sparkline from
  `history`, and the **geography label** shown as a first-class element
  (Midwest region vs U.S. city average — never hidden; see `CLAUDE.md`)

`vite.config.js` sets `publicDir: 'data'`, so the canonical `data/prices.json`
is copied verbatim into the build as `/prices.json` — there is no second copy to
keep in sync. `base: './'` keeps all paths relative so one build works both on a
GitHub Pages subpath and inside the WordPress iframe.

## Deploy (GitHub Pages)
`.github/workflows/deploy.yml` builds and publishes to Pages on every push to
`main`. Because the monthly **Update prices** workflow commits the refreshed
`data/prices.json` to `main`, a data refresh redeploys the site automatically.
One-time setup: repo **Settings → Pages → Build and deployment → Source =
GitHub Actions**.

## Embed in WordPress
Drop an iframe pointing at the Pages URL into a Custom HTML block:
```html
<iframe id="wpr-prices" src="https://<user>.github.io/wpr-grocery-prices/"
        style="width:100%;border:0" height="2000" loading="lazy"
        title="Midwest grocery & energy prices"></iframe>
<script>
  // The widget posts its content height; resize the iframe to match so there's
  // no inner scrollbar.
  addEventListener('message', function (e) {
    if (e.data && e.data.type === 'wpr-prices:height') {
      document.getElementById('wpr-prices').style.height = e.data.height + 'px';
    }
  });
</script>
```

## Layout
- `basket.yaml` — the tracked items + validated BLS series IDs (edit here)
- `fetch.py` — the pipeline (API client; never a scraper)
- `data/prices.json` — generated output, the frontend's only input
- `index.html`, `src/`, `vite.config.js` — the React/Vite frontend
- `.github/workflows/update.yml` — monthly data refresh + commit
- `.github/workflows/deploy.yml` — build + publish to GitHub Pages

## Status
- [x] Basket validated against the live API (28 items: 21 Midwest, 7 U.S. avg)
- [x] Pipeline emitting `data/prices.json`
- [x] Monthly GitHub Actions cron
- [x] React/Vite frontend (movers panel, category sections, cards, sparklines)
- [x] GitHub Pages deploy workflow + WordPress iframe embed
