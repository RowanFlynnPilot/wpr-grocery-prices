// Dependency-free inline-SVG sparkline. Draws the price history as a single
// polyline with a soft area fill and a dot on the latest point. Scales to the
// data's own min/max so small absolute moves are still visible.
export default function Sparkline({
  history,
  width = 240,
  height = 56,
  direction = 'flat',
}) {
  const points = (history || [])
    .map((h) => h.value)
    .filter((v) => v != null && !Number.isNaN(v))

  if (points.length < 2) {
    return <div className="sparkline sparkline--empty" aria-hidden="true" />
  }

  const pad = 4
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const stepX = (width - pad * 2) / (points.length - 1)

  const xy = points.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (1 - (v - min) / span) * (height - pad * 2)
    return [x, y]
  })

  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area =
    `${pad},${height - pad} ` + line + ` ${(width - pad).toFixed(1)},${height - pad}`
  const [lastX, lastY] = xy[xy.length - 1]
  const stroke = `var(--spark-${direction})`

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Price trend, ${points.length} months`}
    >
      <polygon className="sparkline__area" points={area} fill={stroke} />
      <polyline
        className="sparkline__line"
        points={line}
        fill="none"
        stroke={stroke}
      />
      <circle className="sparkline__dot" cx={lastX} cy={lastY} r="2.6" fill={stroke} />
    </svg>
  )
}
