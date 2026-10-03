import { supabase } from '../supabase'
import { logActivity } from './activityLog'

export const QUOTE_STATUS = ['draft', 'sent', 'accepted', 'rejected', 'superseded']

/** line_type: product (base) | upgrade (sub-item) | charge (install/warranty/transport/other) */
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

export function lineCustomerTotal(item) {
  const q = Number(item.quantity) || 0
  const p = Number(item.customer_price ?? item.unit_price) || 0
  if (item.billing === 'off_invoice') return 0
  return Math.round(q * p * 100) / 100
}

export function lineTransferTotal(item) {
  const q = Number(item.quantity) || 0
  const p = Number(item.transfer_price ?? item.cost_price) || 0
  return Math.round(q * p * 100) / 100
}

export function quoteCustomerTotal(items) {
  return items.reduce((s, it) => s + lineCustomerTotal(it), 0)
}

export function quoteTransferTotal(items) {
  return items.reduce((s, it) => s + lineTransferTotal(it), 0)
}

export function quoteMargin(items) {
  const sell = quoteCustomerTotal(items)
  const cost = quoteTransferTotal(items)
  const m = Math.round((sell - cost) * 100) / 100
  const pct = sell > 0 ? Math.round((m / sell) * 1000) / 10 : 0
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
    line_type: it.line_type || 'product',
    billing: it.billing || 'on_bill',
  }
}

export async function loadQuotesForOpp(opportunityId) {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, quotation_items(*)')
    .eq('opportunity_id', opportunityId)
    .order('version', { ascending: false })

  if (!error) {
    const quotes = (data || []).map(q => ({
      ...q,
      quotation_no: q.quotation_no || q.metadata?.quotation_no || `V${q.version}`,
      quotation_items: (q.quotation_items || [])
        .map(it => normalizeItem({
          ...it,
          customer_price: it.unit_price,
          transfer_price: it.cost_price,
          line_type: it.notes?.startsWith('[upgrade]') ? 'upgrade' : it.notes?.startsWith('[charge]') ? 'charge' : 'product',
        }))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    }))
    return { quotes, error: null, storage: 'table' }
  }

  if (!isMissingTable(error)) {
    return { quotes: [], error, storage: 'table' }
  }

  const { data: opp, error: oppErr } = await supabase
    .from('opportunities')
    .select('id, metadata')
    .eq('id', opportunityId)
    .single()
  if (oppErr) return { quotes: [], error: oppErr, storage: 'metadata' }
  const quotes = (Array.isArray(opp?.metadata?.quotes) ? opp.metadata.quotes : []).map(q => ({
    ...q,
    quotation_items: (q.quotation_items || []).map(normalizeItem),
  }))
  quotes.sort((a, b) => (b.version || 0) - (a.version || 0))
  return { quotes, error: null, storage: 'metadata' }
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

async function saveToMetadata(opts) {
  const { data: opp, error: loadErr } = await supabase
    .from('opportunities')
    .select('id, metadata')
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

  const id = 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const quotation_no = opts.quotation_no || nextQuoteNo(quotes)

  const rowItems = items
    .filter(it => (it.product_name || '').trim() || it.line_type === 'charge')
    .map((it, i) => ({
      ...it,
      id: it.id?.startsWith('tmp_') ? id + '_i' + i : it.id,
      quantity: Number(it.quantity) || 1,
      transfer_price: it.transfer_price !== '' && it.transfer_price != null ? Number(it.transfer_price) : null,
      customer_price: it.customer_price !== '' && it.customer_price != null ? Number(it.customer_price) : null,
      line_total: lineCustomerTotal(it),
      cost_total: lineTransferTotal(it),
      sort_order: i,
    }))

  const quote = {
    id,
    opportunity_id: opts.opportunityId,
    company_id: opts.companyId,
    quotation_no,
    version: opts.version || 1,
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
    quotation_items: rowItems,
    created_at: new Date().toISOString(),
  }
  quotes.push(quote)
  meta.quotes = quotes

  const patch = { metadata: meta }
  if (customerTotal > 0) patch.deal_size = customerTotal

  const { error } = await supabase.from('opportunities').update(patch).eq('id', opts.opportunityId)
  if (error) return { quote: null, error }

  await logActivity({
    entityType: 'quotation',
    entityId: opts.opportunityId,
    action: (opts.version || 1) > 1 ? 'quote_revised' : 'quote_created',
    summary: `${quotation_no} V${opts.version} · Cust ₹${customerTotal.toLocaleString()} · Xfer ₹${transferTotal.toLocaleString()} · Mgn ${margin.pct}%`,
    payload: { quotation_no, version: opts.version, customerTotal, transferTotal },
  })

  return { quote, error: null, storage: 'metadata' }
}

export async function saveQuotation(opts) {
  const metaResult = await saveToMetadata(opts)
  if (!metaResult.error) return metaResult

  const items = (opts.items || []).map(normalizeItem)
  const customerTotal = quoteCustomerTotal(items)
  const payload = {
    opportunity_id: opts.opportunityId,
    company_id: opts.companyId,
    version: opts.version || 1,
    status: opts.status || 'draft',
    validity_date: opts.validity_date || null,
    delivery_tat: opts.delivery_tat || null,
    payment_terms: opts.payment_terms || null,
    transport_terms: opts.transport_terms || null,
    special_terms: opts.special_terms || null,
    revision_reason: opts.revision_reason || null,
    no_regret_price: !!opts.no_regret_price,
    total_value: customerTotal,
    currency: 'INR',
    notes: opts.notes || null,
    state: 'active',
  }
  const { data: quote, error } = await supabase.from('quotations').insert(payload).select('*').single()
  if (error) return { quote: null, error: metaResult.error || error }

  const rows = items.filter(it => (it.product_name || '').trim()).map((it, i) => ({
    quotation_id: quote.id,
    product_name: it.product_name.trim(),
    specification: it.specification || null,
    brand: it.brand || null,
    model_part_no: it.model_part_no || null,
    quantity: Number(it.quantity) || 1,
    unit_price: it.customer_price !== '' ? Number(it.customer_price) : null,
    line_total: lineCustomerTotal(it),
    cost_price: it.transfer_price !== '' ? Number(it.transfer_price) : null,
    vendor: it.vendor || null,
    sort_order: i,
    notes: it.line_type !== 'product' ? `[${it.line_type}] ${it.notes || ''}` : (it.notes || null),
  }))
  if (rows.length) await supabase.from('quotation_items').insert(rows)
  if (opts.supersedePreviousId) {
    await supabase.from('quotations').update({ status: 'superseded' }).eq('id', opts.supersedePreviousId)
  }
  if (opts.opportunityId && customerTotal > 0) {
    await supabase.from('opportunities').update({ deal_size: customerTotal }).eq('id', opts.opportunityId)
  }
  return { quote, error: null, storage: 'table' }
}

export async function updateQuoteStatus(id, status, opportunityId) {
  if (!opportunityId) {
    const { error } = await supabase.from('quotations').update({ status }).eq('id', id)
    return { error }
  }
  const { data: opp, error: loadErr } = await supabase
    .from('opportunities').select('metadata').eq('id', opportunityId).single()
  if (loadErr) return { error: loadErr }
  const meta = { ...(opp.metadata || {}) }
  meta.quotes = (meta.quotes || []).map(q => (q.id === id ? { ...q, status } : q))
  const { error } = await supabase.from('opportunities').update({ metadata: meta }).eq('id', opportunityId)
  if (!error) {
    await logActivity({ entityType: 'quotation', entityId: id, action: 'quote_status', summary: `Status → ${status}` })
  }
  await supabase.from('quotations').update({ status }).eq('id', id)
  return { error }
}
