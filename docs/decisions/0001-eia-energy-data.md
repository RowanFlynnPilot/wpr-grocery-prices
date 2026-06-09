# ADR 0001 — Adding EIA as a second energy data source

*ADR = Architecture Decision Record: a short, dated record of one significant
technical choice and the reasoning behind it.*

- **Status:** Accepted (2026-06-09) — phase 1 + phase 2 implemented
- **Date:** 2026-06-09
- **Deciders:** WPR maintainer
- **Affects:** `fetch.py`, `basket.yaml`, the output contract, the Energy section
  of the frontend, CI (continuous-integration / GitHub Actions) secrets
- **Rough effort:** phase 1 ≈ half a day; phase 2 (weekly fuel) ≈ half a day more

---

## 1. Summary

We are considering pulling some or all **energy** prices from the U.S. Energy
Information Administration (**EIA**) Open Data API instead of (or alongside) the
BLS Average Price (AP) series we use today. EIA offers two things BLS does not:
**Wisconsin-specific** electricity and natural-gas prices, and (separately)
**near-real-time weekly gasoline/diesel**. The recommendation below delivers the
Wisconsin granularity first and treats weekly fuel as an optional later phase, so
be aware the "weekly" headline is *not* part of the recommended first step.

The catch is architectural, not ethical: EIA is a clean, public-domain
government API and fully respects the project's "API client, never a scraper"
guardrail — but adding it makes this a **two-source** pipeline, which stresses
the "one authoritative source / one correct path" principle in `CLAUDE.md`. This
doc lays out the options and recommends a path that keeps that principle intact.

**This is not a scraper, a brand/store price feed, or a "supplemental" data
hack.** Those remain out of scope per the hard guardrail. EIA is the same *kind*
of source as BLS: a free, public-domain federal statistics API.

---

## 2. Background: what we have today

The Energy category is four BLS AP series, all Midwest region (`area 0200`),
monthly, with the usual ~2-month publication lag:

| Item | Unit | BLS series | Geography |
|---|---|---|---|
| Electricity | per KWH | `APU020072610` | Midwest region |
| Utility (piped) gas | per therm | `APU020072620` | Midwest region |
| Gasoline, unleaded regular | per gallon | `APU020074714` | Midwest region |
| Diesel fuel | per gallon | `APU020074717` | Midwest region |

These work and are consistent with the food basket (same API, same cadence, same
geography model). Their limitations:

- **Latency.** Gasoline moves daily but BLS reports it monthly, ~2 months late.
  In a cost-of-living widget, "April gas prices in mid-June" is stale for the one
  item readers check most often.
- **Geography.** "Midwest region" is 12 states. For a Wausau audience,
  Wisconsin-specific electricity and natural gas would be more relevant — and
  more honest than a regional average labeled as if it were local.

## 3. What EIA offers (validated 2026-06-09)

EIA Open Data API v2 (`https://api.eia.gov/v2/...`). All data is U.S. government
**public domain**.

| Candidate | Frequency | Geography | Unit | Route / facets |
|---|---|---|---|---|
| Regular gasoline retail | **weekly** & monthly | Midwest (PADD 2) | $/gal | `petroleum/pri/gnd`, `duoarea=R20`, regular grade |
| No. 2 diesel retail | **weekly** & monthly | Midwest (PADD 2) | $/gal | `petroleum/pri/gnd`, `duoarea=R20` |
| Electricity retail price | monthly | **Wisconsin** | ¢/kWh | `electricity/retail-sales`, `stateid=WI`, `sectorid=RES` |
| Natural gas, residential | monthly | **Wisconsin** | **$/Mcf** | `natural-gas/pri/sum`, Wisconsin, residential |

Key operational facts:

- **An API key is required on every call** — there is no unauthenticated tier
  (unlike BLS, which we currently run keyless-capable). Free, instant
  registration; rate limit ~5,000 requests/hour. → **one new CI secret,
  `EIA_API_KEY`.**
- **PADD = Petroleum Administration for Defense District**, EIA's fuel-reporting
  geography. **PADD 2 = EIA's "Midwest"** and is *broader* than the BLS 12-state
  Midwest: it is IL, IN, IA, KS, **KY**, MI, MN, MO, NE, ND, OH, **OK**, SD,
  **TN**, WI — i.e. the same 12 plus Kentucky, Oklahoma, and Tennessee (15
  states, reaching well south of Wausau). So "Midwest (PADD 2)" is honest but not
  interchangeable with our existing "Midwest region" label.
- Natural gas residential price is **$/Mcf** (dollars per thousand cubic feet),
  **not** per-therm like our BLS utility-gas item. Comparing the two requires a
  conversion (~1 Mcf ≈ 10.37 therms) — i.e. they are not the same series wearing
  different labels.
- **History depth & lag:** EIA series run back decades — far more than the
  3-year window our sparklines need. Monthly electricity and natural-gas prices
  carry roughly the same ~2-month publication lag as BLS; weekly fuel lags only
  days. So phase 1 buys *geography*, not *timeliness*; phase 2 buys timeliness.

## 4. The constraint this decision turns on

`CLAUDE.md` is explicit:

> **One correct path, no fallbacks.** Each basket item declares exactly one
> authoritative `series_id`… There is no runtime US→Midwest substitution.

and

> **HARD GUARDRAIL: this is an API client, never a scraper.** Do not add a
> scraper, a headless browser, proxies, or any "supplemental" source.

EIA passes the guardrail (it's an API client against a public-domain federal
source). What it tests is the *single-source* design: today, "the basket config
*is* the series map" and every item is a BLS series. Introducing EIA means
`fetch.py` must know **which provider** a given item comes from, and the
two-tier geography model (`midwest` / `us`) likely needs a third value
(`wisconsin`).

The recommendation below is chosen specifically so that **"one authoritative
series per item" still holds** — each item keeps exactly one declared series; we
only add *which API to ask*.

## 5. Options

### Option A — Do nothing (status quo)
Keep all four energy items on BLS.
- **Pros:** zero new code, secrets, or sources; perfectly consistent contract.
- **Cons:** keeps the staleness and the 12-state geography for the items readers
  care about most. Leaves an obvious improvement on the table.

### Option B — Add EIA items *alongside* BLS (parallel)
Keep BLS energy; add new EIA items (e.g. "Gasoline, Wisconsin (weekly)") as
additional cards/section.
- **Pros:** non-destructive; lets readers compare; nothing removed.
- **Cons:** two cards for "gasoline" with different geographies/cadences is
  confusing and arguably violates the spirit of "one authoritative series per
  item." Clutters the Energy section. Mixed cadences in one view.

### Option C — Migrate the Energy category to EIA (recommended shape)
Energy items declare an EIA series instead of BLS; food stays BLS. Introduce a
per-item `source: bls | eia` field and route in `fetch.py`. Geography gains a
`wisconsin` tier where applicable.
- **Pros:** keeps **exactly one series per item**; cleanly separates "who owns
  energy" (EIA) from "who owns food" (BLS); unlocks Wisconsin granularity; the
  frontend already renders a generic `geography_label`, so a new "Wisconsin"
  label needs no special-casing.
- **Cons:** real work (a second client path, key, geography/unit handling);
  natural-gas unit change (per-therm → $/Mcf) is a visible change to readers;
  weekly-vs-monthly cadence must be resolved (see §6).

### Option D — Cherry-pick only where EIA clearly wins
Move just gasoline + diesel to EIA (timeliness win); leave electricity and
natural gas on BLS Midwest (avoids the unit change and a third geography tier).
- **Pros:** smallest change that captures the biggest benefit (fresh fuel
  prices); no NG unit change; keeps geography two-tier.
- **Cons:** the Energy section is now split across two providers for no
  reader-visible reason; "some energy is EIA, some is BLS" is harder to explain
  than "energy is EIA, food is BLS."

## 6. Decision points to resolve (regardless of option)

1. **Cadence.** EIA gasoline/diesel are *weekly*. Our contract is monthly
   (history, MoM/YoY — month-over-month / year-over-year — and sparklines all
   assume one point per month).
   - **Recommended:** for phase 1, pull EIA at **monthly** frequency so the
     contract is unchanged and the Energy cards stay consistent with food.
     Treat **weekly gas as a phase-2 enhancement** (its own near-real-time
     widget with a weekly cron), not a retrofit into the monthly grid.
2. **Geography labeling.** PADD 2 ≠ the BLS 12-state Midwest, and Wisconsin is
   neither. The two-tier honesty rule must extend: add a `wisconsin` geography
   (label "Wisconsin") and, for fuel, label PADD 2 honestly (e.g. "Midwest
   (PADD 2)"). The frontend's geography badge is already data-driven, so this is
   mostly a label + a CSS color.
3. **Natural-gas unit.** If electricity/NG move to EIA, NG becomes $/Mcf.
   - **Recommended:** **convert to per-therm** in `fetch.py` (÷ 10.37, factor
     declared in `basket.yaml` and documented) so the item's history stays
     comparable to the BLS per-therm series we're replacing and to how readers
     already see gas billed. Alternative: relabel honestly as $/Mcf (more
     transparent, but breaks trend continuity and is a less familiar unit). Do
     **not** silently mix units either way.
4. **"Fail fast" per source.** Keep the existing behavior: a declared EIA series
   that returns no current data raises and exits non-zero, same as BLS. No
   cross-source fallback (no "if EIA gas is missing, use BLS gas").
5. **Secret management.** Add `EIA_API_KEY` to the repo secrets and to the
   `update.yml` workflow env, mirroring `BLS_API_KEY`.

## 7. Recommendation

**Option C, phased**, with monthly cadence in phase 1:

- **Phase 1:** Add a `source` field per basket item (`bls` default). Move the
  four Energy items to EIA at **monthly** frequency: gasoline + diesel to
  Midwest/PADD 2, electricity + natural gas to **Wisconsin**. Add the
  `wisconsin` geography tier and honest PADD-2 labels. Convert NG to per-therm
  (or relabel). Add `EIA_API_KEY`. Contract and frontend change only at the
  margins (new geography label, possibly an NG unit note).
- **Phase 2 (optional, later):** a dedicated **weekly** gasoline/diesel module
  with its own cadence and a weekly cron — the real "near-real-time" payoff —
  surfaced as a distinct element so it never confuses the monthly grid.

Rationale: this captures EIA's two genuine wins (Wisconsin granularity now,
weekly fuel later) while preserving the project's core invariants — one declared
series per item, fail-fast per source, no fallbacks, and explicit geography
honesty. It cleanly assigns ownership (EIA = energy, BLS = food) rather than
interleaving providers for no reader-visible reason.

## 8. Consequences

**If we proceed (Option C):**
- `fetch.py` gains a small provider-routing layer (`bls_request` vs
  `eia_request` + an EIA parser); `build_item` stays source-agnostic.
- `basket.yaml` energy rows gain `source: eia` and EIA series IDs; geography gains
  `wisconsin`.
- One new CI secret. The monthly cron timing (16th) still works; EIA monthly data
  also lags, so no schedule change in phase 1.
- Readers get Wisconsin electricity/gas and (phase 2) weekly fuel. The NG unit
  and the PADD-2/Wisconsin labels are visible changes to call out in an editor's
  note.
- **Failure mode & rollback.** Per the no-fallback rule, a declared EIA series
  that stops returning data hard-fails the whole monthly run (same as BLS today).
  Mitigation is unchanged: validate any series change before committing, and the
  `workflow_dispatch` manual trigger lets us re-run after a fix. Rollback is a
  one-line revert — flip the affected item's `source` back to `bls` with its old
  series ID. Because the old BLS energy series keep publishing, that revert is
  always available.

**If we don't (Option A):**
- No new moving parts; energy stays regional and ~2 months stale.

## 9. Out of scope (unchanged)

- No scraping, headless browsers, proxies, or store/brand shelf prices — ever.
- No EIA for food (BLS AP remains the food source).
- No runtime cross-source fallback.

## 10. Open questions for the maintainer

1. Is Wisconsin-specific electricity/natural gas worth the natural-gas unit
   change ($/Mcf → per-therm, or relabel)? Or keep electricity/NG on BLS
   Midwest and only move fuel to EIA (Option D)?
2. Is weekly fuel (phase 2) a priority, or is monthly-but-Wisconsin enough?
3. Comfortable adding and rotating one more free API key (`EIA_API_KEY`)?

## Decision log

**2026-06-09 — Accepted, Option C phase 1.** Maintainer confirmed: monthly
cadence is fine (no weekly phase 2 for now), Midwest/PADD-2 fuel is acceptable
(matches the regional approach used elsewhere), and `EIA_API_KEY` is already
registered and added as a repo secret. Implemented:
- `source: bls | eia` per item; EIA path via the `/v2/seriesid` endpoint.
- Energy → EIA monthly: electricity + natural gas (`wisconsin`), gasoline +
  diesel (`padd2`). Natural gas converted $/Mcf → $/therm (`value_factor` ÷10.37).
- New geography labels "Wisconsin" and "Midwest (PADD 2)"; colophon + CLAUDE.md
  updated. `EIA_API_KEY` wired into `update.yml`.
- Validated against the live EIA API via a `workflow_dispatch` run of "Update
  prices" (key is server-side; never handled locally).

**2026-06-09 — Phase 2 implemented (weekly fuel).** Added a distinct
`weekly_fuel` widget from EIA weekly retail series (`…_R20_DPG.W`, PADD 2) for
gasoline and diesel — latest week + WoW/YoY + sparkline, always nominal, kept
separate from the monthly Energy grid. Added a Tuesday cron to "Update prices"
(EIA posts weekly prices Mondays). The monthly cards remain for trend/YoY and the
inflation toggle.

## Appendix — validated endpoints

- Catalog & docs: https://www.eia.gov/opendata/documentation.php
- Key registration: https://www.eia.gov/opendata/register.php
- Gasoline/diesel (PADD 2): https://www.eia.gov/dnav/pet/pet_pri_gnd_dcus_r20_w.htm
- Wisconsin natural gas (residential): https://www.eia.gov/dnav/ng/ng_pri_sum_dcu_swi_a.htm
- Wisconsin electricity profile: https://www.eia.gov/electricity/state/wisconsin/
- Confirmed 2026-06-09: EIA v2 returns `API_KEY_MISSING` without a key (no
  unauthenticated tier).
