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
    validity_date: '',
    delivery_tat: '',
    payment_terms: '',
    transport_terms: '',
    quote_items: [emptyItem({ line_type: 'product' })],
  }
}

export const EMPTY_OPP_FORM = emptyOppForm()

function MiniLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>
      {children}
    </div>
  )
}

export function FirstQuoteFields({ form, setForm }) {
  const items = Array.isArray(form.quote_items) ? form.quote_items : []
  const products = items.filter(it => (it.line_type || 'product') === 'product')
  const charges = items.filter(it => it.line_type === 'charge')
  const [openIds, setOpenIds] = useState(() => new Set(products.map(p => p.id)))

  function setItems(next) {
    setForm({ ...form, quote_items: next })
  }

  function setItem(id, key, value) {
    setItems(items.map(it => it.id === id ? { ...it, [key]: value } : it))
  }

  function applyMarkup(baseId, marginPct) {
    const base = items.find(it => it.id === baseId)
    if (!base) return
    const ups = items.filter(it => it.line_type === 'upgrade' && it.parent_id === baseId)
    const xfer = (Number(base.transfer_price) || 0) * (Number(base.quantity) || 1)
      + ups.reduce((s, u) => s + (Number(u.transfer_price) || 0) * (Number(u.quantity) || 1), 0)
    const pct = marginPct === '' || marginPct == null ? null : Number(marginPct)
    let customer = base.customer_price
    if (pct != null && !Number.isNaN(pct) && xfer > 0) {
      const qty = Number(base.quantity) || 1
      const total = Math.round(xfer * (1 + pct / 100) * 100) / 100
      customer = qty > 0 ? Math.round((total / qty) * 100) / 100 : total
    }
    setItems(items.map(it => it.id === baseId ? { ...it, margin_pct: marginPct, customer_price: customer } : it))
  }

  function applyCustomerRate(baseId, unitRate) {
    const base = items.find(it => it.id === baseId)
    if (!base) return
    const ups = items.filter(it => it.line_type === 'upgrade' && it.parent_id === baseId)
    const xfer = (Number(base.transfer_price) || 0) * (Number(base.quantity) || 1)
      + ups.reduce((s, u) => s + (Number(u.transfer_price) || 0) * (Number(u.quantity) || 1), 0)
    const qty = Number(base.quantity) || 1
    const total = (Number(unitRate) || 0) * qty
    let pct = base.margin_pct
    if (xfer > 0 && total > 0) {
      pct = Math.round(((total - xfer) / xfer) * 1000) / 10
    }
    setItems(items.map(it => it.id === baseId ? { ...it, customer_price: unitRate, margin_pct: pct } : it))
  }

  function addProduct() {
    const it = emptyItem({ line_type: 'product' })
    setItems([...items, it])
    setOpenIds(prev => new Set([...prev, it.id]))
  }

  function addUpgrade(parentId) {
    setItems([...items, emptyUpgrade(parentId)])
    setOpenIds(prev => new Set([...prev, parentId]))
  }

  function addCharge() {
    setItems([...items, emptyCharge('other')])
  }

  function removeItem(id) {
    const next = items.filter(it => it.id !== id && it.parent_id !== id)
    setItems(next.length ? next : [emptyItem({ line_type: 'product' })])
  }

  function toggleOpen(id) {
    setOpenIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const custTot = quoteCustomerTotal(items)

  return (
    <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>First quotation (optional)</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
        Description = what is sold. Use <strong>% Markup</strong> or <strong>Customer rate ₹</strong>. Collapse a product to see its total; expand to edit sub-items.
        {custTot > 0 && <span style={{ marginLeft: 8, color: '#065f46', fontWeight: 700 }}>Quote total ₹{Math.round(custTot).toLocaleString('en-IN')}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <Field label="Quote validity">
          <input className="input" type="date" value={form.validity_date || ''}
            onChange={e => setForm({ ...form, validity_date: e.target.value })} />
        </Field>
        <Field label="Delivery TAT">
          <input className="input" value={form.delivery_tat || ''}
            onChange={e => setForm({ ...form, delivery_tat: e.target.value })} placeholder="e.g. 2–3 weeks" />
        </Field>
        <Field label="Payment terms">
          <input className="input" value={form.payment_terms || ''}
            onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. 50% advance" />
        </Field>
        <Field label="Transport">
          <input className="input" value={form.transport_terms || ''}
            onChange={e => setForm({ ...form, transport_terms: e.target.value })} placeholder="Ex-works / FOR" />
        </Field>
      </div>

      {products.map(prod => {
        const upgrades = items.filter(it => it.line_type === 'upgrade' && it.parent_id === prod.id)
        const g = groupRollup(prod, items)
        const open = openIds.has(prod.id)
        return (
          <div key={prod.id} style={{ marginBottom: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#f1f5f9', cursor: 'pointer' }}
              onClick={() => toggleOpen(prod.id)}>
              <button type="button" className="btn" style={{ padding: '2px 8px', minWidth: 32 }} onClick={e => { e.stopPropagation(); toggleOpen(prod.id) }}>
                {open ? '▾' : '▸'}
              </button>
              <Badge tone="gray">Base product</Badge>
              {upgrades.length > 0 && <Badge tone="blue">{upgrades.length} sub-item(s)</Badge>}
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{prod.product_name || 'Untitled product'}</span>
              <span style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                Qty {g.qty} · TP ₹{Math.round(g.transferTotal).toLocaleString('en-IN')} · Cust ₹{Math.round(g.customerTotal).toLocaleString('en-IN')} · {g.marginPct}%
              </span>
              <button type="button" className="btn" style={{ padding: '2px 8px' }} onClick={e => { e.stopPropagation(); removeItem(prod.id) }}>×</button>
            </div>

            {open && (
              <div style={{ padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.7fr 0.9fr', gap: 8 }}>
                  <div>
                    <MiniLabel>Description *</MiniLabel>
                    <input className="input" value={prod.product_name || ''} onChange={e => setItem(prod.id, 'product_name', e.target.value)} placeholder="What is being sold" />
                  </div>
                  <div>
                    <MiniLabel>Brand / Make</MiniLabel>
                    <input className="input" value={prod.brand || ''} onChange={e => setItem(prod.id, 'brand', e.target.value)} />
                  </div>
                  <div>
                    <MiniLabel>Vendor</MiniLabel>
                    <input className="input" value={prod.vendor || ''} onChange={e => setItem(prod.id, 'vendor', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '0.55fr 0.8fr 0.7fr 0.8fr', gap: 8, marginTop: 10 }}>
                  <div>
                    <MiniLabel>Qty</MiniLabel>
                    <input className="input" type="number" value={prod.quantity ?? 1} onChange={e => setItem(prod.id, 'quantity', e.target.value)} />
                  </div>
                  <div>
                    <MiniLabel>Transfer ₹ (unit)</MiniLabel>
                    <input className="input" type="number" value={prod.transfer_price ?? ''} onChange={e => setItem(prod.id, 'transfer_price', e.target.value)} />
                  </div>
                  <div>
                    <MiniLabel>% Markup</MiniLabel>
                    <input className="input" type="number" value={prod.margin_pct ?? ''} onChange={e => applyMarkup(prod.id, e.target.value)} placeholder="e.g. 25" />
                  </div>
                  <div>
                    <MiniLabel>Customer rate ₹</MiniLabel>
                    <input className="input" type="number" value={prod.customer_price ?? ''} onChange={e => applyCustomerRate(prod.id, e.target.value)} placeholder="Or amount" />
                  </div>
                </div>

                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => addUpgrade(prod.id)}>+ Sub-item / upgrade</button>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Sub-items roll into parent total above</span>
                </div>

                {upgrades.map(u => (
                  <div key={u.id} style={{ marginLeft: 8, marginTop: 10, padding: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                      <Badge tone="blue">Sub-item</Badge>
                      <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(u.id)}>×</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.9fr 0.5fr 0.75fr 0.6fr', gap: 8 }}>
                      <div>
                        <MiniLabel>Description</MiniLabel>
                        <input className="input" value={u.product_name || ''} onChange={e => setItem(u.id, 'product_name', e.target.value)} placeholder="e.g. 16GB RAM" />
                      </div>
                      <div>
                        <MiniLabel>Brand / Make</MiniLabel>
                        <input className="input" value={u.brand || ''} onChange={e => setItem(u.id, 'brand', e.target.value)} />
                      </div>
                      <div>
                        <MiniLabel>Vendor</MiniLabel>
                        <input className="input" value={u.vendor || ''} onChange={e => setItem(u.id, 'vendor', e.target.value)} />
                      </div>
                      <div>
                        <MiniLabel>Qty</MiniLabel>
                        <input className="input" type="number" value={u.quantity ?? 1} onChange={e => setItem(u.id, 'quantity', e.target.value)} />
                      </div>
                      <div>
                        <MiniLabel>Transfer ₹</MiniLabel>
                        <input className="input" type="number" value={u.transfer_price ?? ''} onChange={e => setItem(u.id, 'transfer_price', e.target.value)} />
                      </div>
                      <div>
                        <MiniLabel>Std markup %</MiniLabel>
                        <input className="input" type="number" value={u.margin_pct ?? ''} onChange={e => setItem(u.id, 'margin_pct', e.target.value)} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      TP ₹{lineTransferTotal(u).toLocaleString('en-IN')} · rolls into parent
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button type="button" className="btn" onClick={addProduct}>+ Base product</button>
        <button type="button" className="btn" onClick={addCharge}>+ Charge</button>
      </div>

      {charges.map(c => (
        <div key={c.id} style={{ marginBottom: 8, padding: 10, background: '#fefce8', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <Badge tone="yellow">Charge</Badge>
            <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(c.id)}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.5fr 0.75fr 0.75fr', gap: 8 }}>
            <div>
              <MiniLabel>Description</MiniLabel>
              <input className="input" value={c.product_name || ''} onChange={e => setItem(c.id, 'product_name', e.target.value)} />
            </div>
            <div>
              <MiniLabel>Qty</MiniLabel>
              <input className="input" type="number" value={c.quantity ?? 1} onChange={e => setItem(c.id, 'quantity', e.target.value)} />
            </div>
            <div>
              <MiniLabel>Customer rate ₹</MiniLabel>
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

export function OpportunityCreateFields({ form, setForm, contacts = [] }) {
  return (
    <>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        Pipeline: Requirement → Qualification → Discovery → Solution → Quotation → Negotiation → Decision → Won/Lost.
        Fill deal fields, then optional first quote (validity, delivery TAT, products). Quote total becomes pipeline value.
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
  const latest = [...quotes].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
  const t = latest?.total_value ?? latest?.totals?.total_ex_tax ?? latest?.total_ex_tax
  return t != null && !Number.isNaN(Number(t)) ? Number(t) : null
}

function displayValue(o) {
  const q = quoteTotal(o)
  if (q != null) return q
  if (o?.deal_size != null && !Number.isNaN(Number(o.deal_size))) return Number(o.deal_size)
  return null
}

function hasQuotes(o) {
  return Array.isArray(o?.metadata?.quotes) && o.metadata.quotes.length > 0
}

export function OpportunityDetail({ opportunity, contacts = [], onClose, onSaved, goCompany, initialShowQuote = false }) {
  const [row, setRow] = useState(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [showQuote, setShowQuote] = useState(true)

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
    setShowQuote(true)
  }, [opportunity?.id])

  function msg(m) {
    setFlash(m)
    setTimeout(() => setFlash(''), 4500)
  }

  async function saveDeal(e) {
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
    msg('Deal details saved.')
    await logActivity({ entityType: 'opportunity', entityId: row.id, action: 'update', summary: 'Opportunity updated' })
    onSaved && onSaved({ keepOpen: true })
  }

  async function markStage(stage) {
    if (stage === 'lost' && !(row.lost_reason || '').trim()) {
      setRow(r => ({ ...r, stage: 'lost' }))
      msg('Enter a lost reason, then Save deal details.')
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
      onSaved && onSaved({ keepOpen: true })
    }
  }

  if (!row) return null

  return (
    <div>
      {flash && <div className="notice" style={{ marginBottom: 10 }}>{flash}</div>}

      <div style={{ fontSize: 13, marginBottom: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <strong>{row.companies?.name || 'Company'}</strong>
        {' · '}Pipeline value {formatInr(displayValue(row))}
        {hasQuotes(row) && <span style={{ color: '#64748b' }}> (from latest quote)</span>}
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          Edit deal fields below, or scroll to <strong>Quotations</strong> to revise lines / <strong>Copy for Excel</strong>.
        </div>
      </div>

      <form onSubmit={saveDeal}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Deal details</div>
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
          {isOppOpen(row.stage) && (
            <button type="button" className="btn" onClick={() => markStage('won')}>Mark won</button>
          )}
          <button type="button" className="btn" onClick={() => setShowQuote(s => !s)}>
            {showQuote ? 'Hide quotations' : 'Show quotations'}
          </button>
        </div>
        <Actions saving={saving} onCancel={onClose} label="Save deal details" />
      </form>

      {showQuote && (
        <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
          <QuotationPanel
            opportunity={row}
            onTotalChange={() => { onSaved && onSaved({ keepOpen: true }) }}
          />
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
      validity_date: form.validity_date || null,
      delivery_tat: form.delivery_tat || null,
      payment_terms: form.payment_terms || null,
      transport_terms: form.transport_terms || null,
    })
    if (qErr) console.warn('First quote save:', qErr.message)
  }

  return { data, error: null }
}
