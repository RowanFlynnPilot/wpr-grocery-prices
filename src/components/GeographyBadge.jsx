// First-class geography label. This is the editorial honesty of the whole
// widget (see CLAUDE.md "two-tier geography rule"): a reader must always be able
// to tell whether a number is the Midwest regional average or the U.S. city
// average. It is never hidden, collapsed, or shown only on hover.
export default function GeographyBadge({ geography, label }) {
  return (
    <span className={`geo geo--${geography}`} title={label}>
      <span className="geo__dot" aria-hidden="true" />
      {label}
    </span>
  )
}
