import { formatPrice, formatPct, changeDirection } from '../format.js'

// "Biggest movers" panel: the items with the largest year-over-year swing in
// either direction, sorted by abs(change_yoy_pct). Items with a null YoY (data
// gap) are excluded — we can't rank what we can't measure.
export default function BiggestMovers({ items, count = 6, onOpen }) {
  const ranked = items
    .filter((it) => it.change_yoy_pct != null && !Number.isNaN(it.change_yoy_pct))
    .sort((a, b) => Math.abs(b.change_yoy_pct) - Math.abs(a.change_yoy_pct))
    .slice(0, count)

  if (!ranked.length) return null

  return (
    <section className="movers">
      <div className="movers__head">
        <h2 className="movers__title">Biggest movers</h2>
        <p className="movers__sub">Largest year-over-year change in the basket</p>
      </div>
      <ol className="movers__list">
        {ranked.map((it) => {
          const dir = changeDirection(it.change_yoy_pct)
          return (
            <li
              key={it.key}
              className={`mover mover--${dir}`}
              role="button"
              tabIndex={0}
              onClick={(e) =>
                onOpen?.(it.key, e.currentTarget.getBoundingClientRect().top + window.scrollY)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen?.(it.key, e.currentTarget.getBoundingClientRect().top + window.scrollY)
                }
              }}
              aria-label={`${it.label}, ${formatPct(it.change_yoy_pct)} year over year. View price history.`}
            >
              <div className="mover__main">
                <span className="mover__name">{it.label}</span>
                <span className="mover__geo">{it.geography_label}</span>
              </div>
              <div className="mover__right">
                <span className={`mover__pct mover__pct--${dir}`}>
                  <span aria-hidden="true">
                    {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–'}
                  </span>{' '}
                  {formatPct(it.change_yoy_pct)}
                </span>
                <span className="mover__price">
                  {formatPrice(it.latest?.value)}
                  <span className="mover__unit"> {it.unit}</span>
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
