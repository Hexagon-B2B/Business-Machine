import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, oppStageLabel, isOppOpen } from '../constants'
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
      <Field label="Primary contact"><select className="input" value={form.primary_contact_id} onChange={e => setForm({ ...form, primary_contact_id: e.target.value })}><option value="">—</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field>
      <FirstQuoteFields />
    </>
  )
}

export function OpportunityDetail({ opportunity, contacts = [], onClose, onSaved, goCompany }) {
  const [row, setRow] = useState(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [showQuote, setShowQuote] = useState(true)
  const [dispatchForm, setDispatchForm] = useState({ label: '', location: '', qty_note: '', invoice_no: '', transport_cost: '', other_cost: '', notes: '' })
  const [dispatchBusy, setDispatchBusy] = useState(false)
  useEffect(() => {
    if (!opportunity) { setRow(null); return }
    setRow({
      ...opportunity,
      solution: opportunity.pain_points || opportunity.metadata?.solution || '',
      next_action: opportunity.metadata?.next_action || '',
      next_action_due: String(opportunity.metadata?.next_action_due || '').slice(0, 10),
      lost_reason: opportunity.lost_reason || '',
      expected_close_date: String(opportunity.expected_close_date || '').slice(0, 10),
    })
    setShowQuote(true)
  }, [opportunity?.id])
  async function saveDeal(e) {
    e.preventDefault()
    if (!row?.id || saving) return
    setSaving(true)
    const meta = { ...(row.metadata || {}), next_action: row.next_action || null, next_action_due: row.next_action_due || null, solution: row.solution || null }
    const payload = {
      stage: row.stage,
      deal_size: row.deal_size != null && row.deal_size !== '' ? Number(row.deal_size) : null,
      expected_close_date: row.expected_close_date || null,
      requirement_description: row.requirement_description || null,
      pain_points: row.solution || null,
      lost_reason: row.stage === 'lost' ? (row.lost_reason || null) : null,
      primary_contact_id: row.primary_contact_id || null, metadata: meta,
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
  async function addDispatch(e) {
    e.preventDefault()
    if (!row?.id || dispatchBusy) return
    if (!(dispatchForm.label || '').trim()) { setFlash('Dispatch label is required.'); return }
    setDispatchBusy(true)
    const list = Array.isArray(row.metadata?.dispatches) ? row.metadata.dispatches.slice() : []
    const entry = {
      id: 'd_' + Date.now().toString(36),
      label: dispatchForm.label.trim(),
      location: (dispatchForm.location || '').trim(),
      qty_note: (dispatchForm.qty_note || '').trim(),
      invoice_no: (dispatchForm.invoice_no || '').trim(),
      transport_cost: dispatchForm.transport_cost !== '' ? Number(dispatchForm.transport_cost) : null,
      other_cost: dispatchForm.other_cost !== '' ? Number(dispatchForm.other_cost) : null,
      notes: (dispatchForm.notes || '').trim(),
      created_at: new Date().toISOString(),
    }
    list.push(entry)
    const meta = { ...(row.metadata || {}), dispatches: list }
    const { error } = await supabase.from('opportunities').update({ metadata: meta }).eq('id', row.id)
    setDispatchBusy(false)
    if (error) { setFlash('Dispatch save failed: ' + error.message); return }
    setRow({ ...row, metadata: meta })
    setDispatchForm({ label: '', location: '', qty_note: '', invoice_no: '', transport_cost: '', other_cost: '', notes: '' })
    setFlash('Dispatch / invoice split saved.')
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
  return (
    <div>
      {flash && <div className="notice" style={{ marginBottom: 10 }}>{flash}</div>}
      <div style={{ marginBottom: 14, padding: '14px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
          {row.name || 'Opportunity'}
        </div>
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
          <Field label="Stage"><select className="input" value={row.stage || 'requirement'} onChange={e => setRow({ ...row, stage: e.target.value })}>{OPP_STAGES.map(s => <option key={s} value={s}>{oppStageLabel(s)}</option>)}</select></Field>
          <Field label="Deal size"><input className="input" type="number" value={row.deal_size ?? ''} onChange={e => setRow({ ...row, deal_size: e.target.value })} /></Field>
        </div>
        {row.stage === 'lost' && <Field label="Lost reason *"><input className="input" required value={row.lost_reason || ''} onChange={e => setRow({ ...row, lost_reason: e.target.value })} /></Field>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Expected close"><input className="input" type="date" value={row.expected_close_date || ''} onChange={e => setRow({ ...row, expected_close_date: e.target.value })} /></Field>
          <Field label="Next action due"><input className="input" type="date" value={row.next_action_due || ''} onChange={e => setRow({ ...row, next_action_due: e.target.value })} /></Field>
        </div>
        <Field label="Next action"><input className="input" value={row.next_action || ''} onChange={e => setRow({ ...row, next_action: e.target.value })} /></Field>
        <Field label="Primary contact"><select className="input" value={row.primary_contact_id || ''} onChange={e => setRow({ ...row, primary_contact_id: e.target.value })}><option value="">—</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {goCompany && row.company_id && <button type="button" className="btn" onClick={() => goCompany(row.company_id)}>Open company</button>}
          <button type="button" className="btn" onClick={() => setShowQuote(s => !s)}>{showQuote ? 'Hide quotations' : 'Show quotations'}</button>
          <button type="button" className="btn" onClick={onClose}>← Back to list</button>
        </div>
        <Actions saving={saving} onCancel={onClose} label="Save deal details" />
      </form>

      {row.stage === 'won' && (
        <div style={{ marginTop: 16, padding: 14, border: '1px solid #bbf7d0', borderRadius: 10, background: '#f0fdf4' }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Dispatch & invoices (Won)</div>
          <div style={{ fontSize: 12, color: '#166534', marginBottom: 10 }}>
            Split quantity across locations or staggered invoices. Record transport / extra costs per split.
          </div>
          {(row.metadata?.dispatches || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12, background: '#fff', borderRadius: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Label</th>
                  <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Location</th>
                  <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Qty / split note</th>
                  <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Invoice #</th>
                  <th style={{ textAlign: 'right', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Costs</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(row.metadata?.dispatches || []).map(d => (
                  <tr key={d.id}>
                    <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>{d.label}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{d.location || '—'}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{d.qty_note || '—'}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{d.invoice_no || '—'}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                      {[d.transport_cost != null ? `T ₹${Number(d.transport_cost).toLocaleString('en-IN')}` : null,
                        d.other_cost != null ? `O ₹${Number(d.other_cost).toLocaleString('en-IN')}` : null].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>
                      <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => removeDispatch(d.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form onSubmit={addDispatch}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
              <Field label="Split label *"><input className="input" value={dispatchForm.label} onChange={e => setDispatchForm(f => ({ ...f, label: e.target.value }))} placeholder="Invoice 1 / Site A" /></Field>
              <Field label="Location"><input className="input" value={dispatchForm.location} onChange={e => setDispatchForm(f => ({ ...f, location: e.target.value }))} placeholder="City / site" /></Field>
              <Field label="Qty / split note"><input className="input" value={dispatchForm.qty_note} onChange={e => setDispatchForm(f => ({ ...f, qty_note: e.target.value }))} placeholder="e.g. 12 of 20 units" /></Field>
              <Field label="Invoice no"><input className="input" value={dispatchForm.invoice_no} onChange={e => setDispatchForm(f => ({ ...f, invoice_no: e.target.value }))} /></Field>
              <Field label="Transport cost ₹"><input className="input" type="number" value={dispatchForm.transport_cost} onChange={e => setDispatchForm(f => ({ ...f, transport_cost: e.target.value }))} /></Field>
              <Field label="Other cost ₹"><input className="input" type="number" value={dispatchForm.other_cost} onChange={e => setDispatchForm(f => ({ ...f, other_cost: e.target.value }))} /></Field>
            </div>
            <Field label="Notes"><input className="input" value={dispatchForm.notes} onChange={e => setDispatchForm(f => ({ ...f, notes: e.target.value }))} /></Field>
            <button type="submit" className="btn primary" disabled={dispatchBusy}>{dispatchBusy ? 'Saving…' : '+ Add dispatch / invoice split'}</button>
          </form>
        </div>
      )}

      {showQuote && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>2. Quotations</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Optional until you are ready. Use <strong>Copy for Excel</strong> on each quote — includes Validity and Delivery TAT.</div>
          <QuotationPanel
            opportunity={row}
            onTotalChange={(total) => {
              if (total != null) setRow(r => (r ? { ...r, deal_size: total } : r))
            }}
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
  let { data, error } = await supabase.from('opportunities').insert(payload).select('id').single()
  if (error && /primary_contact|column/i.test(error.message)) {
    delete payload.primary_contact_id
    ;({ data, error } = await supabase.from('opportunities').insert(payload).select('id').single())
  }
  if (error) return { data, error }
  if ((form.next_action || '').trim() && form.next_action_due) {
    await supabase.from('tasks').insert({
      company_id: companyId,
      title: ('Opp next action: ' + form.next_action).slice(0, 200),
      description: 'From opportunity: ' + (payload.name || ''),
      due_at: form.next_action_due, priority: 'medium', status: 'open', source: 'user', state: 'active',
    })
  }
  const items = Array.isArray(form.quote_items) ? form.quote_items : []
  const hasLines = items.some(it => (it.product_name || '').trim() || (it.line_type === 'charge' && (Number(it.customer_price) || 0) > 0))
  if (hasLines && data?.id) {
    const { error: qErr } = await saveQuotation({
      opportunityId: data.id, companyId, items, status: 'draft',
      validity_date: form.validity_date || null, delivery_tat: form.delivery_tat || null,
      payment_terms: form.payment_terms || null, transport_terms: form.transport_terms || null,
    })
    if (qErr) console.warn('First quote save:', qErr.message)
  }
  return { data, error: null }
}
