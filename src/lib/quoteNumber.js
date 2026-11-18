/** Quote numbering: HB2B-{FY}-{CustomerInitials}-{seq}
 *  Sequence is per customer per Indian financial year (Apr–Mar).
 *  Each company starts at 001 and increments for every NEW quote number
 *  (revisions keep the same base number and bump -Vn).
 */

export function indianFy(d = new Date()) {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const start = m >= 4 ? y : y - 1
  return String(start) + '-' + String(start + 1).slice(2)
}

/** Initials from legal name (preferred) or short name — e.g. "Micron Electronic Pvt Ltd" → MEPL */
export function companyInitials(legalName, shortName) {
  const src = String(legalName || shortName || 'CUST').trim()
  const parts = src.split(/[\s.,&\-/]+/).filter(Boolean)
  let initials = parts.map(p => p[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (initials.length < 2) {
    initials = src.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4)
  }
  return (initials || 'CUST').slice(0, 6)
}

/**
 * Next quotation number for a company in the current FY.
 * Sequence counts ALL quotes for this company in the FY (any historical
 * initials variant still contributes to max), so we never re-issue 001.
 */
export function nextQuoteNo(existingQuotes, { legalName, shortName } = {}) {
  const fy = indianFy()
  const cust = companyInitials(legalName, shortName)
  const prefix = `HB2B-${fy}-${cust}-`
  let max = 0
  for (const q of existingQuotes || []) {
    const raw = String(q.quotation_no || '').replace(/-V\d+$/i, '')
    // Accept any customer-code segment so older mismatches still increment the seq
    const m = raw.match(/^HB2B-(\d{4}-\d{2})-([A-Z0-9]+)-(\d+)$/i)
    if (m && m[1] === fy) {
      const n = parseInt(m[3], 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return prefix + String(max + 1).padStart(3, '0')
}

/** Customer-facing number always includes version: HB2B-2026-27-MMPL-001-V1 */
export function customerQuoteNo(quote) {
  if (!quote) return ''
  const base = String(quote.quotation_no || '').replace(/-V\d+$/i, '')
  if (!base) return ''
  const v = Number(quote.version) || 1
  return base + '-V' + v
}

export function formatQuoteDate(iso) {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return day + ' ' + months[d.getMonth()] + ' ' + d.getFullYear()
}
