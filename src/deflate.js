// Inflation adjustment ("real dollars"). Deflate a nominal price history to the
// latest period's dollars using a CPI series:  real = nominal * cpiLatest / cpi.
// The two-tier geography rule applies here too — Midwest items are deflated by
// Midwest CPI, U.S.-average items by U.S. CPI (see CLAUDE.md).

function pkeyOf(period) {
  const [y, m] = period.split('-').map(Number)
  return y * 12 + (m - 1)
}

function pct(now, then) {
  if (then == null || then === 0) return null
  return Math.round((now / then - 1) * 1000) / 10
}

// Pre-index a CPI context series into { map: {period: value}, latest }.
export function cpiIndex(cpiSeries) {
  const map = {}
  for (const h of cpiSeries.history) map[h.period] = h.value
  return { map, latest: cpiSeries.latest.value }
}

function deflateHistory(history, idx) {
  return history.map((h) => {
    const c = idx.map[h.period]
    if (c == null) return h // no CPI for this month — leave nominal, don't fake it
    return { period: h.period, value: Math.round((h.value * idx.latest) / c * 1000) / 1000 }
  })
}

// Recompute the prior/year-ago/change fields from a (possibly deflated) history.
function recompute(history) {
  const byPk = {}
  for (const h of history) byPk[pkeyOf(h.period)] = h.value
  const latestPk = Math.max(...Object.keys(byPk).map(Number))
  const latest = byPk[latestPk]
  const prior = byPk[latestPk - 1]
  const yearAgo = byPk[latestPk - 12]
  return {
    prior_month_value: prior ?? null,
    year_ago_value: yearAgo ?? null,
    change_mom_pct: prior == null ? null : pct(latest, prior),
    change_yoy_pct: yearAgo == null ? null : pct(latest, yearAgo),
  }
}

// Real-dollar version of one item. latest.value is unchanged (deflating the
// latest month to itself is a no-op), so only history + derived fields change.
export function toReal(item, idxUs, idxMw) {
  const idx = item.geography === 'midwest' ? idxMw : idxUs
  if (!idx) return item
  const history = deflateHistory(item.history, idx)
  return { ...item, history, ...recompute(history) }
}

// Real-dollar version of the market basket. The cart mixes geographies, so the
// headline total is deflated by U.S. (all-items) CPI as a national proxy.
export function toRealBasket(basket, idxUs) {
  if (!basket || !idxUs) return basket
  const history = deflateHistory(basket.history, idxUs)
  return {
    ...basket,
    history,
    latest: { ...basket.latest, value: history[history.length - 1].value },
    ...recompute(history),
  }
}
