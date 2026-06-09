// Number + label formatting for the price cards. Kept in one place so the
// money/percent rules are applied identically everywhere (cards + movers panel).

// Sub-dollar items (electricity per KWH, bananas, flour, gas per therm) carry
// meaningful tenths-of-a-cent, so show 3 decimals; dollar-and-up items read
// cleaner at 2.
export function formatPrice(value) {
  if (value == null || Number.isNaN(value)) return '—'
  const decimals = Math.abs(value) < 1 ? 3 : 2
  return `$${value.toFixed(decimals)}`
}

// MoM / YoY change. May be null on a BLS data gap (contract allows it) — render
// a neutral dash, never a fake 0.
export function formatPct(pct) {
  if (pct == null || Number.isNaN(pct)) return '—'
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '' // U+2212 minus for typographic alignment
  return `${sign}${Math.abs(pct).toFixed(1)}%`
}

// Direction drives chip color. For a cost-of-living tracker, up = more expensive
// (bad/red), down = cheaper (good/green). null => neutral.
export function changeDirection(pct) {
  if (pct == null || Number.isNaN(pct)) return 'flat'
  if (pct > 0) return 'up'
  if (pct < 0) return 'down'
  return 'flat'
}
