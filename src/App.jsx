import { useEffect, useState } from 'react'
import BiggestMovers from './components/BiggestMovers.jsx'
import CategorySection from './components/CategorySection.jsx'

// prices.json is served at the build root (vite publicDir = repo data/), so it
// is fetched relative to the page — works on a GitHub Pages subpath and inside
// the WP iframe alike. Fetched at runtime so a monthly data refresh doesn't
// require a JS rebuild.
const DATA_URL = `${import.meta.env.BASE_URL}prices.json`

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(DATA_URL, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

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

  const { meta, categories, items } = data

  return (
    <div className="page">
      <header className="masthead">
        <p className="masthead__kicker">Wausau Pilot &amp; Review</p>
        <h1 className="masthead__title">Midwest Grocery &amp; Energy Prices</h1>
        <p className="masthead__period">
          Average retail prices · <strong>{meta.latest_period}</strong>
        </p>
        <p className="masthead__note">{meta.note}</p>
      </header>

      <BiggestMovers items={items} />

      {categories.map((name) => (
        <CategorySection
          key={name}
          name={name}
          items={items.filter((it) => it.category === name)}
        />
      ))}

      <footer className="colophon">
        <p>
          Source:{' '}
          <a href={meta.source_url} target="_blank" rel="noopener noreferrer">
            {meta.source}
          </a>
        </p>
        <p className="colophon__geo">
          <span className="geo geo--midwest">
            <span className="geo__dot" aria-hidden="true" />
            Midwest region
          </span>
          {' = '}
          {meta.midwest_region}. Items marked{' '}
          <span className="geo geo--us">
            <span className="geo__dot" aria-hidden="true" />
            U.S. city average
          </span>{' '}
          lack a current Midwest breakout.
        </p>
        <p className="colophon__meta">
          Updated {formatStamp(meta.generated_utc)} · ~2-month reporting lag
        </p>
      </footer>
    </div>
  )
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
