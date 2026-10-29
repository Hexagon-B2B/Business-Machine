import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, oppStageLabel, isOppOpen } from '../constants'
import { Field, Actions } from '../ui'
import QuotationPanel from './QuotationPanel'
import { logActivity } from '../lib/activityLog'

/** Shared payload shape for create — same from Company or Opportunities tab. */
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

export const EMPTY_OPP_FORM = {
  company_id: '',
  name: '',
  stage: 'requirement',
  deal_size: '',
  expected_close_date: '',
  requirement_description: '',
  solution: '',
  next_action: '',
  next_action_due: '',
  primary_contact_id: '',
  lost_reason: '',
}

/** Create form fields — identical wherever New opportunity is opened. */
export function OpportunityCreateFields({ form, setForm, contacts = [] }) {
  return (
    <>
      <Field label="Name">
        <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Short name (optional)" />
      </Field>
      <Field label="Requirement *">
        <textarea className="input" required rows={3} value={form.requirement_description}
          onChange={e => setForm({ ...form, requirement_description: e.target.value })} />
      </Field>
      <Field label="Solution / approach">
        <textarea className="input" rows={2} value={form.solution}
          onChange={e => setForm({ ...form, solution: e.target.value })} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Stage">
          <select className="input" value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
            {OPP_STAGES.filter(s => isOppOpen(s)).map(s => (
              <option key={s} value={s}>{oppStageLabel(s)}</option>
            ))}
          </select>
        </Field>
        <Field label="Deal size (estimate)">
          <input className="input" type="number" value={form.deal_size}
            onChange={e => setForm({ ...form, deal_size: e.target.value })} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Expected close">
          <input className="input" type="date" value={form.expected_close_date}
            onChange={e => setForm({ ...form, expected_close_date: e.target.value })} />
        </Field>
        <Field label="Next action due">
          <input className="input" type="date" value={form.next_action_due}
            onChange={e => setForm({ ...form, next_action_due: e.target.value })} />
        </Field>
      </div>
      <Field label="Next action">
        <input className="input" value={form.next_action}
          onChange={e => setForm({ ...form, next_action: e.target.value })} />
      </Field>
      {contacts.length > 0 && (
        <Field label="Primary contact">
          <select className="input" value={form.primary_contact_id}
            onChange={e => setForm({ ...form, primary_contact_id: e.target.value })}>
            <option value="">—</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </Field>
      )}
    </>
  )
}

function formatInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return '₹' + Math.round(Number(n)).toLocaleString('en-IN')
}

function quoteTotal(o) {
  const quotes = o?.metadata?.quotes
  if (!Array.isArray(quotes) || !quotes.length) return null
  const latest = quotes[quotes.length - 1]
  const t = latest?.totals?.total_ex_tax ?? latest?.total_ex_tax ?? latest?.totals?.grand_total
  return t != null && !Number.isNaN(Number(t)) ? Number(t) : null
}

function displayValue(o) {
  const q = quoteTotal(o)
  if (q != null) return q
  if (o?.deal_size != null && !Number.isNaN(Number(o.deal_size))) return Number(o.deal_size)
  return null
}

/**
 * Full opportunity detail: edit fields + pipeline stage + quotations (base product / upgrades / charges).
 * Used from Opportunities tab and Company detail so behaviour is identical.
 */
export function OpportunityDetail({ opportunity, contacts = [], onClose, onSaved, goCompany }) {
  const [row, setRow] = useState(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [showQuote, setShowQuote] = useState(false)

  useEffect(() => {
    if (!opportunity) { setRow(null); return }
    setRow({
      ...opportunity,
      solution: opportunity.pain_points || opportunity.metadata?.solution || '',
      next_action: opportunity.metadata?.next_action || opportunity.next_action || '',
      next_action_due: String(opportunity.metadata?.next_action_due || opportunity.next_action_due || '').slice(0, 10),
      lost_reason: opportunity.lost_reason || '',
      expected_close_date: String(opportunity.expected_close_date || '').slice(0, 10),
    })
    setShowQuote(false)
  }, [opportunity?.id])

  function msg(m) {
    setFlash(m)
    setTimeout(() => setFlash(''), 4500)
  }

  async function save(e) {
    e.preventDefault()
    if (!row?.id) return
    if (row.stage === 'lost' && !(row.lost_reason || '').trim()) {
      msg('Lost reason is required when stage is Lost.')
      return
    }
    setSaving(true)
    const meta = {
      ...(row.metadata || {}),
      next_action: row.next_action || null,
      next_action_due: row.next_action_due || null,
      solution: row.solution || null,
    }
    const payload = {
      name: (row.name || '').trim() || null,
      stage: row.stage,
      deal_size: row.deal_size != null && row.deal_size !== '' ? Number(row.deal_size) : null,
      expected_close_date: row.expected_close_date || null,
      requirement_description: row.requirement_description || null,
      pain_points: row.solution || row.pain_points || null,
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
    if (error) { msg('Save failed: ' + error.message); return }
    msg('Opportunity updated.')
    await logActivity({ entityType: 'opportunity', entityId: row.id, action: 'update', summary: 'Opportunity updated' })
    onSaved && onSaved()
  }

  async function markStage(stage) {
    if (stage === 'lost' && !(row.lost_reason || '').trim()) {
      setRow(r => ({ ...r, stage: 'lost' }))
      msg('Enter a lost reason, then Save.')
      return
    }
    const payload = { stage }
    if (stage === 'lost') payload.lost_reason = row.lost_reason || null
    const { error } = await supabase.from('opportunities').update(payload).eq('id', row.id)
    if (error) msg('Stage update failed: ' + error.message)
    else {
      setRow(r => ({ ...r, stage, lost_reason: payload.lost_reason ?? r.lost_reason }))
      msg('Stage → ' + oppStageLabel(stage))
      await logActivity({ entityType: 'opportunity', entityId: row.id, action: 'stage_change', summary: 'Stage → ' + stage })
      onSaved && onSaved()
    }
  }

  if (!row) return null

  return (
    <form onSubmit={save}>
      {flash && <div className="notice" style={{ marginBottom: 10 }}>{flash}</div>}
      <div style={{ fontSize: 13, marginBottom: 10, color: '#64748b' }}>
        {row.companies?.name || '—'} · Value {formatInr(displayValue(row))}
      </div>
      <Field label="Name">
        <input className="input" value={row.name || ''} onChange={e => setRow({ ...row, name: e.target.value })} />
      </Field>
      <Field label="Requirement">
        <textarea className="input" rows={2} value={row.requirement_description || ''}
          onChange={e => setRow({ ...row, requirement_description: e.target.value })} />
      </Field>
      <Field label="Solution">
        <textarea className="input" rows={2} value={row.solution || ''}
          onChange={e => setRow({ ...row, solution: e.target.value })} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Stage">
          <select className="input" value={row.stage || 'requirement'}
            onChange={e => setRow({ ...row, stage: e.target.value })}>
            {OPP_STAGES.map(s => <option key={s} value={s}>{oppStageLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="Deal size (estimate)">
          <input className="input" type="number" value={row.deal_size ?? ''}
            onChange={e => setRow({ ...row, deal_size: e.target.value })} />
        </Field>
      </div>
      {row.stage === 'lost' && (
        <Field label="Lost reason *">
          <input className="input" required value={row.lost_reason || ''}
            onChange={e => setRow({ ...row, lost_reason: e.target.value })} placeholder="Why lost?" />
        </Field>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Expected close">
          <input className="input" type="date" value={row.expected_close_date || ''}
            onChange={e => setRow({ ...row, expected_close_date: e.target.value })} />
        </Field>
        <Field label="Next action due">
          <input className="input" type="date" value={row.next_action_due || ''}
            onChange={e => setRow({ ...row, next_action_due: e.target.value })} />
        </Field>
      </div>
      <Field label="Next action">
        <input className="input" value={row.next_action || ''}
          onChange={e => setRow({ ...row, next_action: e.target.value })} />
      </Field>
      {contacts.length > 0 && (
        <Field label="Primary contact">
          <select className="input" value={row.primary_contact_id || ''}
            onChange={e => setRow({ ...row, primary_contact_id: e.target.value })}>
            <option value="">—</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {goCompany && row.company_id && (
          <button type="button" className="btn" onClick={() => goCompany(row.company_id)}>Open company</button>
        )}
        <button type="button" className="btn primary" onClick={() => setShowQuote(s => !s)}>
          {showQuote ? 'Hide quotes' : 'Quotations (items / sub-items)'}
        </button>
        {isOppOpen(row.stage) && (
          <button type="button" className="btn" onClick={() => markStage('won')}>Mark won</button>
        )}
      </div>
      {showQuote && (
        <div style={{ marginBottom: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            Base product + upgrades (sub-items) + charges. Saved total updates pipeline value.
          </div>
          <QuotationPanel
            opportunity={row}
            onTotalChange={() => { onSaved && onSaved() }}
          />
        </div>
      )}
      <Actions saving={saving} onCancel={onClose} label="Save changes" />
    </form>
  )
}

/** After create: optional task from next action + due. */
export async function createOppWithOptionalTask(form, companyId) {
  const payload = buildOppCreatePayload({ company_id: companyId, form })
  let { data, error } = await supabase.from('opportunities').insert(payload).select('id').single()
  if (error && /primary_contact|column/i.test(error.message)) {
    delete payload.primary_contact_id
    ;({ data, error } = await supabase.from('opportunities').insert(payload).select('id').single())
  }
  if (!error && (form.next_action || '').trim() && form.next_action_due) {
    await supabase.from('tasks').insert({
      company_id: companyId,
      title: ('Opp next action: ' + form.next_action).slice(0, 200),
      description: 'From opportunity: ' + (payload.name || ''),
      due_at: form.next_action_due,
      priority: 'medium',
      status: 'open',
      source: 'user',
      state: 'active',
    })
  }
  return { data, error }
}
