import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, oppStageLabel, isOppOpen } from '../constants'
import { Field, Actions, Badge } from '../ui'
import QuotationPanel from './QuotationPanel'
import { logActivity } from '../lib/activityLog'
import {
  emptyItem, emptyUpgrade, emptyCharge,
  saveQuotation, quoteCustomerTotal,
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
  quote_items: [emptyItem({ line_type: 'product' })],
}

function MiniLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>
      {children}
    </div>
  )
}

/** Compact first-quote lines on New opportunity (same rules as QuotationPanel). */
export function FirstQuoteFields({ form, setForm }) {
  const items = Array.isArray(form.quote_items) ? form.quote_items : []
  const products = items.filter(it => (it.line_type || 'product') === 'product')
  const charges = items.filter(it => it.line_type === 'charge')

  function setItems(next) {
    setForm({ ...form, quote_items: next })
  }

  function setItem(id, key, value) {
    setItems(items.map(it => it.id === id ? { ...it, [key]: value } : it))
  }

  function addProduct() {
    setItems([...items, emptyItem({ line_type: 'product' })])
  }

  function addUpgrade(parentId) {
    setItems([...items, emptyUpgrade(parentId)])
  }

  function addCharge() {
    setItems([...items, emptyCharge('other')])
  }

  function removeItem(id) {
    const next = items.filter(it => it.id !== id && it.parent_id !== id)
    setItems(next.length ? next : [emptyItem({ line_type: 'product' })])
  }

  const custTot = quoteCustomerTotal(items)

  return (
    <div style={{ marginTop: 14, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>First quotation (optional)</div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
        Base product + sub-items (upgrades) + charges. Saved as V1 with a quote number (HQ-YYYY-####). You can revise later from the opportunity.
        {custTot > 0 && <span style={{ marginLeft: 6, color: '#065f46', fontWeight: 600 }}>· Est. customer ₹{Math.round(custTot).toLocaleString('en-IN')}</span>}
      </div>

      {products.map(prod => {
        const upgrades = items.filter(it => it.line_type === 'upgrade' && it.parent_id === prod.id)
        return (
          <div key={prod.id} style={{ marginBottom: 12, padding: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <Badge tone="gray">Base product</Badge>
              {upgrades.length > 0 && <Badge tone="blue">{upgrades.length} upgrade(s)</Badge>}
              <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(prod.id)}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.45fr 0.7fr 0.7fr', gap: 6 }}>
              <div>
                <MiniLabel>Product name</MiniLabel>
                <input className="input" value={prod.product_name || ''} onChange={e => setItem(prod.id, 'product_name', e.target.value)} placeholder="e.g. CCTV camera" />
              </div>
              <div>
                <MiniLabel>Brand</MiniLabel>
                <input className="input" value={prod.brand || ''} onChange={e => setItem(prod.id, 'brand', e.target.value)} />
              </div>
              <div>
                <MiniLabel>Qty</MiniLabel>
                <input className="input" type="number" value={prod.quantity ?? 1} onChange={e => setItem(prod.id, 'quantity', e.target.value)} />
              </div>
              <div>
                <MiniLabel>Transfer ₹</MiniLabel>
                <input className="input" type="number" value={prod.transfer_price ?? ''} onChange={e => setItem(prod.id, 'transfer_price', e.target.value)} placeholder="Cost" />
              </div>
              <div>
                <MiniLabel>Customer ₹</MiniLabel>
                <input className="input" type="number" value={prod.customer_price ?? ''} onChange={e => setItem(prod.id, 'customer_price', e.target.value)} placeholder="Sell" />
              </div>
            </div>
            <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 8px', marginTop: 8 }} onClick={() => addUpgrade(prod.id)}>+ Sub-item / upgrade</button>
            {upgrades.map(u => (
              <div key={u.id} style={{ marginLeft: 12, marginTop: 8, padding: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <Badge tone="blue">Upgrade / sub-item</Badge>
                  <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(u.id)}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.45fr 0.7fr', gap: 6 }}>
                  <div>
                    <MiniLabel>Component</MiniLabel>
                    <input className="input" value={u.product_name || ''} onChange={e => setItem(u.id, 'product_name', e.target.value)} placeholder="e.g. 16GB RAM" />
                  </div>
                  <div>
                    <MiniLabel>Brand</MiniLabel>
                    <input className="input" value={u.brand || ''} onChange={e => setItem(u.id, 'brand', e.target.value)} />
                  </div>
                  <div>
                    <MiniLabel>Qty</MiniLabel>
                    <input className="input" type="number" value={u.quantity ?? 1} onChange={e => setItem(u.id, 'quantity', e.target.value)} />
                  </div>
                  <div>
                    <MiniLabel>Transfer ₹</MiniLabel>
                    <input className="input" type="number" value={u.transfer_price ?? ''} onChange={e => setItem(u.id, 'transfer_price', e.target.value)} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Rolls into parent product commercial total</div>
              </div>
            ))}
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" className="btn" onClick={addProduct}>+ Base product</button>
        <button type="button" className="btn" onClick={addCharge}>+ Charge</button>
      </div>

      {charges.map(c => (
        <div key={c.id} style={{ marginBottom: 8, padding: 8, background: '#fefce8', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <Badge tone="yellow">Charge</Badge>
            <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(c.id)}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.5fr 0.7fr 0.7fr', gap: 6 }}>
            <div>
              <MiniLabel>Name</MiniLabel>
              <input className="input" value={c.product_name || ''} onChange={e => setItem(c.id, 'product_name', e.target.value)} placeholder="Installation / transport" />
            </div>
            <div>
              <MiniLabel>Qty</MiniLabel>
              <input className="input" type="number" value={c.quantity ?? 1} onChange={e => setItem(c.id, 'quantity', e.target.value)} />
            </div>
            <div>
              <MiniLabel>Customer ₹</MiniLabel>
              <input className="input" type="number" value={c.customer_price ?? ''} onChange={e => setItem(c.id, 'customer_price', e.target.value)} />
            </div>
            <div>
              <MiniLabel>Billing</MiniLabel>
              <select className="input" value={c.billing || 'on_bill'} onChange={e => setItem(c.id, 'billing', e.target.value)}>
                <option value="on_bill">On bill</option>
                <option value="off_invoice">Off invoice</option>
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Create form fields — identical on Company detail and Opportunities tab. */
export function OpportunityCreateFields({ form, setForm, contacts = [] }) {
  return (
    <>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        Pipeline: Requirement → Qualification → Discovery → Solution → Quotation → Negotiation → Decision → Won/Lost.
        Fill opportunity fields below. Optionally add <strong>base product + sub-items</strong> in the first quotation section — saved as quote V1 on create.
      </div>
      <Field label="Name">
        <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Short name (optional)" />
      </Field>
      <Field label="Requirement *">
        <textarea className="input" required rows={3} value={form.requirement_description}
          onChange={e => setForm({ ...form, requirement_description: e.target.value })} placeholder="What does the buyer need?" />
      </Field>
      <Field label="Solution / approach">
        <textarea className="input" rows={2} value={form.solution}
          onChange={e => setForm({ ...form, solution: e.target.value })} placeholder="Proposed solution" />
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
            onChange={e => setForm({ ...form, deal_size: e.target.value })} placeholder="Rough estimate; quote overrides" />
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
          onChange={e => setForm({ ...form, next_action: e.target.value })} placeholder="What you will do next" />
      </Field>
      <Field label="Primary contact">
        <select className="input" value={form.primary_contact_id}
          onChange={e => setForm({ ...form, primary_contact_id: e.target.value })}>
          <option value="">—</option>
          {contacts.map(c => (
            <option key={c.id} value={c.id}>{c.full_name}</option>
          ))}
        </select>
      </Field>

      <FirstQuoteFields form={form} setForm={setForm} />
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
  const t = latest?.totals?.total_ex_tax ?? latest?.total_ex_tax ?? latest?.total_value ?? latest?.totals?.grand_total
  return t != null && !Number.isNaN(Number(t)) ? Number(t) : null
}

function displayValue(o) {
  const q = quoteTotal(o)
  if (q != null) return q
  if (o?.deal_size != null && !Number.isNaN(Number(o.deal_size))) return Number(o.deal_size)
  return null
}

export function OpportunityDetail({ opportunity, contacts = [], onClose, onSaved, goCompany, initialShowQuote = false }) {
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
    setShowQuote(!!initialShowQuote)
  }, [opportunity?.id, initialShowQuote])

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
      <Field label="Primary contact">
        <select className="input" value={row.primary_contact_id || ''}
          onChange={e => setRow({ ...row, primary_contact_id: e.target.value })}>
          <option value="">—</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </Field>
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
            Base product + upgrades (sub-items) + charges. Revise / Copy for Excel. Saved total updates pipeline value.
          </div>
          <QuotationPanel opportunity={row} onTotalChange={() => { onSaved && onSaved() }} />
        </div>
      )}
      <Actions saving={saving} onCancel={onClose} label="Save changes" />
    </form>
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
      due_at: form.next_action_due,
      priority: 'medium',
      status: 'open',
      source: 'user',
      state: 'active',
    })
  }

  const items = Array.isArray(form.quote_items) ? form.quote_items : []
  const hasLines = items.some(it => (it.product_name || '').trim() || (it.line_type === 'charge' && (Number(it.customer_price) || 0) > 0))
  if (hasLines && data?.id) {
    const { error: qErr } = await saveQuotation({
      opportunityId: data.id,
      companyId,
      items,
      status: 'draft',
    })
    if (qErr) console.warn('First quote save:', qErr.message)
  }

  return { data, error: null }
}
