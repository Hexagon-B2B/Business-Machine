import { useState, useEffect } from 'react'
import { Badge, Field, Actions } from '../ui'
import {
  emptyItem, lineTotal, itemsTotal, loadQuotesForOpp, saveQuotation, updateQuoteStatus, QUOTE_STATUS,
} from '../lib/quotations'

/** Lean quotation UI inside an opportunity. Create V1, revise V2+, mark sent / no-regret. */
export default function QuotationPanel({ opportunity, onTotalChange }) {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState(null)
  const [baseQuote, setBaseQuote] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    validity_date: '', delivery_tat: '', payment_terms: '', transport_terms: '',
    special_terms: '', revision_reason: '', no_regret_price: false, notes: '', status: 'draft',
    items: [emptyItem()],
  })
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { if (opportunity?.id) load() }, [opportunity?.id])

  async function load() {
    setLoading(true); setError('')
    const { quotes: q, error: err } = await loadQuotesForOpp(opportunity.id)
    setLoading(false)
    if (err) {
      if (/relation|does not exist|schema cache/i.test(err.message)) setMissingTable(true)
      else setError(err.message)
      setQuotes([]); return
    }
    setMissingTable(false); setQuotes(q)
    if (q[0] && onTotalChange) onTotalChange(q[0].total_value)
  }

  function startCreate() {
    setBaseQuote(null); setMode('create')
    setForm({ validity_date: '', delivery_tat: '', payment_terms: '', transport_terms: '', special_terms: '', revision_reason: '', no_regret_price: false, notes: '', status: 'draft', items: [emptyItem()] })
  }

  function startRevise(q) {
    setBaseQuote(q); setMode('revise')
    const items = (q.quotation_items || []).length
      ? q.quotation_items.map(it => ({
          product_name: it.product_name || '', specification: it.specification || '', brand: it.brand || '',
          model_part_no: it.model_part_no || '', quantity: it.quantity ?? 1, unit_price: it.unit_price ?? '',
          cost_price: it.cost_price ?? '', vendor: it.vendor || '', notes: it.notes || '',
        }))
      : [emptyItem()]
    setForm({
      validity_date: q.validity_date || '', delivery_tat: q.delivery_tat || '', payment_terms: q.payment_terms || '',
      transport_terms: q.transport_terms || '', special_terms: q.special_terms || '', revision_reason: '',
      no_regret_price: false, notes: q.notes || '', status: 'draft', items,
    })
  }

  function setItem(i, key, val) {
    setForm(f => { const items = f.items.slice(); items[i] = { ...items[i], [key]: val }; return { ...f, items } })
  }
  function addLine() { setForm(f => ({ ...f, items: [...f.items, emptyItem()] })) }
  function removeLine(i) {
    setForm(f => ({ ...f, items: f.items.length <= 1 ? [emptyItem()] : f.items.filter((_, idx) => idx !== i) }))
  }

  async function handleSave(e) {
    e.preventDefault()
    const filled = form.items.filter(it => (it.product_name || '').trim())
    if (!filled.length) { setError('Add at least one line with a product / service name.'); return }
    if (mode === 'revise' && !(form.revision_reason || '').trim()) { setError('Revision reason is required (what changed and why).'); return }
    setSaving(true); setError('')
    const nextVersion = mode === 'revise' && baseQuote
      ? (Number(baseQuote.version) || 1) + 1
      : (quotes.length ? Math.max(...quotes.map(q => q.version || 1)) + 1 : 1)
    const { error: err } = await saveQuotation({
      opportunityId: opportunity.id, companyId: opportunity.company_id,
      version: mode === 'create' && !quotes.length ? 1 : nextVersion,
      status: form.status || 'draft', validity_date: form.validity_date, delivery_tat: form.delivery_tat,
      payment_terms: form.payment_terms, transport_terms: form.transport_terms, special_terms: form.special_terms,
      revision_reason: form.revision_reason, no_regret_price: form.no_regret_price, notes: form.notes,
      items: form.items, supersedePreviousId: mode === 'revise' && baseQuote ? baseQuote.id : null,
    })
    setSaving(false)
    if (err) {
      if (/relation|does not exist|schema cache/i.test(err.message)) {
        setMissingTable(true)
        setError('Quotations tables not found. Run sql/001_quotations_and_activity.sql in Supabase.')
      } else setError(err.message)
      return
    }
    setMode(null); setBaseQuote(null); load()
  }

  async function setStatus(id, status) {
    const { error: err } = await updateQuoteStatus(id, status)
    if (err) setError(err.message); else load()
  }

  if (missingTable) {
    return (
      <div className="notice" style={{ background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' }}>
        <strong>One-time setup required.</strong> Run <code>sql/001_quotations_and_activity.sql</code> in Supabase SQL Editor, then refresh.
        Creates <code>quotations</code>, <code>quotation_items</code>, and <code>activity_log</code>.
      </div>
    )
  }

  const total = itemsTotal(form.items)

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Quotations</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Item-wise lines · revisions preserved · light entry</div>
        </div>
        {!mode && (
          <button type="button" className="btn primary" onClick={startCreate}>
            {quotes.length ? '+ New revision' : '+ Create quote'}
          </button>
        )}
      </div>

      {error && <div className="notice" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>{error}</div>}

      {mode && (
        <form onSubmit={handleSave} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            {mode === 'revise' ? `Revise from V${baseQuote?.version} → new version` : 'New quotation'}
          </div>
          {mode === 'revise' && (
            <Field label="Revision reason *">
              <input className="input" required value={form.revision_reason}
                onChange={e => setForm({ ...form, revision_reason: e.target.value })}
                placeholder="e.g. Brand change HP→Lenovo · price negotiation · qty change" />
            </Field>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Validity">
              <input className="input" type="date" value={form.validity_date} onChange={e => setForm({ ...form, validity_date: e.target.value })} />
            </Field>
            <Field label="Delivery TAT">
              <input className="input" value={form.delivery_tat} onChange={e => setForm({ ...form, delivery_tat: e.target.value })} placeholder="e.g. 2–3 weeks" />
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {QUOTE_STATUS.filter(s => s !== 'superseded').map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Payment terms">
              <input className="input" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. 30 days" />
            </Field>
            <Field label="Transport">
              <input className="input" value={form.transport_terms} onChange={e => setForm({ ...form, transport_terms: e.target.value })} placeholder="e.g. FOR site" />
            </Field>
          </div>
          <Field label="Special terms / notes">
            <input className="input" value={form.special_terms || form.notes}
              onChange={e => setForm({ ...form, special_terms: e.target.value, notes: e.target.value })} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
            <input type="checkbox" checked={form.no_regret_price} onChange={e => setForm({ ...form, no_regret_price: e.target.checked })} />
            No-regret price (final commercial position)
          </label>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Lines</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: 12, background: '#fff' }}>
              <thead>
                <tr><th>Product *</th><th>Brand</th><th>Spec</th><th>Qty</th><th>Unit ₹</th><th>Line ₹</th><th></th></tr>
              </thead>
              <tbody>
                {form.items.map((it, i) => (
                  <tr key={i}>
                    <td><input className="input" style={{ minWidth: 120 }} value={it.product_name} onChange={e => setItem(i, 'product_name', e.target.value)} placeholder="Product / service" /></td>
                    <td><input className="input" style={{ minWidth: 80 }} value={it.brand} onChange={e => setItem(i, 'brand', e.target.value)} /></td>
                    <td><input className="input" style={{ minWidth: 100 }} value={it.specification} onChange={e => setItem(i, 'specification', e.target.value)} placeholder="Spec" /></td>
                    <td><input className="input" type="number" style={{ width: 64 }} value={it.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} /></td>
                    <td><input className="input" type="number" style={{ width: 90 }} value={it.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} /></td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>₹{lineTotal(it).toLocaleString()}</td>
                    <td><button type="button" className="btn" style={{ padding: '2px 8px' }} onClick={() => removeLine(i)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
            <button type="button" className="btn" onClick={addLine}>+ Line</button>
            <strong>Total ₹{total.toLocaleString()}</strong>
          </div>
          <Actions saving={saving} onCancel={() => { setMode(null); setError('') }} label="Save quotation" />
        </form>
      )}

      {loading ? <div className="loading" style={{ padding: 16 }}>Loading quotes…</div> : (
        quotes.length === 0 && !mode ? (
          <div className="empty" style={{ padding: 20 }}>No quotations yet. Create a light item-wise quote when you are ready to price.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {quotes.map(q => {
              const open = expandedId === q.id
              return (
                <div key={q.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      onClick={() => setExpandedId(open ? null : q.id)}>
                      <strong>V{q.version}</strong>{' · '}
                      <Badge tone={q.status === 'sent' ? 'yellow' : q.status === 'accepted' ? 'green' : q.status === 'superseded' ? 'gray' : 'blue'}>{q.status}</Badge>
                      {q.no_regret_price && <> · <Badge tone="green">No-regret</Badge></>}
                      <span style={{ marginLeft: 8 }}>₹{Number(q.total_value || 0).toLocaleString()}</span>
                      <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>
                        {(q.quotation_items || []).length} line(s){q.revision_reason ? ` · ${q.revision_reason}` : ''}
                      </span>
                    </button>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {q.status !== 'superseded' && q.status !== 'sent' && (
                        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setStatus(q.id, 'sent')}>Mark sent</button>
                      )}
                      {q.status !== 'superseded' && (
                        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => startRevise(q)}>Revise</button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                        {[q.validity_date && `Valid ${q.validity_date}`, q.delivery_tat, q.payment_terms].filter(Boolean).join(' · ') || 'No header terms'}
                      </div>
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead><tr><th>Product</th><th>Brand</th><th>Spec</th><th>Qty</th><th>Unit</th><th>Line</th></tr></thead>
                        <tbody>
                          {(q.quotation_items || []).map(it => (
                            <tr key={it.id}>
                              <td>{it.product_name}</td>
                              <td>{it.brand || '—'}</td>
                              <td>{it.specification || '—'}</td>
                              <td>{it.quantity}</td>
                              <td>{it.unit_price != null ? `₹${Number(it.unit_price).toLocaleString()}` : '—'}</td>
                              <td>{it.line_total != null ? `₹${Number(it.line_total).toLocaleString()}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
