import { useState } from 'react'
import { formatPrice, formatPct, changeDirection, formatWorkTime } from '../format.js'
import ChangeChip from './ChangeChip.jsx'
import Sparkline from './Sparkline.jsx'

// Headline "market basket" hero: a representative weekly cart summed to one
// dollar figure readers can track month to month. Shows MoM/YoY, a sparkline,
// minutes-of-work, and an expandable list of what's in the cart.
export default function MarketBasket({ basket, earnings, real }) {
  const [open, setOpen] = useState(false)
  if (!basket) return null

  const dir = changeDirection(basket.change_yoy_pct)
  const work = earnings ? formatWorkTime(basket.latest?.value, earnings.latest?.value) : null

  return (
    <section className="basket">
      <div className="basket__main">
        <div className="basket__lede">
          <p className="basket__kicker">{basket.label}</p>
          <div className="basket__price">
            <span className="basket__value">{formatPrice(basket.latest?.value)}</span>
            {real && <span className="basket__real">real&nbsp;$</span>}
          </div>
          <div className="basket__chips">
            <ChangeChip label="MoM" pct={basket.change_mom_pct} />
            <ChangeChip label="YoY" pct={basket.change_yoy_pct} />
          </div>
          {work && (
            <p className="basket__work">
              ≈ {work} of work at average U.S. hourly earnings
            </p>
          )}
        </div>
        <div className="basket__chart">
          <Sparkline history={basket.history} direction={dir} width={360} height={84} />
          <p className="basket__asof">{basket.latest?.period_name}</p>
        </div>
      </div>

      <button
        type="button"
        className="basket__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide' : 'What’s in the cart?'} ({basket.components?.length || 0} items)
      </button>

      {open && (
        <ul className="basket__items">
          {basket.components?.map((c) => (
            <li key={c.key} className="basket__item">
              <span className="basket__qty">
                {c.qty} × {c.unit.replace(/^per /, '')}
              </span>
              <span className="basket__name">{c.label}</span>
              <span className={`basket__geo basket__geo--${c.geography}`}>
                {c.geography === 'midwest' ? 'Midwest' : 'U.S. avg'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="basket__note">
        A fixed editorial cart. Midwest prices where available, U.S. city average
        otherwise. Trend covers months where every item reports.
      </p>
    </section>
  )
}
