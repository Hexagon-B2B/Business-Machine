import { supabase } from '../supabase'
import { logActivity } from './activityLog'
import {
  emptyItem, groupRollup, quoteGroups, quoteCustomerTotal, quoteTransferTotal, quoteMargin, customerQuoteNo,
  normalizeItem, nextQuoteNo, lineCustomerTotal, DEFAULT_TAX_PCT,
} from './quotationMath'

export async function loadQuotesForOpp(opportunityId) {
  if (!opportunityId) return { quotes: [], error: { message: 'No opportunity id' }, storage: 'metadata' }
  const { data: opp, error: oppErr } = await supabase.from('opportunities').select('id, metadata').eq('id', opportunityId).single()
  if (!oppErr && opp) {
    const quotes = (Array.isArray(opp?.metadata?.quotes) ? opp.metadata.quotes : []).map(q => ({
      ...q, quotation_items: (q.quotation_items || []).map(normalizeItem),
    }))
    quotes.sort((a, b) => (b.version || 0) - (a.version || 0))
    if (quotes.length) return { quotes, error: null, storage: 'metadata' }
  }
  const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('opportunity_id', opportunityId).order('version', { ascending: false })
  if (!error && data && data.length) {
    return {
      quotes: data.map(q => ({ ...q, quotation_items: (q.quotation_items || []).map(normalizeItem) })),
      error: null, storage: 'table',
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
    ? (Number((quotes.find(q => q.id === opts.supersedePreviousId) || {}).version) || 1) + 1 : 1
  const quotation_no = opts.supersedePreviousId
    ? (quotes.find(q => q.id === opts.supersedePreviousId) || {}).quotation_no || nextQuoteNo(quotes)
    : nextQuoteNo(quotes)
  const idMap = {}
  items.forEach(it => {
    const raw = String(it.id || '')
    idMap[it.id] = raw.startsWith('tmp_') ? 'li_' + Math.random().toString(36).slice(2, 10) : (it.id || ('li_' + Math.random().toString(36).slice(2, 10)))
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
    delivery_location: opts.delivery_location || null,
    special_terms: opts.special_terms || null, revision_reason: opts.revision_reason || null,
    no_regret_price: !!opts.no_regret_price, total_value: customerTotal, transfer_total: transferTotal,
    margin_amount: margin.amount, margin_pct: margin.pct, currency: 'INR', notes: opts.notes || null,
    commercial_lines: groups.map(g => ({
      description: g.mergedDescription, transfer_total: g.transferTotal, customer_total: g.customerTotal,
      margin_pct: g.marginPct, min_margin_pct: g.minMarginPct, below_min: g.belowMin, upgrade_count: g.upgrades.length,
    })),
    quotation_items: rowItems, created_at: new Date().toISOString(),
  }
  quotes.push(quote)
  meta.quotes = quotes
  const patch = { metadata: meta }
  if (customerTotal > 0) patch.deal_size = customerTotal
  const { error } = await supabase.from('opportunities').update(patch).eq('id', opts.opportunityId)
  if (error) return { quote: null, error }
  try {
    await logActivity({
      entityType: 'quotation', entityId: opts.opportunityId,
      action: version > 1 ? 'quote_revised' : 'quote_created',
      summary: customerQuoteNo(quote) + ' · Cust ₹' + customerTotal.toLocaleString('en-IN'),
    })
  } catch (_) {}
  return { quote, error: null }
}

export async function updateQuoteStatus(opportunityId, quoteId, status) {
  const { data: opp, error: loadErr } = await supabase.from('opportunities').select('id, metadata').eq('id', opportunityId).single()
  if (loadErr) return { error: loadErr }
  const meta = { ...(opp.metadata || {}) }
  const quotes = (Array.isArray(meta.quotes) ? meta.quotes : []).map(q => q.id === quoteId ? { ...q, status } : q)
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
    lines.push([sl++, (g.base.brand || '').trim(), g.mergedDescription, rate, g.qty, g.customerTotal].join('\t'))
    subtotal += g.customerTotal
  }
  const optional = groups.filter(g => g.isOptional)
  if (optional.length) {
    lines.push('')
    lines.push('Optional items')
    for (const g of optional) {
      const rate = g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : g.customerTotal
      lines.push([sl++, (g.base.brand || '').trim(), g.mergedDescription, rate, g.qty, g.customerTotal].join('\t'))
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
