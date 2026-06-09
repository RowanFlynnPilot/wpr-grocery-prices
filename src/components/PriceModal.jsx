import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatPrice, changeDirection, formatWorkTime } from '../format.js'
import { downloadItemCsv } from '../csv.js'
import ChangeChip from './ChangeChip.jsx'
import GeographyBadge from './GeographyBadge.jsx'
import LineChart from './LineChart.jsx'

// Detail pop-up for one item: a full interactive line chart plus the headline
// price, geography label, and MoM/YoY chips.
//
// It is anchored to the clicked card (anchorY = card's document Y) rather than
// fixed to the viewport. Inside an auto-height WordPress iframe there is no
// inner scroll, so position:fixed would center on the whole tall iframe — far
// from what the reader clicked. Absolute-positioning near the card keeps the
// dialog in view in both standalone and embedded contexts.
export default function PriceModal({ item, anchorY, onClose, earnings, real }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const [docHeight, setDocHeight] = useState(0)
  const [copied, setCopied] = useState(false)

  // Backdrop must cover the full document, not just the window.
  useLayoutEffect(() => {
    setDocHeight(document.documentElement.scrollHeight)
  }, [])

  // Escape to close; focus the close button on open; restore focus on unmount.
  useEffect(() => {
    const prev = document.activeElement
    closeRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [onClose])

  // Position the dialog near the card, clamped into the document.
  useLayoutEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const h = el.offsetHeight
    const maxTop = Math.max(8, document.documentElement.scrollHeight - h - 8)
    const desired = Math.max(8, anchorY - 24)
    el.style.top = `${Math.min(desired, maxTop)}px`
    // Make sure it's visible in standalone (in the iframe the card was already
    // in view, so this is a no-op there).
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [anchorY])

  const dir = changeDirection(item.change_yoy_pct)
  const work = earnings ? formatWorkTime(item.latest?.value, earnings.latest?.value) : null
  // Weekly items (pump prices) are a current snapshot — always nominal, never
  // deflated, regardless of the global toggle.
  const isReal = real && !item.__weekly
  const realLabel = isReal ? `real ${item.latest?.period_name} $` : null
  const shortLabel = item.shortChangeLabel || 'MoM'
  const cadence = item.__weekly ? 'weeks' : 'months'
  const sourceLabel = item.source === 'eia' ? 'EIA' : 'U.S. BLS'

  function share() {
    const url = new URL(window.location.href)
    url.searchParams.set('item', item.key)
    navigator.clipboard?.writeText(url.toString()).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => {},
    )
  }

  return (
    <div
      className="modal-backdrop"
      style={{ height: docHeight ? `${docHeight}px` : '100%' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.label} — price history`}
      >
        <header className="modal__head">
          <div className="modal__titles">
            <h2 className="modal__title">{item.label}</h2>
            <GeographyBadge geography={item.geography} label={item.geography_label} />
          </div>
          <button
            ref={closeRef}
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="modal__summary">
          <div className="modal__price">
            <span className="modal__value">{formatPrice(item.latest?.value)}</span>
            <span className="modal__unit">{item.unit}</span>
            {isReal && <span className="modal__realtag">real&nbsp;$</span>}
          </div>
          <div className="modal__chips">
            <ChangeChip label={shortLabel} pct={item.change_mom_pct} />
            <ChangeChip label="YoY" pct={item.change_yoy_pct} />
          </div>
          <span className="modal__asof">as of {item.latest?.period_name}</span>
        </div>

        {work && (
          <p className="modal__work">
            At {earnings?.geography_label ? `${earnings.geography_label}’s` : 'the'} average
            wage ({formatPrice(earnings?.latest?.value)}/hr), that’s about{' '}
            <strong>{work}</strong> of work.
          </p>
        )}

        <LineChart history={item.history} unit={item.unit} direction={dir} />
        {isReal && (
          <p className="modal__realnote">
            Past months shown in today’s dollars (CPI-adjusted,
            {item.geography === 'midwest' ? ' Midwest' : ' U.S.'} all-items).
          </p>
        )}

        <div className="modal__actions">
          <button type="button" className="modal__action" onClick={share}>
            {copied ? '✓ Link copied' : '🔗 Share'}
          </button>
          <button
            type="button"
            className="modal__action"
            onClick={() => downloadItemCsv(item, `value (${item.unit}${realLabel ? `, ${realLabel}` : ''})`)}
          >
            ⤓ CSV
          </button>
          <span className="modal__footnote">
            {item.geography_label} · {item.history?.length || 0} {cadence} · {sourceLabel}
          </span>
        </div>
      </div>
    </div>
  )
}
