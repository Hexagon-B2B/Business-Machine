import { supabase } from '../supabase'
import { logActivity } from './activityLog'

export const QUOTE_STATUS = ['draft', 'sent', 'accepted', 'rejected', 'superseded']

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
    ...overrides,
  }
}

export function emptyUpgrade(parentId) {
  return emptyItem({ line_type: 'upgrade', parent_id: parentId, quantity: 1 })
}

export function emptyCharge(kind) {
  return emptyItem({
    line_type: 'charge',
    charge_kind: kind || 'other',
    product_name: kind === 'installation' ? 'Installation' : kind === 'warranty' ? 'Warranty' : kind === 'transport' ? 'Transport' : '',
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

export function groupRollup(base, items) {
  const ups = childUpgrades(items, base.id)
  const baseXfer = lineTransferTotal(base)
  const upXfer = ups.reduce((s, u) => s + lineTransferTotal(u), 0)
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
      ? `${parts[0]} + ${parts.slice(1).join(' + ')} [incl. ${ups.length} upgrade${ups.length > 1 ? 's' : ''}]`
      : parts[0]

  const qty = Number(base.quantity) || 1
  let marginPct = base.margin_pct !== '' && base.margin_pct != null ? Number(base.margin_pct) : null
  let customerTotal
  if (marginPct != null && !Number.isNaN(marginPct) && transferTotal > 0) {
    customerTotal = Math.round(transferTotal * (1 + marginPct / 100) * 100) / 100
  } else {
    const unitCust = Number(base.customer_price ?? base.unit_price) || 0
    if (ups.length && unitCust > 0 && qty === 1) {
      customerTotal = Math.round(unitCust * 100) / 100
    } else {
      customerTotal = Math.round(unitCust * qty * 100) / 100
    }
    if (transferTotal > 0 && customerTotal > 0) {
      marginPct = Math.round(((customerTotal - transferTotal) / transferTotal) * 1000) / 10
    }
  }
  if (base.billing === 'off_invoice') customerTotal = 0

  const minFloors = []
  if (base.min_margin_pct !== '' && base.min_margin_pct != null) minFloors.push(Number(base.min_margin_pct))
  for (const u of ups) {
    const m = u.min_margin_pct !== '' && u.min_margin_pct != null ? Number(u.min_margin_pct) : (u.margin_pct !== '' && u.margin_pct != null ? Number(u.margin_pct) : null)
    if (m != null && !Number.isNaN(m)) minFloors.push(m)
  }
  const minMarginPct = minFloors.length ? Math.max(...minFloors) : null
  const effectiveMargin = transferTotal > 0 ? Math.round(((customerTotal - transferTotal) / transferTotal) * 1000) / 10 : 0
  const belowMin = minMarginPct != null && effectiveMargin < minMarginPct

  return {
    base, upgrades: ups, transferTotal, customerTotal,
    marginPct: marginPct != null && !Number.isNaN(marginPct) ? marginPct : effectiveMargin,
    minMarginPct, belowMin, mergedDescription, qty,
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
  const chargeCust = charges.reduce((s, it) => {
    if (it.billing === 'off_invoice') return s
    return s + Math.round((Number(it.quantity) || 0) * (Number(it.customer_price) || 0) * 100) / 100
  }, 0)
  return Math.round((productCust + chargeCust) * 100) / 100
}

export function quoteTransferTotal(items) {
  return (items || []).reduce((s, it) => s + lineTransferTotal(it), 0)
}

export function quoteMargin(items) {
  const sell = quoteCustomerTotal(items)
  const cost = quoteTransferTotal(items)
  const m = Math.round((sell - cost) * 100) / 100
  const pct = cost > 0 ? Math.round((m / cost) * 1000) / 10 : (sell > 0 ? 100 : 0)
  return { amount: m, pct }
}

export function itemsTotal(items) {
  return quoteCustomerTotal(items)
}

function isMissingTable(err) {
  if (!err) return false
  const m = (err.message || '') + ' ' + (err.code || '') + ' ' + (err.details || '')
  return /relation|does not exist|schema cache|Could not find the table|PGRST/i.test(m)
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
  }
}

export async function loadQuotesForOpp(opportunityId) {
  if (!opportunityId) return { quotes: [], error: { message: 'No opportunity id' }, storage: 'metadata' }

  const { data: opp, error: oppErr } = await supabase
    .from('opportunities')
    .select('id, metadata')
    .eq('id', opportunityId)
    .single()

  if (!oppErr && opp) {
    const quotes = (Array.isArray(opp?.metadata?.quotes) ? opp.metadata.quotes : []).map(q => ({
      ...q,
      quotation_items: (q.quotation_items || []).map(normalizeItem),
    }))
    quotes.sort((a, b) => (b.version || 0) - (a.version || 0))
    if (quotes.length) return { quotes, error: null, storage: 'metadata' }
  }

  const { data, error } = await supabase
    .from('quotations')
    .select('*, quotation_items(*)')
    .eq('opportunity_id', opportunityId)
    .order('version', { ascending: false })

  if (!error && data?.length) {
    const quotes = data.map(q => ({
      ...q,
      quotation_no: q.quotation_no || `V${q.version}`,
      quotation_items: (q.quotation_items || [])
        .map(it => normalizeItem({
          ...it,
          customer_price: it.unit_price,
          transfer_price: it.cost_price,
        }))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    }))
    return { quotes, error: null, storage: 'table' }
  }

  if (oppErr && !isMissingTable(error)) return { quotes: [], error: oppErr, storage: 'metadata' }
  return { quotes: [], error: null, storage: 'metadata' }
}

function nextQuoteNo(existingQuotes) {
  const year = new Date().getFullYear()
  const prefix = `HQ-${year}-`
  let max = 0
  for (const q of existingQuotes || []) {
    const m = String(q.quotation_no || '').match(/HQ-\d{4}-(\d+)/i)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return prefix + String(max + 1).padStart(4, '0')
}

export async function saveQuotation(opts) {
  if (!opts.opportunityId) return { quote: null, error: { message: 'Missing opportunity id' } }

  const { data: opp, error: loadErr } = await supabase
    .from('opportunities')
    .select('id, metadata, company_id')
    .eq('id', opts.opportunityId)
    .single()
  if (loadErr) return { quote: null, error: loadErr }

  const meta = { ...(opp.metadata || {}) }
  let quotes = Array.isArray(meta.quotes) ? meta.quotes.slice() : []

  if (opts.supersedePreviousId) {
    quotes = quotes.map(q =>
      q.id === opts.supersedePreviousId ? { ...q, status: 'superseded' } : q
    )
  }

  const items = (opts.items || []).map(normalizeItem)
  const customerTotal = quoteCustomerTotal(items)
  const transferTotal = quoteTransferTotal(items)
  const margin = quoteMargin(items)
  const groups = quoteGroups(items)

  const id = 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const version = opts.version || 1
  const quotation_no =
    opts.quotation_no ||
    (opts.supersedePreviousId
      ? (quotes.find(q => q.id === opts.supersedePreviousId)?.quotation_no || nextQuoteNo(quotes))
      : nextQuoteNo(quotes))

  const idMap = {}
  items.forEach((it, i) => {
    const newId = String(it.id || '').startsWith('tmp_') ? id + '_i' + i : it.id
    idMap[it.id] = newId
  })

  const rowItems = items
    .filter(it => (it.product_name || '').trim() || it.line_type === 'charge')
    .map((it, i) => ({
      ...it,
      id: idMap[it.id] || it.id,
      parent_id: it.parent_id && idMap[it.parent_id] ? idMap[it.parent_id] : it.parent_id,
      quantity: Number(it.quantity) || 1,
      transfer_price: it.transfer_price !== '' && it.transfer_price != null ? Number(it.transfer_price) : null,
      customer_price: it.customer_price !== '' && it.customer_price != null ? Number(it.customer_price) : null,
      margin_pct: it.margin_pct !== '' && it.margin_pct != null ? Number(it.margin_pct) : null,
      min_margin_pct: it.min_margin_pct !== '' && it.min_margin_pct != null ? Number(it.min_margin_pct) : null,
      sort_order: i,
    }))

  const quote = {
    id,
    opportunity_id: opts.opportunityId,
    company_id: opts.companyId || opp.company_id,
    quotation_no,
    version,
    status: opts.status || 'draft',
    validity_date: opts.validity_date || null,
    delivery_tat: opts.delivery_tat || null,
    payment_terms: opts.payment_terms || null,
    transport_terms: opts.transport_terms || null,
    special_terms: opts.special_terms || null,
    revision_reason: opts.revision_reason || null,
    no_regret_price: !!opts.no_regret_price,
    total_value: customerTotal,
    transfer_total: transferTotal,
    margin_amount: margin.amount,
    margin_pct: margin.pct,
    currency: 'INR',
    notes: opts.notes || null,
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
      summary: `${quotation_no} V${version} · Cust ₹${customerTotal.toLocaleString()} · Xfer ₹${transferTotal.toLocaleString()}`,
      payload: { quotation_no, version, customerTotal, transferTotal },
    })
  } catch (_) {}

  return { quote, error: null, storage: 'metadata' }
}

export async function updateQuoteStatus(id, status, opportunityId) {
  if (!opportunityId) return { error: { message: 'Missing opportunity id' } }
  const { data: opp, error: loadErr } = await supabase
    .from('opportunities').select('metadata').eq('id', opportunityId).single()
  if (loadErr) return { error: loadErr }
  const meta = { ...(opp.metadata || {}) }
  meta.quotes = (meta.quotes || []).map(q => (q.id === id ? { ...q, status } : q))
  const { error } = await supabase.from('opportunities').update({ metadata: meta }).eq('id', opportunityId)
  if (!error) {
    try {
      await logActivity({ entityType: 'quotation', entityId: id, action: 'quote_status', summary: `Status → ${status}` })
    } catch (_) {}
  }
  return { error }
}

/** Default GST % for customer-facing quote export (Excel / paste) */
export const DEFAULT_TAX_PCT = 18

/**
 * Build Excel-ready TSV for a quotation.
 * Columns: Item name | Customer Rate | Qty | Tax % | Tax Amount | Total amount
 * Product naming with upgrades: Base (brand) + Upgrade1 + Upgrade2 [incl. N upgrades]
 */
export function formatQuoteForExcel(quote, taxPct = DEFAULT_TAX_PCT) {
  const items = quote?.quotation_items || []
  const groups = quoteGroups(items)
  const charges = items.filter(it => it.line_type === 'charge')
  const tax = Number(taxPct) || 0
  const rows = []
  rows.push(['Item name', 'Customer Rate', 'Qty', 'Tax %', 'Tax Amount', 'Total amount'].join('\t'))
  let subtotal = 0
  for (const g of groups) {
    const qty = g.qty || 1
    const lineTotal = Number(g.customerTotal) || 0
    const rate = qty > 0 ? Math.round((lineTotal / qty) * 100) / 100 : lineTotal
    const taxAmt = Math.round(lineTotal * tax / 100 * 100) / 100
    const total = Math.round((lineTotal + taxAmt) * 100) / 100
    subtotal += lineTotal
    rows.push([g.mergedDescription || 'Product', rate, qty, tax, taxAmt, total].join('\t'))
  }
  for (const c of charges) {
    if (c.billing === 'off_invoice') {
      rows.push([(c.product_name || c.charge_kind || 'Charge') + ' (off invoice)', Number(c.customer_price) || 0, Number(c.quantity) || 1, 0, 0, 0].join('\t'))
      continue
    }
    const qty = Number(c.quantity) || 1
    const rate = Number(c.customer_price) || 0
    const lineTotal = Math.round(qty * rate * 100) / 100
    const taxAmt = Math.round(lineTotal * tax / 100 * 100) / 100
    const total = Math.round((lineTotal + taxAmt) * 100) / 100
    subtotal += lineTotal
    rows.push([c.product_name || c.charge_kind || 'Charge', rate, qty, tax, taxAmt, total].join('\t'))
  }
  const taxTotal = Math.round(subtotal * tax / 100 * 100) / 100
  const grand = Math.round((subtotal + taxTotal) * 100) / 100
  rows.push(['', '', '', '', '', ''].join('\t'))
  rows.push(['Subtotal (ex-tax)', '', '', '', '', subtotal].join('\t'))
  rows.push([`Tax (${tax}%)`, '', '', '', '', taxTotal].join('\t'))
  rows.push(['Grand total', '', '', '', '', grand].join('\t'))
  const header = [`Quotation\t${quote?.quotation_no || ''}\tVersion\tV${quote?.version || 1}`, `Status\t${quote?.status || ''}\tCurrency\t${quote?.currency || 'INR'}`, ''].join('\n')
  return header + '\n' + rows.join('\n')
}
