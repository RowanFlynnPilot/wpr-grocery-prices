import { useEffect, useRef, useState } from 'react'
import { formatPrice } from '../format.js'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// Period strings are "YYYY-MM" (monthly) or "YYYY-MM-DD" (weekly).
function periodLabel(period) {
  const [y, m, d] = period.split('-')
  return d ? `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}` : `${MONTHS[Number(m) - 1]} ${y}`
}

// Full interactive line chart for the detail modal. Dependency-free: rendered at
// the container's real pixel width (measured via ResizeObserver) so hover
// mapping is exact and axis text stays crisp. Hover/touch reveals the price for
// any month.
export default function LineChart({ history, unit, direction = 'flat', height = 340 }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState(null) // index of hovered point

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.max(280, Math.round(w)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = (history || []).filter(
    (h) => h.value != null && !Number.isNaN(h.value),
  )

  const padL = 52
  const padR = 16
  const padT = 16
  const padB = 30
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  if (points.length < 2) {
    return (
      <div ref={wrapRef} className="linechart linechart--empty">
        Not enough history to chart.
      </div>
    )
  }

  const values = points.map((p) => p.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = rawMax - rawMin || 1
  const min = rawMin - span * 0.08
  const max = rawMax + span * 0.08

  const x = (i) => padL + (i / (points.length - 1)) * plotW
  const y = (v) => padT + (1 - (v - min) / (max - min)) * plotH

  const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  const areaPts = `${x(0)},${padT + plotH} ${linePts} ${x(points.length - 1)},${padT + plotH}`
  const stroke = `var(--spark-${direction})`

  // y-axis ticks (5 evenly spaced across the padded range)
  const yTicks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4)

  // x-axis labels: one year marker per year present in the series, plus the
  // final point if its year isn't already labelled. For monthly data the marker
  // sits on January; for weekly data (dates) it sits on the first point of each
  // year. Dedupe by year so the latest year never repeats.
  const weekly = points[0].period.length > 7 // "YYYY-MM-DD" vs "YYYY-MM"
  const seenYears = new Set()
  const xTicks = []
  points.forEach((p, i) => {
    const year = p.period.slice(0, 4)
    const isYearMark = weekly ? !seenYears.has(year) : (p.period.slice(5, 7) === '01' && !seenYears.has(year))
    if (isYearMark) {
      seenYears.add(year)
      xTicks.push({ i, label: year })
    }
  })
  const lastIdx = points.length - 1
  const lastYear = points[lastIdx].period.slice(0, 4)
  if (!seenYears.has(lastYear)) {
    xTicks.push({ i: lastIdx, label: lastYear })
  }

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    // Map display pixels back into the SVG's coordinate space — the rendered
    // width can differ slightly from `width` (CSS width:100% vs the attribute),
    // so scale by the ratio rather than assuming they're equal.
    const scaleX = rect.width ? width / rect.width : 1
    const px = (clientX - rect.left) * scaleX
    const frac = (px - padL) / plotW
    const idx = Math.round(frac * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const hv = hover != null ? points[hover] : null

  return (
    <div ref={wrapRef} className="linechart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Price history line chart"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={handleMove}
        onTouchMove={handleMove}
      >
        {/* gridlines + y labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              className="lc-grid"
              x1={padL}
              x2={width - padR}
              y1={y(v)}
              y2={y(v)}
            />
            <text className="lc-ylabel" x={padL - 8} y={y(v)} dy="0.32em">
              {formatPrice(v)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {xTicks.map((t, i) => (
          <text key={i} className="lc-xlabel" x={x(t.i)} y={height - 10}>
            {t.label}
          </text>
        ))}

        {/* series */}
        <polygon className="lc-area" points={areaPts} fill={stroke} />
        <polyline className="lc-line" points={linePts} fill="none" stroke={stroke} />

        {/* hover guide */}
        {hv && (
          <g>
            <line
              className="lc-guide"
              x1={x(hover)}
              x2={x(hover)}
              y1={padT}
              y2={padT + plotH}
            />
            <circle className="lc-dot" cx={x(hover)} cy={y(hv.value)} r="4" fill={stroke} />
          </g>
        )}
      </svg>

      <div className="lc-readout" aria-live="polite">
        {hv ? (
          <>
            <span className="lc-readout__val" style={{ color: stroke }}>
              {formatPrice(hv.value)}
            </span>
            <span className="lc-readout__unit"> {unit}</span>
            <span className="lc-readout__sep">·</span>
            <span className="lc-readout__period">{periodLabel(hv.period)}</span>
          </>
        ) : (
          <span className="lc-readout__hint">
            Hover or tap the chart to read a {weekly ? 'week' : 'month'}
          </span>
        )}
      </div>
    </div>
  )
}
