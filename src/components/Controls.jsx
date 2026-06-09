import { downloadAllCsv } from '../csv.js'

// A small control bar: the nominal/real toggle and the "download all" export.
export default function Controls({ real, onToggleReal, items, realLabel }) {
  return (
    <div className="controls">
      <div
        className="toggle"
        role="group"
        aria-label="Price basis: nominal or inflation-adjusted"
      >
        <button
          type="button"
          className={`toggle__btn ${!real ? 'is-on' : ''}`}
          aria-pressed={!real}
          onClick={() => onToggleReal(false)}
        >
          Nominal $
        </button>
        <button
          type="button"
          className={`toggle__btn ${real ? 'is-on' : ''}`}
          aria-pressed={real}
          onClick={() => onToggleReal(true)}
        >
          Inflation-adjusted
        </button>
      </div>

      {real && (
        <span className="controls__hint">
          Past prices shown in today’s dollars (CPI-adjusted)
        </span>
      )}

      <button
        type="button"
        className="controls__csv"
        onClick={() => downloadAllCsv(items, real ? realLabel : null)}
      >
        ⤓ Download data (CSV)
      </button>
    </div>
  )
}
