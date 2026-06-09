import { useState } from 'react'
import { formatPrice, changeDirection, formatWorkTime } from '../format.js'
import ChangeChip from './ChangeChip.jsx'
import Sparkline from './Sparkline.jsx'

// Headline "market basket" hero: a representative weekly cart summed to one
// dollar figure readers can track month to month. Shows MoM/YoY, a sparkline,
// minutes-of-work, and an expandable grid of distinct, clickable item tiles —
// each revealing its price (and line cost) on hover and opening the detail chart.
export default function MarketBasket({ basket, earnings, real, itemsByKey, onOpen }) {
  const [open, setOpen] = useState(false)
  if (!basket) return null

  const dir = changeDirection(basket.change_yoy_pct)
  const work = earnings ? formatWorkTime(basket.latest?.value, earnings.latest?.value) : null

  function openItem(e, key) {
    onOpen?.(key, e.currentTarget.getBoundingClientRect().top + window.scrollY)
  }

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
          {basket.components?.map((c) => {
            const item = itemsByKey?.[c.key]
            const price = item?.latest?.value
            const lineTotal = price != null ? price * c.qty : null
            const unitShort = c.unit.replace(/^per /, '')
            const idir = changeDirection(item?.change_yoy_pct)
            return (
              <li key={c.key}>
                <button
                  type="button"
                  className={`bitem bitem--${c.geography}`}
                  onClick={(e) => openItem(e, c.key)}
                  aria-label={`${c.label}, ${formatPrice(price)} ${c.unit}. View price history.`}
                >
                  <span className="bitem__top">
                    <span className="bitem__name">{c.label}</span>
                    <span className={`bitem__geo bitem__geo--${c.geography}`}>
                      {c.geography === 'midwest' ? 'Midwest' : 'U.S. avg'}
                    </span>
                  </span>
                  <span className="bitem__bottom">
                    <span className="bitem__qty">
                      {c.qty} × {unitShort}
                    </span>
                    <span className="bitem__price">
                      <span className="bitem__unitprice">
                        {formatPrice(price)}/{unitShort}
                      </span>
                      <span className={`bitem__line bitem__line--${idir}`}>
                        {formatPrice(lineTotal)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="basket__note">
        A fixed editorial cart. Midwest prices where available, U.S. city average
        otherwise. Trend covers months where every item reports. Tap an item for its history.
      </p>
    </section>
  )
}
