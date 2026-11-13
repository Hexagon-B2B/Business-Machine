/** Quote numbering HB2BS/{initials}/{FY}/{seq} with -Vn revisions */
export function indianFy(d = new Date()) {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const start = m >= 4 ? y : y - 1
  return String(start).slice(2) + '-' + String(start + 1).slice(2)
}

export function nextQuoteNo(quotes, { initials = 'PB' } = {}) {
  const fy = indianFy()
  const prefix = `HB2BS/${String(initials || 'PB').toUpperCase()}/${fy}/`
  let max = 0
  for (const q of quotes || []) {
    const raw = String(q.quotation_no || '').replace(/-V\d+$/i, '')
    if (raw.startsWith(prefix)) {
      const n = parseInt(raw.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return prefix + String(max + 1).padStart(4, '0')
}

export function customerQuoteNo(quote) {
  if (!quote) return ''
  const base = String(quote.quotation_no || '').replace(/-V\d+$/i, '')
  const v = Number(quote.version) || 1
  if (!base) return v > 1 ? `V${v}` : ''
  return v > 1 ? `${base}-V${v}` : base
}

export function formatQuoteDate(iso) {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  const vv = day % 100
  const ord = day + (['th', 'st', 'nd', 'rd'][(vv - 20) % 10] || ['th', 'st', 'nd', 'rd'][vv] || 'th')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${ord} ${months[d.getMonth()]} ${d.getFullYear()}`
}
