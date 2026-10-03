import { supabase } from '../supabase'
import { logActivity } from './activityLog'

export const QUOTE_STATUS = ['draft', 'sent', 'accepted', 'rejected', 'superseded']

export function emptyItem() {
  return {
    product_name: '',
    specification: '',
    brand: '',
    model_part_no: '',
    quantity: 1,
    unit_price: '',
    cost_price: '',
    vendor: '',
    notes: '',
  }
}

export function lineTotal(item) {
  const q = Number(item.quantity) || 0
  const p = Number(item.unit_price) || 0
  return Math.round(q * p * 100) / 100
}

export function itemsTotal(items) {
  return items.reduce((s, it) => s + lineTotal(it), 0)
}

function isMissingTable(err) {
  if (!err) return false
  const m = (err.message || '') + ' ' + (err.code || '') + ' ' + (err.details || '')
  return /relation|does not exist|schema cache|Could not find the table|PGRST/i.test(m)
}

/** Load quotes: real tables first, else opportunity.metadata.quotes */
export async function loadQuotesForOpp(opportunityId) {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, quotation_items(*)')
    .eq('opportunity_id', opportunityId)
    .order('version', { ascending: false })

  if (!error) {
    const quotes = (data || []).map(q => ({
      ...q,
      quotation_items: (q.quotation_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
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
  const quotes = Array.isArray(opp?.metadata?.quotes) ? opp.metadata.quotes : []
  quotes.sort((a, b) => (b.version || 0) - (a.version || 0))
  return { quotes, error: null, storage: 'metadata' }
}

async function saveToMetadata({
  opportunityId,
  companyId,
  version,
  status,
  validity_date,
  delivery_tat,
  payment_terms,
  transport_terms,
  special_terms,
  revision_reason,
  no_regret_price,
  notes,
  items,
  supersedePreviousId,
}) {
  const { data: opp, error: loadErr } = await supabase
    .from('opportunities')
    .select('id, metadata, deal_size')
    .eq('id', opportunityId)
    .single()
  if (loadErr) return { quote: null, error: loadErr }

  const meta = { ...(opp.metadata || {}) }
  let quotes = Array.isArray(meta.quotes) ? meta.quotes.slice() : []

  if (supersedePreviousId) {
    quotes = quotes.map(q =>
      q.id === supersedePreviousId ? { ...q, status: 'superseded' } : q
    )
  }

  const total = itemsTotal(items)
  const id = 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const rowItems = (items || [])
    .filter(it => (it.product_name || '').trim())
    .map((it, i) => ({
      id: id + '_i' + i,
      product_name: it.product_name.trim(),
      specification: it.specification || null,
      brand: it.brand || null,
      model_part_no: it.model_part_no || null,
      quantity: Number(it.quantity) || 1,
      unit_price: it.unit_price !== '' && it.unit_price != null ? Number(it.unit_price) : null,
      line_total: lineTotal(it),
      cost_price: it.cost_price !== '' && it.cost_price != null ? Number(it.cost_price) : null,
      vendor: it.vendor || null,
      sort_order: i,
      notes: it.notes || null,
    }))

  const quote = {
    id,
    opportunity_id: opportunityId,
    company_id: companyId,
    version: version || 1,
    status: status || 'draft',
    validity_date: validity_date || null,
    delivery_tat: delivery_tat || null,
    payment_terms: payment_terms || null,
    transport_terms: transport_terms || null,
    special_terms: special_terms || null,
    revision_reason: revision_reason || null,
    no_regret_price: !!no_regret_price,
    total_value: total,
    currency: 'INR',
    notes: notes || null,
    quotation_items: rowItems,
    created_at: new Date().toISOString(),
  }
  quotes.push(quote)
  meta.quotes = quotes

  const patch = { metadata: meta }
  if (total > 0) patch.deal_size = total

  const { error } = await supabase.from('opportunities').update(patch).eq('id', opportunityId)
  if (error) return { quote: null, error }

  await logActivity({
    entityType: 'quotation',
    entityId: opportunityId,
    action: version > 1 ? 'quote_revised' : 'quote_created',
    summary: `Quote V${version} · ₹${total.toLocaleString()} · ${rowItems.length} line(s) [metadata]`,
    payload: { opportunity_id: opportunityId, version, total_value: total, storage: 'metadata' },
  })

  return { quote, error: null, storage: 'metadata' }
}

export async function saveQuotation(opts) {
  const total = itemsTotal(opts.items || [])
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
    total_value: total,
    currency: 'INR',
    notes: opts.notes || null,
    state: 'active',
  }

  const { data: quote, error } = await supabase.from('quotations').insert(payload).select('*').single()

  if (error) {
    if (isMissingTable(error)) {
      return saveToMetadata(opts)
    }
    return { quote: null, error }
  }

  const rows = (opts.items || [])
    .filter(it => (it.product_name || '').trim())
    .map((it, i) => ({
      quotation_id: quote.id,
      product_name: it.product_name.trim(),
      specification: it.specification || null,
      brand: it.brand || null,
      model_part_no: it.model_part_no || null,
      quantity: Number(it.quantity) || 1,
      unit_price: it.unit_price !== '' && it.unit_price != null ? Number(it.unit_price) : null,
      line_total: lineTotal(it),
      cost_price: it.cost_price !== '' && it.cost_price != null ? Number(it.cost_price) : null,
      vendor: it.vendor || null,
      sort_order: i,
      notes: it.notes || null,
    }))

  if (rows.length) {
    const { error: itemErr } = await supabase.from('quotation_items').insert(rows)
    if (itemErr) return { quote, error: itemErr }
  }

  if (opts.supersedePreviousId) {
    await supabase.from('quotations').update({ status: 'superseded' }).eq('id', opts.supersedePreviousId)
  }

  if (opts.opportunityId && total > 0) {
    await supabase.from('opportunities').update({ deal_size: total }).eq('id', opts.opportunityId)
  }

  await logActivity({
    entityType: 'quotation',
    entityId: quote.id,
    action: (opts.version || 1) > 1 ? 'quote_revised' : 'quote_created',
    summary: `Quote V${opts.version} · ₹${total.toLocaleString()} · ${rows.length} line(s)`,
    payload: { opportunity_id: opts.opportunityId, version: opts.version, total_value: total },
  })

  return { quote, error: null, storage: 'table' }
}

export async function updateQuoteStatus(id, status, opportunityId) {
  const { error } = await supabase
    .from('quotations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (!error) {
    await logActivity({
      entityType: 'quotation',
      entityId: id,
      action: 'quote_status',
      summary: `Status → ${status}`,
    })
    return { error: null }
  }

  if (!isMissingTable(error) || !opportunityId) {
    return { error }
  }

  const { data: opp, error: loadErr } = await supabase
    .from('opportunities')
    .select('metadata')
    .eq('id', opportunityId)
    .single()
  if (loadErr) return { error: loadErr }
  const meta = { ...(opp.metadata || {}) }
  const quotes = (meta.quotes || []).map(q => (q.id === id ? { ...q, status } : q))
  meta.quotes = quotes
  const { error: upErr } = await supabase.from('opportunities').update({ metadata: meta }).eq('id', opportunityId)
  return { error: upErr || null }
}
