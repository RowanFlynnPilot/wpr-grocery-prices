import { formatPrice, changeDirection } from '../format.js'
import ChangeChip from './ChangeChip.jsx'
import GeographyBadge from './GeographyBadge.jsx'
import Sparkline from './Sparkline.jsx'

// One basket item: name, the latest price + unit, MoM/YoY chips, geography
// label, and a sparkline of the full history. The sparkline color tracks the
// YoY direction so the card reads at a glance.
export default function ItemCard({ item }) {
  const dir = changeDirection(item.change_yoy_pct)
  return (
    <article className="card">
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
        {item.latest?.period_name}
      </footer>
    </article>
  )
}
