import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, oppStageLabel, isOppOpen, normalizeOppStage } from '../constants'
import { Field, Actions, Badge } from '../ui'
import QuotationPanel from './QuotationPanel'
import { logActivity } from '../lib/activityLog'
import {
  emptyItem, emptyUpgrade, emptyCharge,
  saveQuotation, quoteCustomerTotal, groupRollup, lineTransferTotal,
} from '../lib/quotations'

export function buildOppCreatePayload({ company_id, form }) {
  return {
    company_id,
    name: (form.name || '').trim() || (form.requirement_description || '').trim().slice(0, 80),
    stage: form.stage || 'requirement',
    deal_size: form.deal_size ? Number(form.deal_size) : null,
    expected_close_date: form.expected_close_date || null,
    requirement_description: (form.requirement_description || '').trim(),
    pain_points: (form.solution || '').trim() || null,
    primary_contact_id: form.primary_contact_id || null,
    state: 'active',
    metadata: {
      next_action: (form.next_action || '').trim() || null,
      next_action_due: form.next_action_due || null,
      solution: (form.solution || '').trim() || null,
    },
  }
}

export function emptyOppForm() {
  return {
    company_id: '', name: '', stage: 'requirement', deal_size: '',
    expected_close_date: '', requirement_description: '', solution: '',
    next_action: '', next_action_due: '', primary_contact_id: '', lost_reason: '',
    validity_date: '', delivery_tat: '', payment_terms: '', transport_terms: '',
    quote_items: [emptyItem({ line_type: 'product' })],
  }
}
export const EMPTY_OPP_FORM = emptyOppForm()

export function FirstQuoteFields() {
  return (
    <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
      Quotation is <strong>optional</strong> at create. After the opportunity is saved, open it to add products, charges, validity, delivery TAT, and use <strong>Copy for Excel</strong>.
    </div>
  )
}

export function OpportunityCreateFields({ form, setForm, contacts = [] }) {
  return (
    <>
      <Field label="Name"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Requirement *"><textarea className="input" required rows={3} value={form.requirement_description} onChange={e => setForm({ ...form, requirement_description: e.target.value })} /></Field>
      <Field label="Solution"><textarea className="input" rows={2} value={form.solution} onChange={e => setForm({ ...form, solution: e.target.value })} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Stage"><select className="input" value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>{OPP_STAGES.filter(s => isOppOpen(s)).map(s => <option key={s} value={s}>{oppStageLabel(s)}</option>)}</select></Field>
        <Field label="Deal size"><input className="input" type="number" value={form.deal_size} onChange={e => setForm({ ...form, deal_size: e.target.value })} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Expected close"><input className="input" type="date" value={form.expected_close_date} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} /></Field>
        <Field label="Next action due"><input className="input" type="date" value={form.next_action_due} onChange={e => setForm({ ...form, next_action_due: e.target.value })} /></Field>
      </div>
      <Field label="Next action"><input className="input" value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} /></Field>
      <Field label="Primary contact *">
        <select className="input" required value={form.primary_contact_id} onChange={e => setForm({ ...form, primary_contact_id: e.target.value })}>
          <option value="">— Select primary contact —</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.job_title ? ` · ${c.job_title}` : ''}</option>)}
        </select>
        {!contacts.length && form.company_id && (
          <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>No contacts on this company yet. Open the company and add a contact first.</div>
        )}
      </Field>
      <FirstQuoteFields />
    </>
  )
}

export function OpportunityDetail({ opportunity, contacts = [], onClose, onSaved, goCompany }) {
  const [row, setRow] = useState(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [showQuote, setShowQuote] = useState(true)
  const [loadedContacts, setLoadedContacts] = useState([])
  const [dispatchForm, setDispatchForm] = useState({
    label: '', location: '', invoice_no: '', invoice_date: '', dispatched_date: '',
    transport_cost: '', other_cost: '', notes: '', lines: {},
  })
  const [dispatchBusy, setDispatchBusy] = useState(false)

  useEffect(() => {
    if (!opportunity) { setRow(null); return }
    let cancelled = false
    async function hydrate() {
      let companies = opportunity.companies || opportunity.company || null
      if (opportunity.company_id && !(companies?.legal_name || companies?.name)) {
        const { data } = await supabase.from('companies')
          .select('id, name, legal_name, city')
          .eq('id', opportunity.company_id)
          .maybeSingle()
        if (data) companies = data
      }
      if (cancelled) return
      setRow({
        ...opportunity,
        companies: companies || opportunity.companies,
        legal_name: companies?.legal_name || opportunity.legal_name,
        city: companies?.city || opportunity.city,
        stage: normalizeOppStage(opportunity.stage) || opportunity.stage,
        solution: opportunity.pain_points || opportunity.metadata?.solution || '',
        next_action: opportunity.metadata?.next_action || '',
        next_action_due: String(opportunity.metadata?.next_action_due || '').slice(0, 10),
        lost_reason: opportunity.lost_reason || '',
        purchase_order_no: opportunity.metadata?.purchase_order_no || opportunity.purchase_order_no || '',
        invoice_no: opportunity.metadata?.invoice_no || opportunity.invoice_no || '',
        expected_close_date: String(opportunity.expected_close_date || '').slice(0, 10),
      })
      setShowQuote(true)
    }
    hydrate()
    return () => { cancelled = true }
  }, [opportunity?.id])

  useEffect(() => {
    const companyId = opportunity?.company_id
    if (!companyId) { setLoadedContacts([]); return }
    if (Array.isArray(contacts) && contacts.length > 0) { setLoadedContacts([]); return }
    let cancelled = false
    ;(async () => {
      let q = supabase.from('contacts').select('id, full_name, job_title, role, email, contact_status, company_id').eq('company_id', companyId).order('full_name')
      let { data, error } = await q
      if (error) {
        ;({ data } = await supabase.from('contacts').select('id, full_name, job_title, role, email, company_id').eq('company_id', companyId).order('full_name'))
      }
      if (cancelled) return
      const rows = (data || []).filter(c => {
        const st = (c.contact_status || 'active').toLowerCase()
        return st !== 'left' && st !== 'inactive'
      })
      setLoadedContacts(rows)
    })()
    return () => { cancelled = true }
  }, [opportunity?.company_id, opportunity?.id, contacts])

  const contactOptions = (Array.isArray(contacts) && contacts.length > 0) ? contacts : loadedContacts

  async function saveDeal(e) {
    e.preventDefault()
    if (!row?.id || saving) return
    if (!(row.primary_contact_id || '').trim()) {
      setFlash('Primary contact is required — select the person this quotation / deal is addressed to.')
      return
    }
    const stageNorm = normalizeOppStage(row.stage) || row.stage
    if (stageNorm === 'won' && !(row.purchase_order_no || '').trim()) {
      setFlash('Purchase order no is required when stage is Won (1 opportunity = 1 PO).')
      return
    }
    setSaving(true)
    const meta = {
      ...(row.metadata || {}),
      next_action: row.next_action || null,
      next_action_due: row.next_action_due || null,
      solution: row.solution || null,
      purchase_order_no: stageNorm === 'won' ? ((row.purchase_order_no || '').trim() || null) : (row.metadata?.purchase_order_no || null),
      invoice_no: stageNorm === 'won' ? ((row.invoice_no || '').trim() || null) : (row.metadata?.invoice_no || null),
    }
    const payload = {
      stage: stageNorm,
      deal_size: row.deal_size != null && row.deal_size !== '' ? Number(row.deal_size) : null,
      expected_close_date: row.expected_close_date || null,
      requirement_description: row.requirement_description || null,
      pain_points: row.solution || null,
      lost_reason: row.stage === 'lost' ? (row.lost_reason || null) : null,
      primary_contact_id: row.primary_contact_id || null,
      metadata: meta,
    }
    let { error } = await supabase.from('opportunities').update(payload).eq('id', row.id)
    if (error && /primary_contact|column/i.test(error.message)) {
      delete payload.primary_contact_id
      ;({ error } = await supabase.from('opportunities').update(payload).eq('id', row.id))
    }
    setSaving(false)
    if (error) { setFlash('Save failed: ' + error.message); return }
    setFlash('Deal details saved.')
    onSaved && onSaved({ keepOpen: true })
  }

  function productLinesForDispatch() {
    const quotes = row?.metadata?.quotes
    if (!Array.isArray(quotes) || !quotes.length) return []
    const latest = [...quotes].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
    const products = (latest?.quotation_items || []).filter(it => (it.line_type || 'product') === 'product')
    const allocated = {}
    for (const d of (row.metadata?.dispatches || [])) {
      for (const ln of (d.lines || [])) {
        const k = ln.item_id || ln.product_name
        allocated[k] = (allocated[k] || 0) + (Number(ln.qty) || 0)
      }
    }
    return products.map(p => {
      const total = Number(p.quantity) || 0
      const used = allocated[p.id] || allocated[p.product_name] || 0
      return { id: p.id, product_name: p.product_name || 'Product', brand: p.brand || '', total, remaining: Math.max(0, total - used) }
    })
  }

  async function addDispatch(e) {
    e.preventDefault()
    if (!row?.id || dispatchBusy) return
    if (!(dispatchForm.label || '').trim()) { setFlash('Dispatch label is required (e.g. Site A / Invoice 1).'); return }
    const lines = []
    for (const [itemId, qtyStr] of Object.entries(dispatchForm.lines || {})) {
      const qty = Number(qtyStr)
      if (!qty || qty <= 0) continue
      const pl = productLinesForDispatch().find(p => p.id === itemId)
      if (!pl) continue
      if (qty > pl.remaining + 0.0001) { setFlash(`Qty for ${pl.product_name} exceeds remaining (${pl.remaining}).`); return }
      lines.push({ item_id: pl.id, product_name: pl.product_name, brand: pl.brand, qty })
    }
    if (!lines.length) { setFlash('Enter quantity for at least one product line.'); return }
    setDispatchBusy(true)
    const list = Array.isArray(row.metadata?.dispatches) ? row.metadata.dispatches.slice() : []
    const entry = {
      id: 'd_' + Date.now().toString(36),
      label: dispatchForm.label.trim(),
      location: (dispatchForm.location || '').trim(),
      invoice_no: (dispatchForm.invoice_no || '').trim(),
      invoice_date: dispatchForm.invoice_date || null,
      dispatched_date: dispatchForm.dispatched_date || null,
      transport_cost: dispatchForm.transport_cost !== '' ? Number(dispatchForm.transport_cost) : null,
      other_cost: dispatchForm.other_cost !== '' ? Number(dispatchForm.other_cost) : null,
      notes: (dispatchForm.notes || '').trim(),
      lines,
      created_at: new Date().toISOString(),
    }
    list.push(entry)
    const meta = { ...(row.metadata || {}), dispatches: list }
    const { error } = await supabase.from('opportunities').update({ metadata: meta }).eq('id', row.id)
    setDispatchBusy(false)
    if (error) { setFlash('Dispatch save failed: ' + error.message); return }
    setRow({ ...row, metadata: meta })
    setDispatchForm({ label: '', location: '', invoice_no: '', invoice_date: '', dispatched_date: '', transport_cost: '', other_cost: '', notes: '', lines: {} })
    setFlash('Dispatch saved.')
    onSaved && onSaved({ keepOpen: true })
  }

  async function removeDispatch(id) {
    if (!row?.id) return
    const list = (row.metadata?.dispatches || []).filter(d => d.id !== id)
    const meta = { ...(row.metadata || {}), dispatches: list }
    const { error } = await supabase.from('opportunities').update({ metadata: meta }).eq('id', row.id)
    if (error) { setFlash('Remove failed: ' + error.message); return }
    setRow({ ...row, metadata: meta })
    setFlash('Dispatch removed.')
    onSaved && onSaved({ keepOpen: true })
  }

  if (!row) return null
  const stage = normalizeOppStage(row.stage) || row.stage || 'requirement'

  return (
    <div>
      {flash && <div className="notice" style={{ marginBottom: 10 }}>{flash}</div>}
      <div style={{ marginBottom: 14, padding: '14px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{row.name || 'Opportunity'}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {row.companies?.name || 'Company'}
          <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
          1. Deal details · 2. Quotations
        </div>
      </div>
      <form onSubmit={saveDeal}>
        <Field label="Requirement"><textarea className="input" rows={2} value={row.requirement_description || ''} onChange={e => setRow({ ...row, requirement_description: e.target.value })} /></Field>
        <Field label="Solution"><textarea className="input" rows={2} value={row.solution || ''} onChange={e => setRow({ ...row, solution: e.target.value })} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Stage">
            <select className="input" value={stage} onChange={e => setRow({ ...row, stage: e.target.value })}>
              {OPP_STAGES.map(s => <option key={s} value={s}>{oppStageLabel(s)}</option>)}
            </select>
          </Field>
          <Field label="Deal size"><input className="input" type="number" value={row.deal_size ?? ''} onChange={e => setRow({ ...row, deal_size: e.target.value })} /></Field>
        </div>
        {stage === 'lost' && <Field label="Lost reason *"><input className="input" required value={row.lost_reason || ''} onChange={e => setRow({ ...row, lost_reason: e.target.value })} /></Field>}
        {stage === 'won' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4, padding: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8 }}>
            <Field label="Purchase order no *">
              <input
                className="input"
                required
                value={row.purchase_order_no || ''}
                onChange={e => setRow({ ...row, purchase_order_no: e.target.value })}
                placeholder="Customer PO number"
              />
            </Field>
            <Field label="Invoice no">
              <input
                className="input"
                value={row.invoice_no || ''}
                onChange={e => setRow({ ...row, invoice_no: e.target.value })}
                placeholder="Invoice number (when billed)"
              />
            </Field>
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#047857' }}>
              Won = purchase order received. One opportunity = one PO.
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Expected close"><input className="input" type="date" value={row.expected_close_date || ''} onChange={e => setRow({ ...row, expected_close_date: e.target.value })} /></Field>
          <Field label="Next action due"><input className="input" type="date" value={row.next_action_due || ''} onChange={e => setRow({ ...row, next_action_due: e.target.value })} /></Field>
        </div>
        <Field label="Next action"><input className="input" value={row.next_action || ''} onChange={e => setRow({ ...row, next_action: e.target.value })} /></Field>
        <Field label="Primary contact *">
          <select className="input" required value={row.primary_contact_id || ''} onChange={e => setRow({ ...row, primary_contact_id: e.target.value })}>
            <option value="">— Select primary contact —</option>
            {contactOptions.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.job_title ? ` · ${c.job_title}` : ''}</option>)}
          </select>
          {!contactOptions.length && (
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>No contacts on this company yet. Open the company and add a contact, then return here.</div>
          )}
        </Field>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {goCompany && row.company_id && <button type="button" className="btn" onClick={() => goCompany(row.company_id)}>Open company</button>}
          <button type="button" className="btn" onClick={() => setShowQuote(s => !s)}>{showQuote ? 'Hide quotations' : 'Show quotations'}</button>
          <button type="button" className="btn" onClick={onClose}>← Back to list</button>
        </div>
        <Actions saving={saving} onCancel={onClose} label="Save deal details" />
      </form>

      {(stage === 'approved' || stage === 'won') && (
        <div style={{ marginTop: 16, padding: 14, border: '1px solid #bbf7d0', borderRadius: 10, background: '#f0fdf4' }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>
            {stage === 'approved' ? 'Dispatch on DC (Approved)' : 'Dispatch on Invoice (Won)'}
          </div>
          <div style={{ fontSize: 12, color: '#166534', marginBottom: 10 }}>
            Split multi-line quotations across sites or staggered invoices. Enter qty per product. Remaining qty is tracked automatically.
          </div>
          {productLinesForDispatch().length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>No quotation product lines yet — add a quote first.</div>
          ) : (
            <div style={{ marginBottom: 12, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Quote lines · remaining</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr><th style={{ textAlign: 'left', padding: 4 }}>Product</th><th style={{ textAlign: 'right', padding: 4 }}>Quoted</th><th style={{ textAlign: 'right', padding: 4 }}>Remaining</th></tr></thead>
                <tbody>
                  {productLinesForDispatch().map(p => (
                    <tr key={p.id}>
                      <td style={{ padding: 4 }}>{[p.brand, p.product_name].filter(Boolean).join(' · ')}</td>
                      <td style={{ padding: 4, textAlign: 'right' }}>{p.total}</td>
                      <td style={{ padding: 4, textAlign: 'right', fontWeight: 700, color: p.remaining > 0 ? '#065f46' : '#94a3b8' }}>{p.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(row.metadata?.dispatches || []).map(d => (
            <div key={d.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <strong>{d.label}</strong>
                  {d.location ? <span style={{ color: '#64748b' }}> · {d.location}</span> : null}
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {d.invoice_no ? `Inv ${d.invoice_no}` : 'No invoice #'}
                    {d.invoice_date ? ` · Inv date ${d.invoice_date}` : ''}
                    {d.dispatched_date ? ` · Dispatched ${d.dispatched_date}` : ''}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{(d.lines || []).map(ln => `${ln.product_name} × ${ln.qty}`).join(', ')}</div>
                </div>
                <button type="button" className="btn" style={{ fontSize: 12, color: '#991b1b' }} onClick={() => removeDispatch(d.id)}>Remove</button>
              </div>
            </div>
          ))}
          <form onSubmit={addDispatch} style={{ marginTop: 10, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Add dispatch</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Dispatch label *"><input className="input" value={dispatchForm.label} onChange={e => setDispatchForm(f => ({ ...f, label: e.target.value }))} placeholder="Site A / Invoice 1" /></Field>
              <Field label="Location"><input className="input" value={dispatchForm.location} onChange={e => setDispatchForm(f => ({ ...f, location: e.target.value }))} /></Field>
              <Field label="Invoice no"><input className="input" value={dispatchForm.invoice_no} onChange={e => setDispatchForm(f => ({ ...f, invoice_no: e.target.value }))} /></Field>
              <Field label="Invoice date"><input className="input" type="date" value={dispatchForm.invoice_date || ''} onChange={e => setDispatchForm(f => ({ ...f, invoice_date: e.target.value }))} /></Field>
              <Field label="Dispatched date"><input className="input" type="date" value={dispatchForm.dispatched_date || ''} onChange={e => setDispatchForm(f => ({ ...f, dispatched_date: e.target.value }))} /></Field>
              <Field label="Transport cost"><input className="input" type="number" value={dispatchForm.transport_cost} onChange={e => setDispatchForm(f => ({ ...f, transport_cost: e.target.value }))} /></Field>
              <Field label="Other cost"><input className="input" type="number" value={dispatchForm.other_cost} onChange={e => setDispatchForm(f => ({ ...f, other_cost: e.target.value }))} /></Field>
              <Field label="Notes"><input className="input" value={dispatchForm.notes} onChange={e => setDispatchForm(f => ({ ...f, notes: e.target.value }))} /></Field>
            </div>
            {productLinesForDispatch().map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: 13 }}>{[p.brand, p.product_name].filter(Boolean).join(' · ')} <span style={{ color: '#64748b' }}>(remaining {p.remaining})</span></div>
                <input className="input" style={{ width: 90 }} type="number" min={0} max={p.remaining} placeholder="Qty" value={dispatchForm.lines[p.id] ?? ''} onChange={e => setDispatchForm(f => ({ ...f, lines: { ...f.lines, [p.id]: e.target.value } }))} />
              </div>
            ))}
            <button type="submit" className="btn primary" disabled={dispatchBusy} style={{ marginTop: 8 }}>{dispatchBusy ? 'Saving…' : 'Add dispatch'}</button>
          </form>
        </div>
      )}

      {showQuote && (
        <div style={{ marginTop: 16 }}>
          <QuotationPanel
            opportunity={{
              ...row,
              _contacts: contactOptions,
              primary_contact_name: (contactOptions.find(c => String(c.id) === String(row.primary_contact_id)) || {}).full_name || '',
            }}
            onSaved={() => onSaved && onSaved({ keepOpen: true })}
          />
        </div>
      )}
    </div>
  )
}

export async function createOppWithOptionalTask(form, companyId) {
  const payload = buildOppCreatePayload({ company_id: companyId, form })
  if (!(payload.requirement_description || '').trim()) {
    return { data: null, error: { message: 'Requirement is required.' } }
  }
  if (!(form.primary_contact_id || '').trim()) {
    return { data: null, error: { message: 'Primary contact is required.' } }
  }
  let { data, error } = await supabase.from('opportunities').insert(payload).select('id').single()
  if (error && /primary_contact|column/i.test(error.message)) {
    delete payload.primary_contact_id
    ;({ data, error } = await supabase.from('opportunities').insert(payload).select('id').single())
  }
  if (error) return { data, error }
  if ((form.next_action || '').trim() && form.next_action_due) {
    await supabase.from('tasks').insert({
      company_id: companyId,
      title: form.next_action.trim(),
      due_date: form.next_action_due,
      status: 'open',
      priority: 'medium',
      opportunity_id: data?.id || null,
    })
  }
  try {
    await logActivity({ company_id: companyId, opportunity_id: data?.id, type: 'opportunity_created', summary: payload.name })
  } catch (_) {}
  return { data, error: null }
}
