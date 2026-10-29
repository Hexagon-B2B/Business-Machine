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

export function FirstQuoteFields({ form, setForm }) {
  return (
    <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>First quotation</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Field label="Quote validity"><input className="input" type="date" value={form.validity_date || ''} onChange={e => setForm({ ...form, validity_date: e.target.value })} /></Field>
        <Field label="Delivery TAT"><input className="input" value={form.delivery_tat || ''} onChange={e => setForm({ ...form, delivery_tat: e.target.value })} placeholder="e.g. 2–3 weeks" /></Field>
        <Field label="Payment terms"><input className="input" value={form.payment_terms || ''} onChange={e => setForm({ ...form, payment_terms: e.target.value })} /></Field>
        <Field label="Transport"><input className="input" value={form.transport_terms || ''} onChange={e => setForm({ ...form, transport_terms: e.target.value })} /></Field>
      </div>
      <p style={{ fontSize: 12, color: '#64748b' }}>Add products after create via Quotations → Copy for Excel includes validity + TAT.</p>
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
      <FirstQuoteFields form={form} setForm={setForm} />
    </>
  )
}

export function OpportunityDetail({ opportunity, contacts = [], onClose, onSaved, goCompany }) {
  const [row, setRow] = useState(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [showQuote, setShowQuote] = useState(true)
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
      name: (row.name || '').trim() || null, stage: row.stage,
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
  if (!row) return null
  return (
    <div>
      {flash && <div className="notice" style={{ marginBottom: 10 }}>{flash}</div>}
      <div style={{ marginBottom: 12, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
        <strong>{row.companies?.name || 'Company'}</strong> · {row.name || 'Opportunity'}
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>1. Deal details · 2. Quotations (Copy for Excel includes validity + delivery TAT)</div>
      </div>
      <form onSubmit={saveDeal}>
        <Field label="Name"><input className="input" value={row.name || ''} onChange={e => setRow({ ...row, name: e.target.value })} /></Field>
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
        </div>
        <Actions saving={saving} onCancel={onClose} label="Save deal details" />
      </form>
      {showQuote && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>2. Quotations</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Use <strong>Copy for Excel</strong> on each quote — includes Validity and Delivery TAT.</div>
          <QuotationPanel opportunity={row} onTotalChange={() => onSaved && onSaved({ keepOpen: true })} />
        </div>
      )}
    </div>
  )
}

export async function createOppWithOptionalTask(form, companyId) {
  const payload = buildOppCreatePayload({ company_id: companyId, form })
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
