import { supabase } from '../supabase'
import { logActivity } from './activityLog'

export const DEFAULT_TAX_PCT = 18

export function emptyItem(overrides = {}) {
  return {
    id: 'tmp_' + Math.random().toString(36).slice(2, 9),
    line_type: 'product',
    parent_id: null,
    product_name: '',
    specification: '',
    brand: '',
    model_part_no: '',
    vendor: '',
    quantity: 1,
    transfer_price: '',
    customer_price: '',
    margin_pct: '',
    min_margin_pct: '',
    billing: 'on_bill',
    charge_kind: '',
    notes: '',
    optionality: 'mandatory',
    ...overrides,
  }
}

export function emptyUpgrade(parentId, quantity = 1) {
  return emptyItem({ line_type: 'upgrade', parent_id: parentId, quantity: quantity || 1 })
}

export function emptyCharge(kind) {
  const k = typeof kind === 'string' && kind ? kind : 'other'
  return emptyItem({
    line_type: 'charge',
    charge_kind: k,
    product_name: k === 'installation' ? 'Installation' : k === 'warranty' ? 'Warranty' : k === 'transport' ? 'Transport' : '',
    quantity: 1,
    billing: 'on_bill',
  })
}

export function lineTransferTotal(item) {
  const q = Number(item.quantity) || 0
  const p = Number(item.transfer_price ?? item.cost_price) || 0
  return Math.round(q * p * 100) / 100
}

export function childUpgrades(items, parentId) {
  return (items || []).filter(it => it.line_type === 'upgrade' && it.parent_id === parentId)
}

/**
 * Package pricing (per base unit, then × qty):
 * 1) Each upgrade: unitTP × (1 + Std markup %)  → upgrade sell
 * 2) Package = base unit TP + sum(upgrade sells)
 * 3) Min mgn % on package (if set)
 * 4) % Markup on that result (if set) → customer unit rate
 * 5) customerTotal = unit rate × base qty
 *
 * Upgrade qty is normally equal to base qty (upgrade is per unit of base product).
 */
export function groupRollup(base, items) {
  const ups = childUpgrades(items, base.id)
  const qty = Number(base.quantity) || 1
  const baseUnitTP = Number(base.transfer_price ?? base.cost_price) || 0

  let unitUpTP = 0
  let unitUpSell = 0
  let upgradeStdExtra = 0
  for (const u of ups) {
    const uQty = Number(u.quantity) || 0
    const uUnitTP = Number(u.transfer_price ?? u.cost_price) || 0
    const perBaseUnitTP = qty > 0 ? (uUnitTP * uQty) / qty : 0
    unitUpTP += perBaseUnitTP

    let std = null
    if (u.margin_pct !== '' && u.margin_pct != null) {
      const n = Number(u.margin_pct)
      if (!Number.isNaN(n)) std = n
    }
    if (std == null && u.min_margin_pct !== '' && u.min_margin_pct != null) {
      const n = Number(u.min_margin_pct)
      if (!Number.isNaN(n)) std = n
    }
    const sell = std != null ? perBaseUnitTP * (1 + std / 100) : perBaseUnitTP
    unitUpSell += sell
    upgradeStdExtra += sell - perBaseUnitTP
  }
  unitUpTP = Math.round(unitUpTP * 100) / 100
  unitUpSell = Math.round(unitUpSell * 100) / 100
  upgradeStdExtra = Math.round(upgradeStdExtra * 100) / 100

  const baseXfer = Math.round(baseUnitTP * qty * 100) / 100
  const upXfer = Math.round(unitUpTP * qty * 100) / 100
  const transferTotal = Math.round((baseXfer + upXfer) * 100) / 100

  const parts = []
  const baseName = (base.product_name || '').trim() || 'Product'
  const baseSpec = [base.brand, base.specification].filter(Boolean).join(' ')
  parts.push(baseSpec ? `${baseName} (${baseSpec})` : baseName)
  for (const u of ups) {
    const un = (u.product_name || '').trim()
    if (!un) continue
    const us = [u.brand, u.specification].filter(Boolean).join(' ')
    parts.push(us ? `${un} (${us})` : un)
  }
  const mergedDescription =
    ups.length > 0
      ? `${parts[0]} + ${parts.slice(1).join(' + ')} [incl ${ups.length} upgrade${ups.length > 1 ? 's' : ''}]`
      : parts[0]

  let minMarginPct = null
  if (base.min_margin_pct !== '' && base.min_margin_pct != null) {
    const m = Number(base.min_margin_pct)
    if (!Number.isNaN(m)) minMarginPct = m
  }
  let markupPct = null
  if (base.margin_pct !== '' && base.margin_pct != null) {
    const m = Number(base.margin_pct)
    if (!Number.isNaN(m)) markupPct = m
  }

  // Package unit = base unit TP + upgrade sells (after Std markup)
  let packageUnit = baseUnitTP + unitUpSell
  // Min mgn % on (base + upgrade sells)
  if (minMarginPct != null) {
    packageUnit = packageUnit * (1 + minMarginPct / 100)
  }

  const hasCustomerRate =
    base.customer_price !== '' && base.customer_price != null && !Number.isNaN(Number(base.customer_price))

  let unitCustomer
  if (markupPct != null || minMarginPct != null) {
    unitCustomer = markupPct != null ? packageUnit * (1 + markupPct / 100) : packageUnit
  } else if (hasCustomerRate) {
    unitCustomer = Number(base.customer_price)
  } else {
    unitCustomer = baseUnitTP + unitUpSell
  }
  unitCustomer = Math.round(unitCustomer * 100) / 100

  let customerTotal = Math.round(unitCustomer * qty * 100) / 100
  if (base.billing === 'off_invoice') customerTotal = 0

  const effectiveMargin =
    transferTotal > 0 ? Math.round(((customerTotal - transferTotal) / transferTotal) * 1000) / 10 : 0
  const belowMin = minMarginPct != null && effectiveMargin < minMarginPct - 0.05
  const displayMargin = markupPct != null ? markupPct : effectiveMargin

  return {
    base,
    upgrades: ups,
    transferTotal,
    customerTotal,
    upgradeStdExtra,
    marginPct: displayMargin != null && !Number.isNaN(displayMargin) ? displayMargin : effectiveMargin,
    minMarginPct,
    belowMin,
    mergedDescription,
    qty,
    unitCustomer,
    isOptional: (base.optionality || 'mandatory') === 'optional',
  }
}

export function quoteGroups(items) {
  const products = (items || []).filter(it => (it.line_type || 'product') === 'product')
  return products.map(p => groupRollup(p, items))
}

export function lineCustomerTotal(item) {
  if (item.line_type === 'upgrade') return 0
  if (item.billing === 'off_invoice') return 0
  const q = Number(item.quantity) || 0
  const p = Number(item.customer_price ?? item.unit_price) || 0
  return Math.round(q * p * 100) / 100
}

export function quoteCustomerTotal(items) {
  const groups = quoteGroups(items)
  const productCust = groups.reduce((s, g) => s + (g.customerTotal || 0), 0)
  const charges = (items || []).filter(it => it.line_type === 'charge')
  const chargeCust = charges.reduce((s, c) => s + lineCustomerTotal(c), 0)
  return Math.round((productCust + chargeCust) * 100) / 100
}

export function quoteTransferTotal(items) {
  return Math.round(
    (items || []).reduce((s, it) => s + lineTransferTotal(it), 0) * 100
  ) / 100
}

export function quoteMargin(items) {
  const cust = quoteCustomerTotal(items)
  const xfer = quoteTransferTotal(items)
  const amount = Math.round((cust - xfer) * 100) / 100
  const pct = xfer > 0 ? Math.round((amount / xfer) * 1000) / 10 : 0
  return { amount, pct }
}

function normalizeItem(it) {
  return {
    ...emptyItem(),
    ...it,
    id: it.id || 'tmp_' + Math.random().toString(36).slice(2, 9),
    transfer_price: it.transfer_price ?? it.cost_price ?? '',
    customer_price: it.customer_price ?? it.unit_price ?? '',
    margin_pct: it.margin_pct ?? '',
    min_margin_pct: it.min_margin_pct ?? '',
    line_type: it.line_type || 'product',
    billing: it.billing || 'on_bill',
    optionality: it.optionality === 'optional' ? 'optional' : 'mandatory',
  }
}

function nextQuoteNo(quotes) {
  const year = new Date().getFullYear()
  const prefix = `HQ-${year}-`
  let max = 0
  for (const q of quotes || []) {
    const no = String(q.quotation_no || '')
    if (no.startsWith(prefix)) {
      const n = parseInt(no.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return prefix + String(max + 1).padStart(4, '0')
}

export function customerQuoteNo(quote) {
  if (!quote) return ''
  return quote.quotation_no || ''
}

export async function loadQuotesForOpp(opportunityId) {
  if (!opportunityId) return { quotes: [], error: { message: 'No opportunity id' }, storage: 'metadata' }
  const { data: opp, error: oppErr } = await supabase.from('opportunities').select('id, metadata').eq('id', opportunityId).single()
  if (!oppErr && opp) {
    const quotes = (Array.isArray(opp?.metadata?.quotes) ? opp.metadata.quotes : []).map(q => ({
      ...q,
      quotation_items: (q.quotation_items || []).map(normalizeItem),
    }))
    quotes.sort((a, b) => (b.version || 0) - (a.version || 0))
    if (quotes.length) return { quotes, error: null, storage: 'metadata' }
  }
  const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('opportunity_id', opportunityId).order('version', { ascending: false })
  if (!error && data && data.length) {
    return {
      quotes: data.map(q => ({
        ...q,
        quotation_items: (q.quotation_items || []).map(normalizeItem),
      })),
      error: null,
      storage: 'table',
    }
  }
  return { quotes: [], error: oppErr || error, storage: 'metadata' }
}

export async function saveQuotation(opts) {
  if (!opts.opportunityId) return { quote: null, error: { message: 'Missing opportunity id' } }
  const { data: opp, error: loadErr } = await supabase.from('opportunities').select('id, metadata, company_id').eq('id', opts.opportunityId).single()
  if (loadErr) return { quote: null, error: loadErr }
  const meta = { ...(opp.metadata || {}) }
  let quotes = Array.isArray(meta.quotes) ? meta.quotes.slice() : []
  if (opts.supersedePreviousId) {
    quotes = quotes.map(q => q.id === opts.supersedePreviousId ? { ...q, status: 'superseded' } : q)
  }
  const items = (opts.items || []).map(normalizeItem)
  const customerTotal = quoteCustomerTotal(items)
  const transferTotal = quoteTransferTotal(items)
  const margin = quoteMargin(items)
  const groups = quoteGroups(items)
  const id = 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const version = opts.supersedePreviousId
    ? (Number((quotes.find(q => q.id === opts.supersedePreviousId) || {}).version) || 1) + 1
    : 1
  const quotation_no = opts.supersedePreviousId
    ? (quotes.find(q => q.id === opts.supersedePreviousId) || {}).quotation_no || nextQuoteNo(quotes)
    : nextQuoteNo(quotes)
  const idMap = {}
  items.forEach(it => {
    const raw = String(it.id || '')
    idMap[it.id] = raw.startsWith('tmp_')
      ? 'li_' + Math.random().toString(36).slice(2, 10)
      : (it.id || ('li_' + Math.random().toString(36).slice(2, 10)))
  })
  const rowItems = items.filter(it => (it.product_name || '').trim() || it.line_type === 'charge').map((it, i) => ({
    id: idMap[it.id] || it.id,
    parent_id: it.parent_id && idMap[it.parent_id] ? idMap[it.parent_id] : (it.parent_id || null),
    line_type: it.line_type || 'product',
    product_name: it.product_name || '',
    specification: it.specification || '',
    brand: it.brand || '',
    model_part_no: it.model_part_no || '',
    vendor: it.vendor || '',
    quantity: Number(it.quantity) || 1,
    transfer_price: it.transfer_price !== '' && it.transfer_price != null ? Number(it.transfer_price) : null,
    customer_price: it.customer_price !== '' && it.customer_price != null ? Number(it.customer_price) : null,
    margin_pct: it.margin_pct !== '' && it.margin_pct != null ? Number(it.margin_pct) : null,
    min_margin_pct: it.min_margin_pct !== '' && it.min_margin_pct != null ? Number(it.min_margin_pct) : null,
    billing: it.billing || 'on_bill',
    charge_kind: typeof it.charge_kind === 'string' ? it.charge_kind : '',
    notes: it.notes || '',
    optionality: it.optionality === 'optional' ? 'optional' : 'mandatory',
    sort_order: i,
  }))
  const quote = {
    id, opportunity_id: opts.opportunityId, company_id: opts.companyId || opp.company_id,
    quotation_no, version, status: opts.status || 'draft',
    validity_date: opts.validity_date || null, delivery_tat: opts.delivery_tat || null,
    payment_terms: opts.payment_terms || null, transport_terms: opts.transport_terms || null,
    special_terms: opts.special_terms || null, revision_reason: opts.revision_reason || null,
    no_regret_price: !!opts.no_regret_price, total_value: customerTotal, transfer_total: transferTotal,
    margin_amount: margin.amount, margin_pct: margin.pct, currency: 'INR', notes: opts.notes || null,
    commercial_lines: groups.map(g => ({
      description: g.mergedDescription,
      transfer_total: g.transferTotal,
      customer_total: g.customerTotal,
      margin_pct: g.marginPct,
      min_margin_pct: g.minMarginPct,
      below_min: g.belowMin,
      upgrade_count: g.upgrades.length,
    })),
    quotation_items: rowItems,
    created_at: new Date().toISOString(),
  }
  quotes.push(quote)
  meta.quotes = quotes
  const patch = { metadata: meta }
  if (customerTotal > 0) patch.deal_size = customerTotal
  const { error } = await supabase.from('opportunities').update(patch).eq('id', opts.opportunityId)
  if (error) return { quote: null, error }
  try {
    await logActivity({
      entityType: 'quotation',
      entityId: opts.opportunityId,
      action: version > 1 ? 'quote_revised' : 'quote_created',
      summary: customerQuoteNo(quote) + ' · Cust ₹' + customerTotal.toLocaleString('en-IN'),
    })
  } catch (_) { /* activity optional */ }
  return { quote, error: null }
}

export async function updateQuoteStatus(opportunityId, quoteId, status) {
  const { data: opp, error: loadErr } = await supabase.from('opportunities').select('id, metadata').eq('id', opportunityId).single()
  if (loadErr) return { error: loadErr }
  const meta = { ...(opp.metadata || {}) }
  const quotes = (Array.isArray(meta.quotes) ? meta.quotes : []).map(q =>
    q.id === quoteId ? { ...q, status } : q
  )
  meta.quotes = quotes
  const { error } = await supabase.from('opportunities').update({ metadata: meta }).eq('id', opportunityId)
  return { error }
}

export function formatQuoteForExcel(quote, { taxPct = DEFAULT_TAX_PCT } = {}) {
  if (!quote) return ''
  const items = quote.quotation_items || []
  const groups = quoteGroups(items)
  const lines = []
  lines.push(['SL No', 'Brand', 'Description', 'Rate', 'Qty', 'Amount'].join('\t'))
  let sl = 1
  let subtotal = 0
  for (const g of groups) {
    if (g.isOptional) continue
    const rate = g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : g.customerTotal
    lines.push([
      sl++,
      (g.base.brand || '').trim(),
      g.mergedDescription,
      rate,
      g.qty,
      g.customerTotal,
    ].join('\t'))
    subtotal += g.customerTotal
  }
  const optional = groups.filter(g => g.isOptional)
  if (optional.length) {
    lines.push('')
    lines.push('Optional items')
    for (const g of optional) {
      const rate = g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : g.customerTotal
      lines.push([
        sl++,
        (g.base.brand || '').trim(),
        g.mergedDescription,
        rate,
        g.qty,
        g.customerTotal,
      ].join('\t'))
    }
  }
  const charges = items.filter(it => it.line_type === 'charge')
  for (const c of charges) {
    const amt = lineCustomerTotal(c)
    lines.push([sl++, '', c.product_name || c.charge_kind || 'Charge', Number(c.customer_price) || 0, Number(c.quantity) || 1, amt].join('\t'))
    subtotal += amt
  }
  const tax = Math.round(subtotal * (taxPct / 100) * 100) / 100
  lines.push('')
  lines.push(['', '', 'Subtotal', '', '', subtotal].join('\t'))
  lines.push(['', '', `Tax ${taxPct}%`, '', '', tax].join('\t'))
  lines.push(['', '', 'Grand total', '', '', Math.round((subtotal + tax) * 100) / 100].join('\t'))
  const header = [
    `Quotation: ${customerQuoteNo(quote)}`,
    quote.validity_date ? `Validity: ${quote.validity_date}` : '',
    quote.delivery_tat ? `Delivery TAT: ${quote.delivery_tat}` : '',
  ].filter(Boolean).join(' | ')
  return header + '\n' + lines.join('\n')
}
