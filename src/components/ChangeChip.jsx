import { formatPct, changeDirection } from '../format.js'

// A MoM or YoY change chip. `label` is the short period tag ("MoM" / "YoY").
// Color and arrow follow direction: up = pricier (warm red), down = cheaper
// (teal-green), flat/null = neutral.
export default function ChangeChip({ label, pct }) {
  const dir = changeDirection(pct)
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–'
  return (
    <span className={`chip chip--${dir}`}>
      <span className="chip__label">{label}</span>
      <span className="chip__arrow" aria-hidden="true">
        {arrow}
      </span>
      <span className="chip__value">{formatPct(pct)}</span>
    </span>
  )
}
