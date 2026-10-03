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

/** Load all quote revisions for an opportunity (newest first). */
export async function loadQuotesForOpp(opportunityId) {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, quotation_items(*)')
    .eq('opportunity_id', opportunityId)
    .order('version', { ascending: false })
  if (error) return { quotes: [], error }
  const quotes = (data || []).map(q => ({
    ...q,
    quotation_items: (q.quotation_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
  }))
  return { quotes, error: null }
}

/** Create first quote or a new revision. */
export async function saveQuotation({
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
  const total = itemsTotal(items)
  const payload = {
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
    state: 'active',
  }

  const { data: quote, error } = await supabase.from('quotations').insert(payload).select('*').single()
  if (error) return { quote: null, error }

  const rows = (items || [])
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

  if (supersedePreviousId) {
    await supabase.from('quotations').update({ status: 'superseded' }).eq('id', supersedePreviousId)
  }

  if (opportunityId && total > 0) {
    await supabase.from('opportunities').update({ deal_size: total }).eq('id', opportunityId)
  }

  await logActivity({
    entityType: 'quotation',
    entityId: quote.id,
    action: version > 1 ? 'quote_revised' : 'quote_created',
    summary: `Quote V${version} · ₹${total.toLocaleString()} · ${rows.length} line(s)`,
    payload: { opportunity_id: opportunityId, version, total_value: total },
  })

  return { quote, error: null }
}

export async function updateQuoteStatus(id, status) {
  const { error } = await supabase.from('quotations').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (!error) {
    await logActivity({
      entityType: 'quotation',
      entityId: id,
      action: 'quote_status',
      summary: `Status → ${status}`,
    })
  }
  return { error }
}
