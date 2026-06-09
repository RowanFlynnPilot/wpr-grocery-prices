// The auto-generated newsroom sentence from fetch.py (basket cost + top movers).
// A plain, scannable lede that refreshes with the data every month.
export default function SummaryLine({ text }) {
  if (!text) return null
  return (
    <p className="summary" role="note">
      {text}
    </p>
  )
}
