// Client-side CSV export. Builds a Blob and triggers a download — works inside
// the WordPress iframe because it's driven by a user click (gesture).

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}

// One item's monthly history. `valueHeader` notes the unit (and real-$ basis).
export function downloadItemCsv(item, valueHeader) {
  const rows = [['period', valueHeader]]
  for (const h of item.history) rows.push([h.period, h.value])
  download(`${item.key}.csv`, toCsv(rows))
}

// The whole basket in long format — one row per item-month. The journalist's
// export. `items` should be the displayed (nominal or real) set.
export function downloadAllCsv(items, realLabel) {
  const valueCol = realLabel ? `value_${realLabel}` : 'value'
  const rows = [['key', 'label', 'unit', 'geography', 'period', valueCol]]
  for (const it of items) {
    for (const h of it.history) {
      rows.push([it.key, it.label, it.unit, it.geography_label, h.period, h.value])
    }
  }
  download('wpr-grocery-prices.csv', toCsv(rows))
}
