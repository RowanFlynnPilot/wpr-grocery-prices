import { formatPrice, changeDirection } from '../format.js'
import ChangeChip from './ChangeChip.jsx'
import Sparkline from './Sparkline.jsx'

function formatWeek(d) {
  if (!d) return ''
  const dt = new Date(`${d}T00:00:00`)
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Near-real-time pump-price widget (EIA weekly retail prices, Midwest/PADD 2).
// Deliberately distinct from the monthly Energy grid: weekly cadence, WoW change,
// "this week" framing. Always nominal — it's a current snapshot, not a trend the
// inflation toggle should rewrite.
export default function WeeklyFuel({ weekly }) {
  if (!weekly || !weekly.items?.length) return null

  return (
    <section className="weekly">
      <div className="weekly__head">
        <p className="weekly__kicker">
          {weekly.label}
          <span className="weekly__tag">Updated weekly</span>
        </p>
        <p className="weekly__sub">
          {weekly.geography_label} · week of {formatWeek(weekly.latest_date)}
        </p>
      </div>

      <div className="weekly__grid">
        {weekly.items.map((it) => {
          const dir = changeDirection(it.change_wow_pct)
          return (
            <div key={it.key} className="wfuel">
              <span className="wfuel__name">{it.label}</span>
              <div className="wfuel__price">
                <span className="wfuel__value">{formatPrice(it.latest?.value)}</span>
                <span className="wfuel__unit">{it.unit}</span>
              </div>
              <div className="wfuel__chips">
                <ChangeChip label="WoW" pct={it.change_wow_pct} />
                <ChangeChip label="YoY" pct={it.change_yoy_pct} />
              </div>
              <Sparkline history={it.history} direction={dir} width={300} height={46} />
            </div>
          )
        })}
      </div>

      <p className="weekly__note">
        EIA weekly retail average — the most current fuel data available. The
        monthly Energy cards below show the longer trend.
      </p>
    </section>
  )
}
