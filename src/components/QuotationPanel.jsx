import { useState, useEffect } from 'react'
import { Badge, Field, Actions } from '../ui'
import {
  emptyItem, emptyUpgrade, emptyCharge,
  lineCustomerTotal, lineTransferTotal,
  quoteCustomerTotal, quoteTransferTotal, quoteMargin,
  loadQuotesForOpp, saveQuotation, updateQuoteStatus, QUOTE_STATUS,
} from '../lib/quotations'

/** Not nested in opportunity form. Customer price: direct or margin % on transfer. */
export default function QuotationPanel({ opportunity, onTotalChange }) {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [mode, setMode] = useState(null)
  const [baseQuote, setBaseQuote] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blankForm())
  const [expandedId, setExpandedId] = useState(null)

  function blankForm() {
    return {
      quotation_no: '', validity_date: '', delivery_tat: '', payment_terms: '', transport_terms: '',
      special_terms: '', revision_reason: '', no_regret_price: false, notes: '', status: 'draft',
      items: [emptyItem({ product_name: '', line_type: 'product' })],
    }
  }

  useEffect(() => { if (opportunity?.id) load() }, [opportunity?.id])

  async function load() {
    setLoading(true); setError('')
    const { quotes: q, error: err } = await loadQuotesForOpp(opportunity.id)
    setLoading(false)
    if (err) { setError(err.message); setQuotes([]); return }
    setQuotes(q)
    if (q[0]?.total_value != null && onTotalChange) onTotalChange(q[0].total_value)
  }

  function startCreate() {
    setBaseQuote(null); setMode('create'); setForm(blankForm()); setError(''); setOk('')
  }

  function startRevise(q) {
    setBaseQuote(q); setMode('revise'); setError(''); setOk('')
    const items = (q.quotation_items || []).length
      ? q.quotation_items.map(it => ({ ...emptyItem(), ...it, id: it.id || emptyItem().id }))
      : [emptyItem()]
    setForm({
      quotation_no: q.quotation_no || '', validity_date: q.validity_date || '', delivery_tat: q.delivery_tat || '',
      payment_terms: q.payment_terms || '', transport_terms: q.transport_terms || '', special_terms: q.special_terms || '',
      revision_reason: '', no_regret_price: false, notes: q.notes || '', status: 'draft', items,
    })
  }

  function setItem(id, key, val) {
    setForm(f => ({
      ...f,
      items: f.items.map(it => {
        if (it.id !== id) return it
        const next = { ...it, [key]: val }
        if (key === 'margin_pct') {
          const xfer = Number(next.transfer_price) || 0
          const pct = Number(val)
          if (xfer > 0 && val !== '' && !Number.isNaN(pct)) {
            next.customer_price = Math.round(xfer * (1 + pct / 100) * 100) / 100
          }
        }
        if (key === 'customer_price') {
          const xfer = Number(next.transfer_price) || 0
          const cust = Number(val) || 0
          if (xfer > 0 && cust > 0) {
            next.margin_pct = Math.round(((cust - xfer) / xfer) * 1000) / 10
          }
        }
        if (key === 'transfer_price' && next.margin_pct !== '' && next.margin_pct != null) {
          const xfer = Number(val) || 0
          const pct = Number(next.margin_pct)
          if (xfer > 0 && !Number.isNaN(pct)) {
            next.customer_price = Math.round(xfer * (1 + pct / 100) * 100) / 100
          }
        }
        return next
      }),
    }))
  }

  function addProduct() { setForm(f => ({ ...f, items: [...f.items, emptyItem({ line_type: 'product' })] })) }
  function addUpgrade(parentId) { setForm(f => ({ ...f, items: [...f.items, emptyUpgrade(parentId)] })) }
  function addCharge(kind) { setForm(f => ({ ...f, items: [...f.items, emptyCharge(kind)] })) }
  function removeItem(id) {
    setForm(f => {
      const items = f.items.filter(it => it.id !== id && it.parent_id !== id)
      return { ...f, items: items.length ? items : [emptyItem()] }
    })
  }

  async function handleSave() {
    const filled = form.items.filter(it => (it.product_name || '').trim())
    if (!filled.length) { setError('Add at least one product or charge with a name.'); return }
    if (mode === 'revise' && !(form.revision_reason || '').trim()) { setError('Revision reason is required.'); return }
    setSaving(true); setError(''); setOk('')
    const nextVersion = mode === 'revise' && baseQuote
      ? (Number(baseQuote.version) || 1) + 1
      : (quotes.length ? Math.max(...quotes.map(q => q.version || 1)) + 1 : 1)
    const { quote, error: err } = await saveQuotation({
      opportunityId: opportunity.id,
      companyId: opportunity.company_id,
      quotation_no: mode === 'revise' ? (baseQuote?.quotation_no || form.quotation_no) : form.quotation_no,
      version: mode === 'create' && !quotes.length ? 1 : nextVersion,
      status: form.status || 'draft',
      validity_date: form.validity_date,
      delivery_tat: form.delivery_tat,
      payment_terms: form.payment_terms,
      transport_terms: form.transport_terms,
      special_terms: form.special_terms,
      revision_reason: form.revision_reason,
      no_regret_price: form.no_regret_price,
      notes: form.notes,
      items: form.items,
      supersedePreviousId: mode === 'revise' && baseQuote ? baseQuote.id : null,
    })
    setSaving(false)
    if (err) { setError(err.message || 'Save failed'); return }
    const no = quote?.quotation_no || 'Quote'
    setOk(`Saved ${no} · V${quote?.version || nextVersion}. Open it below to review.`)
    setMode(null)
    setBaseQuote(null)
    await load()
    if (quote?.total_value != null && onTotalChange) onTotalChange(quote.total_value)
  }

  async function setStatus(id, status) {
    const { error: err } = await updateQuoteStatus(id, status, opportunity.id)
    if (err) setError(err.message); else { setOk(`Status → ${status}`); load() }
  }

  const mainProducts = form.items.filter(it => (it.line_type || 'product') === 'product')
  const charges = form.items.filter(it => it.line_type === 'charge')
  const custTot = quoteCustomerTotal(form.items)
  const xferTot = quoteTransferTotal(form.items)
  const mgn = quoteMargin(form.items)

  function renderLineEditor(it, depth) {
    const isUpgrade = it.line_type === 'upgrade'
    const isCharge = it.line_type === 'charge'
    return (
      <div key={it.id} style={{
        marginLeft: depth * 16, marginBottom: 8, padding: 10,
        background: isUpgrade ? '#f0f9ff' : isCharge ? '#fefce8' : '#fff',
        border: '1px solid #e2e8f0', borderRadius: 8,
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <Badge tone={isUpgrade ? 'blue' : isCharge ? 'yellow' : 'gray'}>
            {isUpgrade ? 'Upgrade / component' : isCharge ? (it.charge_kind || 'Charge') : 'Base product'}
          </Badge>
          {isCharge && (
            <select className="input" style={{ width: 140, fontSize: 12 }} value={it.billing || 'on_bill'}
              onChange={e => setItem(it.id, 'billing', e.target.value)}>
              <option value="on_bill">On bill</option>
              <option value="off_invoice">Off invoice (in cost)</option>
            </select>
          )}
          <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(it.id)}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isCharge ? '1.2fr 0.5fr 0.7fr 0.6fr 0.7fr' : '1.1fr 0.6fr 0.6fr 0.45fr 0.65fr 0.55fr 0.65fr', gap: 6 }}>
          <input className="input" placeholder={isCharge ? 'Charge name' : isUpgrade ? 'Component e.g. 32GB DDR5' : 'Product e.g. Laptop base'}
            value={it.product_name} onChange={e => setItem(it.id, 'product_name', e.target.value)} />
          {!isCharge && (
            <>
              <input className="input" placeholder="Brand" value={it.brand || ''} onChange={e => setItem(it.id, 'brand', e.target.value)} />
              <input className="input" placeholder="Spec" value={it.specification || ''} onChange={e => setItem(it.id, 'specification', e.target.value)} />
              <input className="input" type="number" placeholder="Qty" value={it.quantity} onChange={e => setItem(it.id, 'quantity', e.target.value)} />
            </>
          )}
          {isCharge && (
            <input className="input" type="number" placeholder="Qty" value={it.quantity} onChange={e => setItem(it.id, 'quantity', e.target.value)} />
          )}
          <input className="input" type="number" placeholder="Transfer ₹" title="Buy / transfer price"
            value={it.transfer_price ?? ''} onChange={e => setItem(it.id, 'transfer_price', e.target.value)} />
          <input className="input" type="number" placeholder="Mgn %" title="Margin % on transfer fills customer price"
            value={it.margin_pct ?? ''} onChange={e => setItem(it.id, 'margin_pct', e.target.value)}
            disabled={it.billing === 'off_invoice'} />
          <input className="input" type="number" placeholder="Customer ₹" title="Sell price direct or from %"
            value={it.customer_price ?? ''} onChange={e => setItem(it.id, 'customer_price', e.target.value)}
            disabled={it.billing === 'off_invoice'} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 12, color: '#475569', flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="Vendor / source" value={it.vendor || ''}
            onChange={e => setItem(it.id, 'vendor', e.target.value)} />
          <span>Xfer ₹{lineTransferTotal(it).toLocaleString()}</span>
          <span style={{ fontWeight: 600 }}>
            {it.billing === 'off_invoice' ? 'Off invoice (in cost)' : `Cust ₹${lineCustomerTotal(it).toLocaleString()}`}
          </span>
          {!isCharge && !isUpgrade && (
            <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => addUpgrade(it.id)}>+ Upgrade / component</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Quotations</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Quote No · Revisions · Base + upgrades · Transfer / Margin % / Customer · On-bill / Off-invoice
          </div>
        </div>
        {!mode && (
          <button type="button" className="btn primary" onClick={startCreate}>
            {quotes.length ? '+ New revision' : '+ Create quote'}
          </button>
        )}
      </div>

      {error && <div className="notice" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>{error}</div>}
      {ok && <div className="notice" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>{ok}</div>}

      {mode && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            {mode === 'revise'
              ? `Revise ${baseQuote?.quotation_no || ''} V${baseQuote?.version} → V${(Number(baseQuote?.version) || 1) + 1}`
              : 'New quotation'}
          </div>
          {mode === 'revise' && (
            <Field label="Revision reason *">
              <input className="input" value={form.revision_reason}
                onChange={e => setForm({ ...form, revision_reason: e.target.value })}
                placeholder="e.g. RAM vendor change · price negotiation" />
            </Field>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <Field label="Validity">
              <input className="input" type="date" value={form.validity_date} onChange={e => setForm({ ...form, validity_date: e.target.value })} />
            </Field>
            <Field label="Delivery TAT">
              <input className="input" value={form.delivery_tat} onChange={e => setForm({ ...form, delivery_tat: e.target.value })} placeholder="e.g. 2–3 weeks" />
            </Field>
            <Field label="Payment terms">
              <input className="input" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. 30 days" />
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {QUOTE_STATUS.filter(s => s !== 'superseded').map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="notice" style={{ marginTop: 8, marginBottom: 10, fontSize: 12 }}>
            <strong>Pricing:</strong> Transfer ₹ (cost), then either <em>Mgn %</em> (fills Customer ₹) or type Customer ₹ (fills %).
            Upgrades under base product. Charges: On bill = invoice · Off invoice = cost only.
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Products & upgrades</div>
          {mainProducts.map(p => (
            <div key={p.id}>
              {renderLineEditor(p, 0)}
              {form.items.filter(it => it.line_type === 'upgrade' && it.parent_id === p.id).map(u => renderLineEditor(u, 1))}
            </div>
          ))}
          {form.items.filter(it => it.line_type === 'upgrade' && !mainProducts.find(p => p.id === it.parent_id)).map(u => renderLineEditor(u, 0))}
          <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={addProduct}>+ Base product</button>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Additional costs</div>
          {charges.map(c => renderLineEditor(c, 0))}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className="btn" onClick={() => addCharge('installation')}>+ Installation</button>
            <button type="button" className="btn" onClick={() => addCharge('warranty')}>+ Warranty</button>
            <button type="button" className="btn" onClick={() => addCharge('transport')}>+ Transport</button>
            <button type="button" className="btn" onClick={() => addCharge('other')}>+ Other charge</button>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13,
          }}>
            <div><div style={{ color: '#64748b', fontSize: 11 }}>Customer total (on bill)</div><strong>₹{custTot.toLocaleString()}</strong></div>
            <div><div style={{ color: '#64748b', fontSize: 11 }}>Transfer / cost total</div><strong>₹{xferTot.toLocaleString()}</strong></div>
            <div><div style={{ color: '#64748b', fontSize: 11 }}>Margin</div><strong style={{ color: mgn.amount >= 0 ? '#166534' : '#991b1b' }}>₹{mgn.amount.toLocaleString()} ({mgn.pct}%)</strong></div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={form.no_regret_price} onChange={e => setForm({ ...form, no_regret_price: e.target.checked })} />
                No-regret price
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => { setMode(null); setError('') }} disabled={saving}>Cancel</button>
            <button type="button" className="btn primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save quotation'}
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="loading" style={{ padding: 16 }}>Loading quotes…</div> : (
        quotes.length === 0 && !mode ? (
          <div className="empty" style={{ padding: 20 }}>No quotations yet. Create base + upgrades, then Save quotation.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {quotes.map(q => {
              const open = expandedId === q.id
              const items = q.quotation_items || []
              const mains = items.filter(it => (it.line_type || 'product') === 'product')
              return (
                <div key={q.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      onClick={() => setExpandedId(open ? null : q.id)}>
                      <strong>{q.quotation_no || 'Quote'} · V{q.version}</strong>{' · '}
                      <Badge tone={q.status === 'sent' ? 'yellow' : q.status === 'accepted' ? 'green' : q.status === 'superseded' ? 'gray' : 'blue'}>{q.status}</Badge>
                      {q.no_regret_price && <> · <Badge tone="green">No-regret</Badge></>}
                      <span style={{ marginLeft: 8 }}>Cust ₹{Number(q.total_value || 0).toLocaleString()}</span>
                      {q.transfer_total != null && <span style={{ color: '#64748b', fontSize: 12, marginLeft: 6 }}>Xfer ₹{Number(q.transfer_total).toLocaleString()}</span>}
                      {q.margin_pct != null && <span style={{ color: '#64748b', fontSize: 12, marginLeft: 6 }}>Mgn {q.margin_pct}%</span>}
                      {q.revision_reason && <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>· {q.revision_reason}</span>}
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {q.status !== 'superseded' && q.status !== 'sent' && (
                        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setStatus(q.id, 'sent')}>Mark sent</button>
                      )}
                      {q.status !== 'superseded' && (
                        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => startRevise(q)}>Revise</button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div style={{ marginTop: 10, fontSize: 12 }}>
                      {mains.map(p => (
                        <div key={p.id} style={{ marginBottom: 8 }}>
                          <div style={{ fontWeight: 600 }}>{p.product_name} {p.brand ? `· ${p.brand}` : ''} ×{p.quantity}</div>
                          <div style={{ color: '#64748b' }}>
                            Xfer ₹{Number(p.transfer_price || 0).toLocaleString()} → Cust ₹{Number(p.customer_price || p.unit_price || 0).toLocaleString()}
                            {p.vendor ? ` · ${p.vendor}` : ''}
                          </div>
                          {items.filter(u => u.line_type === 'upgrade' && u.parent_id === p.id).map(u => (
                            <div key={u.id} style={{ marginLeft: 14, marginTop: 4, color: '#1e40af' }}>
                              ↳ {u.product_name} {u.brand ? `(${u.brand})` : ''} ×{u.quantity}
                              {' · '}Xfer ₹{Number(u.transfer_price || 0).toLocaleString()} → Cust ₹{Number(u.customer_price || 0).toLocaleString()}
                              {u.vendor ? ` · ${u.vendor}` : ''}
                            </div>
                          ))}
                        </div>
                      ))}
                      {items.filter(it => it.line_type === 'charge').map(c => (
                        <div key={c.id} style={{ color: '#854d0e', marginBottom: 4 }}>
                          {c.product_name || c.charge_kind}
                          {' · '}{c.billing === 'off_invoice' ? 'Off invoice' : `On bill ₹${lineCustomerTotal(c).toLocaleString()}`}
                          {' · '}Xfer ₹{lineTransferTotal(c).toLocaleString()}
                        </div>
                      ))}
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
