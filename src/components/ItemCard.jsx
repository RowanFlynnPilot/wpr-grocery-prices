import { formatPrice, changeDirection } from '../format.js'
import ChangeChip from './ChangeChip.jsx'
import GeographyBadge from './GeographyBadge.jsx'
import Sparkline from './Sparkline.jsx'

// One basket item: name, the latest price + unit, MoM/YoY chips, geography
// label, and a sparkline of the full history. The sparkline color tracks the
// YoY direction so the card reads at a glance. The whole card is a button that
// opens the detail chart modal.
export default function ItemCard({ item, onOpen }) {
  const dir = changeDirection(item.change_yoy_pct)

  function open(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    onOpen(item, rect.top + window.scrollY)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open(e)
    }
  }

  return (
    <article
      className="card"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
      aria-label={`${item.label}, ${formatPrice(item.latest?.value)} ${item.unit}. View price history.`}
    >
      <header className="card__head">
        <h3 className="card__title">{item.label}</h3>
        <GeographyBadge geography={item.geography} label={item.geography_label} />
      </header>

      <div className="card__price">
        <span className="card__value">{formatPrice(item.latest?.value)}</span>
        <span className="card__unit">{item.unit}</span>
      </div>

      <div className="card__chips">
        <ChangeChip label="MoM" pct={item.change_mom_pct} />
        <ChangeChip label="YoY" pct={item.change_yoy_pct} />
      </div>

      <Sparkline history={item.history} direction={dir} />

      <footer className="card__foot">
        <span>{item.latest?.period_name}</span>
        <span className="card__cta" aria-hidden="true">View history →</span>
      </footer>
    </article>
  )
}
