import { useEffect, useMemo, useState } from 'react'
import BiggestMovers from './components/BiggestMovers.jsx'
import CategorySection from './components/CategorySection.jsx'
import PriceModal from './components/PriceModal.jsx'
import MarketBasket from './components/MarketBasket.jsx'
import WeeklyFuel from './components/WeeklyFuel.jsx'
import SummaryLine from './components/SummaryLine.jsx'
import Controls from './components/Controls.jsx'
import { cpiIndex, toReal, toRealBasket } from './deflate.js'
import { formatPrice } from './format.js'

// prices.json is served at the build root (vite publicDir = repo data/), so it
// is fetched relative to the page — works on a GitHub Pages subpath and inside
// the WP iframe alike. Fetched at runtime so a monthly data refresh doesn't
// require a JS rebuild.
const DATA_URL = `${import.meta.env.BASE_URL}prices.json`

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // Seed from ?item=… synchronously so the URL-sync effect can't strip the
  // deep-link param before data loads.
  const [selectedKey, setSelectedKey] = useState(
    () => new URLSearchParams(window.location.search).get('item'),
  )
  const [anchorY, setAnchorY] = useState(0)
  const [real, setReal] = useState(false)

  useEffect(() => {
    fetch(DATA_URL, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  // CPI lookups for the inflation-adjusted view (two-tier: US + Midwest).
  const idxUs = useMemo(
    () => (data?.context?.cpi?.us ? cpiIndex(data.context.cpi.us) : null),
    [data],
  )
  const idxMw = useMemo(
    () => (data?.context?.cpi?.midwest ? cpiIndex(data.context.cpi.midwest) : null),
    [data],
  )

  // Items/basket as displayed: nominal, or deflated to real dollars.
  const displayItems = useMemo(() => {
    if (!data) return []
    return real ? data.items.map((it) => toReal(it, idxUs, idxMw)) : data.items
  }, [data, real, idxUs, idxMw])

  const displayBasket = useMemo(() => {
    if (!data?.market_basket) return null
    return real ? toRealBasket(data.market_basket, idxUs) : data.market_basket
  }, [data, real, idxUs])

  // Deep-link: once data loads, validate the seeded ?item= key and anchor the
  // modal to its card (or drop it if it names nothing we track).
  useEffect(() => {
    if (!data || !selectedKey) return
    const known =
      data.items.some((it) => it.key === selectedKey) ||
      (data.weekly_fuel?.items || []).some((w) => w.key === selectedKey)
    if (!known) {
      setSelectedKey(null)
      return
    }
    const el = document.getElementById(`card-${selectedKey}`)
    if (el) setAnchorY(el.getBoundingClientRect().top + window.scrollY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Keep the URL in sync so the open chart is shareable / refresh-stable.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedKey) url.searchParams.set('item', selectedKey)
    else url.searchParams.delete('item')
    window.history.replaceState(null, '', url)
  }, [selectedKey])

  if (error) {
    return (
      <main className="state state--error">
        <p>Couldn’t load price data ({error}).</p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="state state--loading">
        <p>Loading prices…</p>
      </main>
    )
  }

  const { meta, categories } = data
  const earnings = data.context?.earnings
  const openItem = (key, y) => {
    setAnchorY(y)
    setSelectedKey(key)
  }
  const itemsByKey = Object.fromEntries(displayItems.map((it) => [it.key, it]))
  // Weekly fuel items are normalized into the same modal shape, but stay nominal.
  const weeklyByKey = Object.fromEntries(
    (data.weekly_fuel?.items || []).map((w) => [w.key, normalizeWeekly(w)]),
  )
  const selectedItem = itemsByKey[selectedKey] || weeklyByKey[selectedKey] || null

  return (
    <div className="page">
      <header className="masthead">
        <p className="masthead__kicker">Wausau Pilot &amp; Review</p>
        <h1 className="masthead__title">Midwest Grocery &amp; Energy Prices</h1>
        <p className="masthead__period">
          Average retail prices · <strong>{meta.latest_period}</strong>
        </p>
        <SummaryLine text={data.summary} />
      </header>

      <MarketBasket
        basket={displayBasket}
        earnings={earnings}
        real={real}
        itemsByKey={itemsByKey}
        onOpen={openItem}
      />

      <WeeklyFuel weekly={data.weekly_fuel} onOpen={openItem} />

      <Controls
        real={real}
        onToggleReal={setReal}
        items={displayItems}
        realLabel={`real_${meta.latest_period.replace(/\s+/g, '_')}_usd`}
      />

      <BiggestMovers items={displayItems} onOpen={openItem} />

      {categories.map((name) => (
        <CategorySection
          key={name}
          name={name}
          items={displayItems.filter((it) => it.category === name)}
          onOpen={openItem}
          earnings={earnings}
        />
      ))}

      <footer className="colophon">
        <p>
          Sources:{' '}
          <a href={meta.source_url} target="_blank" rel="noopener noreferrer">
            U.S. Bureau of Labor Statistics
          </a>{' '}
          (food prices, CPI, hourly earnings) and{' '}
          <a
            href={meta.source_url_energy || 'https://www.eia.gov/opendata/'}
            target="_blank"
            rel="noopener noreferrer"
          >
            U.S. Energy Information Administration
          </a>{' '}
          (energy).
        </p>
        <p className="colophon__geo">
          <span className="geo geo--midwest">
            <span className="geo__dot" aria-hidden="true" />
            Midwest region
          </span>
          {' = '}
          {meta.midwest_region}. Food items marked{' '}
          <span className="geo geo--us">
            <span className="geo__dot" aria-hidden="true" />
            U.S. city average
          </span>{' '}
          lack a current regional breakout. Energy is local where available:{' '}
          <span className="geo geo--wisconsin">
            <span className="geo__dot" aria-hidden="true" />
            Wisconsin
          </span>{' '}
          for electricity &amp; natural gas,{' '}
          <span className="geo geo--padd2">
            <span className="geo__dot" aria-hidden="true" />
            Midwest (PADD 2)
          </span>{' '}
          for motor fuels.
        </p>
        {earnings?.latest && (
          <p className="colophon__meta">
            “Minutes of work” use {earnings.geography_label || 'the'} average
            private-sector wage: {formatPrice(earnings.latest.value)}/hr (
            {earnings.latest.period_name}).
          </p>
        )}
        <p className="colophon__meta">
          Updated {formatStamp(meta.generated_utc)} · ~2-month reporting lag
        </p>
      </footer>

      {selectedItem && (
        <PriceModal
          item={selectedItem}
          anchorY={anchorY}
          onClose={() => setSelectedKey(null)}
          earnings={earnings}
          real={real}
        />
      )}
    </div>
  )
}

// Reshape a weekly_fuel item into the modal/LineChart item shape (period-based,
// nominal). The __weekly flag tells the modal to label changes "WoW", skip the
// real-$ treatment, and count history in weeks.
function normalizeWeekly(w) {
  return {
    key: w.key,
    label: w.label,
    unit: w.unit,
    geography: w.geography,
    geography_label: w.geography_label,
    source: w.source || 'eia',
    latest: { period: w.latest.date, period_name: formatWeek(w.latest.date), value: w.latest.value },
    change_mom_pct: w.change_wow_pct,
    change_yoy_pct: w.change_yoy_pct,
    shortChangeLabel: 'WoW',
    history: (w.history || []).map((h) => ({ period: h.date, value: h.value })),
    __weekly: true,
  }
}

function formatWeek(d) {
  if (!d) return ''
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

function formatStamp(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}
