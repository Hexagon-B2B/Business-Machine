import { useState, useEffect } from 'react'
import { Badge } from '../ui'
import {
  emptyItem, emptyUpgrade, emptyCharge, groupRollup, quoteGroups,
  loadQuotesForOpp, saveQuotation, updateQuoteStatus,
  formatQuoteForExcel, DEFAULT_TAX_PCT,
} from '../lib/quotations'
import { QuoteEditor } from './QuoteEditor'

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
  const [taxPct, setTaxPct] = useState(DEFAULT_TAX_PCT)
  const [copyOk, setCopyOk] = useState('')

  async function copyExcel(q) {
    const text = formatQuoteForExcel(q, taxPct)
    try {
      await navigator.clipboard.writeText(text)
      setCopyOk('Copied — paste into Excel (Ctrl+V)')
      setTimeout(() => setCopyOk(''), 3500)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setCopyOk('Copied — paste into Excel') }
      catch { setError('Could not copy — select the text manually') }
      document.body.removeChild(ta)
      setTimeout(() => setCopyOk(''), 3500)
    }
  }

  function blankForm() {
    return {
      validity_date: '', delivery_tat: '', payment_terms: '', transport_terms: '',
      special_terms: '', revision_reason: '', no_regret_price: false, notes: '', status: 'draft',
      items: [emptyItem({ line_type: 'product' })],
    }
  }

  /** Deep-clone quote lines with fresh tmp ids so parent/upgrade links stay intact and save creates a real next version. */
  function cloneItemsForRevise(items) {
    const src = Array.isArray(items) ? items : []
    if (!src.length) return [emptyItem({ line_type: 'product' })]
    const idMap = {}
    const cloned = src.map(it => {
      const newId = 'tmp_' + Math.random().toString(36).slice(2, 10)
      idMap[String(it.id)] = newId
      return {
        ...emptyItem(),
        ...it,
        id: newId,
        product_name: it.product_name || '',
        specification: it.specification || '',
        brand: it.brand || '',
        model_part_no: it.model_part_no || '',
        vendor: it.vendor || '',
        quantity: it.quantity != null && it.quantity !== '' ? it.quantity : 1,
        transfer_price: it.transfer_price ?? it.cost_price ?? '',
        customer_price: it.customer_price ?? it.unit_price ?? '',
        margin_pct: it.margin_pct ?? '',
        min_margin_pct: it.min_margin_pct ?? '',
        line_type: it.line_type || 'product',
        billing: it.billing || 'on_bill',
        charge_kind: it.charge_kind || '',
        notes: it.notes || '',
        parent_id: it.parent_id || null,
      }
    })
    return cloned.map(it => ({
      ...it,
      parent_id: it.parent_id && idMap[String(it.parent_id)] ? idMap[String(it.parent_id)] : null,
    }))
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
    if (!q) { setError('No quotation to revise.'); return }
    setBaseQuote(q); setMode('revise'); setError(''); setOk('')
    const items = cloneItemsForRevise(q.quotation_items)
    setForm({
      validity_date: q.validity_date || '',
      delivery_tat: q.delivery_tat || '',
      payment_terms: q.payment_terms || '',
      transport_terms: q.transport_terms || '',
      special_terms: q.special_terms || '',
      revision_reason: '',
      no_regret_price: !!q.no_regret_price,
      notes: q.notes || '',
      status: 'draft',
      items,
    })
  }

  function startHeaderAction() {
    const latest = quotes.find(q => q.status !== 'superseded') || quotes[0]
    if (latest) startRevise(latest)
    else startCreate()
  }

  function setItem(id, key, val) {
    setForm(f => ({
      ...f,
      items: f.items.map(it => {
        if (it.id !== id) return it
        const next = { ...it, [key]: val }
        if (it.line_type === 'upgrade' && key === 'margin_pct') next.min_margin_pct = val
        if (it.line_type === 'charge' && key === 'margin_pct') {
          const xfer = Number(next.transfer_price) || 0
          const pct = Number(val)
          if (xfer > 0 && val !== '' && !Number.isNaN(pct)) {
            next.customer_price = Math.round(xfer * (1 + pct / 100) * 100) / 100
          }
        }
        return next
      }),
    }))
  }

  function applyGroupMargin(baseId, marginPct) {
    setForm(f => {
      const items = f.items.map(it => it.id === baseId ? { ...it, margin_pct: marginPct } : it)
      const base = items.find(i => i.id === baseId)
      if (!base) return f
      const g = groupRollup(base, items)
      const cust = g.transferTotal > 0 && marginPct !== ''
        ? Math.round(g.transferTotal * (1 + Number(marginPct) / 100) * 100) / 100
        : base.customer_price
      return { ...f, items: items.map(it => it.id === baseId ? { ...it, margin_pct: marginPct, customer_price: cust } : it) }
    })
  }

  function setGroupCustomer(baseId, customerTotal) {
    setForm(f => {
      const base = f.items.find(i => i.id === baseId)
      if (!base) return f
      const g = groupRollup(base, f.items)
      let marginPct = ''
      if (g.transferTotal > 0 && customerTotal !== '') {
        marginPct = Math.round(((Number(customerTotal) - g.transferTotal) / g.transferTotal) * 1000) / 10
      }
      return { ...f, items: f.items.map(it => it.id === baseId ? { ...it, customer_price: customerTotal, margin_pct: marginPct } : it) }
    })
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
    try {
      const filled = form.items.filter(it => (it.product_name || '').trim())
      if (!filled.length) { setError('Add at least one product or charge with a name.'); return }
      if (mode === 'revise' && !(form.revision_reason || '').trim()) {
        setError('Enter a revision reason (what changed), then Save again.'); return }
      if (!opportunity?.id) { setError('Deal not loaded — close and reopen.'); return }

      let items = form.items.map(it => ({ ...it }))
      for (const prod of items.filter(i => (i.line_type || 'product') === 'product')) {
        const g = groupRollup(prod, items)
        if (prod.margin_pct !== '' && prod.margin_pct != null && g.transferTotal > 0) {
          const cust = Math.round(g.transferTotal * (1 + Number(prod.margin_pct) / 100) * 100) / 100
          items = items.map(i => i.id === prod.id ? { ...i, customer_price: cust } : i)
        }
      }
      items = items.map(i => {
        if (i.line_type === 'upgrade' && i.margin_pct !== '' && i.margin_pct != null && (i.min_margin_pct === '' || i.min_margin_pct == null)) {
          return { ...i, min_margin_pct: i.margin_pct }
        }
        return i
      })

      setSaving(true); setError(''); setOk('')
      const isRevise = mode === 'revise' && baseQuote
      const maxVer = quotes.length ? Math.max(...quotes.map(q => Number(q.version) || 1)) : 0
      const nextVersion = isRevise
        ? Math.max((Number(baseQuote.version) || 1) + 1, maxVer + 1)
        : (quotes.length ? maxVer + 1 : 1)
      const { quote, error: err } = await saveQuotation({
        opportunityId: opportunity.id,
        companyId: opportunity.company_id,
        quotation_no: isRevise ? (baseQuote.quotation_no || '') : '',
        version: nextVersion,
        status: form.status || 'draft',
        validity_date: form.validity_date,
        delivery_tat: form.delivery_tat,
        payment_terms: form.payment_terms,
        transport_terms: form.transport_terms,
        special_terms: form.special_terms,
        revision_reason: isRevise ? (form.revision_reason || '').trim() : (form.revision_reason || null),
        no_regret_price: form.no_regret_price,
        notes: form.notes,
        items,
        supersedePreviousId: isRevise ? baseQuote.id : null,
      })
      setSaving(false)
      if (err) { setError(err.message || 'Save failed'); return }
      setOk(`Saved ${quote?.quotation_no || 'Quote'} · V${quote?.version || nextVersion}`)
      setMode(null); setBaseQuote(null); setExpandedId(quote?.id || null)
      await load()
      if (quote?.total_value != null && onTotalChange) onTotalChange(quote.total_value)
    } catch (ex) {
      setSaving(false)
      setError(ex.message || 'Unexpected error while saving')
    }
  }

  async function setStatus(id, status) {
    const { error: err } = await updateQuoteStatus(id, status, opportunity.id)
    if (err) setError(err.message); else { setOk(`Status → ${status}`); load() }
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Quotations</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Base + upgrades → 1 commercial line · Margin on total TP · Sub-line min margin</div>
        </div>
        {!mode && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={startHeaderAction}>
              {quotes.length ? 'Revise latest quote' : '+ Create quote'}
            </button>
            {quotes.length > 0 && (
              <button type="button" className="btn" onClick={startCreate} title="Start a completely new quote number (not a revision)">
                + New quote no.
              </button>
            )}
          </div>
        )}
      </div>
      {error && <div className="notice" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>{error}</div>}
      {ok && <div className="notice" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>{ok}</div>}
      {copyOk && <div className="notice" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>{copyOk}</div>}
      {mode && (
        <QuoteEditor
          form={form} setForm={setForm} mode={mode} baseQuote={baseQuote} saving={saving}
          onSave={handleSave} onCancel={() => { setMode(null); setError('') }}
          setItem={setItem} applyGroupMargin={applyGroupMargin} setGroupCustomer={setGroupCustomer}
          addProduct={addProduct} addUpgrade={addUpgrade} addCharge={addCharge} removeItem={removeItem}
        />
      )}
      {loading ? <div className="loading" style={{ padding: 16 }}>Loading…</div> : (
        quotes.length === 0 && !mode ? (
          <div className="empty" style={{ padding: 20 }}>No quotations yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {quotes.map(q => {
              const open = expandedId === q.id
              const items = q.quotation_items || []
              return (
                <div key={q.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      onClick={() => setExpandedId(open ? null : q.id)}>
                      <strong>{q.quotation_no || 'Quote'} · V{q.version}</strong>
                      {' · '}<Badge tone={q.status === 'superseded' ? 'gray' : q.status === 'sent' ? 'yellow' : 'blue'}>{q.status}</Badge>
                      <span style={{ marginLeft: 8 }}>Cust ₹{Number(q.total_value || 0).toLocaleString()}</span>
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
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 12, color: '#64748b' }}>
                          Tax %{' '}
                          <input className="input" type="number" style={{ width: 64, display: 'inline-block', padding: '2px 6px' }}
                            value={taxPct} onChange={e => setTaxPct(e.target.value)} />
                        </label>
                        <button type="button" className="btn primary" style={{ fontSize: 11, padding: '3px 10px' }}
                          onClick={() => copyExcel(q)}>Copy for Excel</button>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                        Product name with upgrades: base + each upgrade joined (e.g. “Laptop (Dell) + 16GB RAM [incl. 1 upgrade]”).
                      </div>
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Item name</th>
                            <th>Customer Rate</th>
                            <th>Qty</th>
                            <th>Tax %</th>
                            <th>Tax Amount</th>
                            <th>Total amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const groups = quoteGroups(items)
                            const charges = items.filter(it => it.line_type === 'charge')
                            const tax = Number(taxPct) || 0
                            let sub = 0
                            const body = []
                            groups.forEach((g, i) => {
                              const qty = g.qty || 1
                              const lineTotal = Number(g.customerTotal) || 0
                              const rate = qty > 0 ? Math.round((lineTotal / qty) * 100) / 100 : lineTotal
                              const taxAmt = Math.round(lineTotal * tax / 100 * 100) / 100
                              const total = Math.round((lineTotal + taxAmt) * 100) / 100
                              sub += lineTotal
                              body.push(
                                <tr key={'g'+i}>
                                  <td style={{ fontWeight: 600, maxWidth: 320 }}>{g.mergedDescription}</td>
                                  <td>₹{rate.toLocaleString()}</td>
                                  <td>{qty}</td>
                                  <td>{tax}</td>
                                  <td>₹{taxAmt.toLocaleString()}</td>
                                  <td>₹{total.toLocaleString()}</td>
                                </tr>
                              )
                              g.upgrades.forEach((u, ui) => {
                                body.push(
                                  <tr key={'u'+i+'-'+ui} style={{ background: '#f0f9ff' }}>
                                    <td style={{ paddingLeft: 16, color: '#475569' }}>↳ upgrade: {(u.product_name || '').trim() || 'Upgrade'}{[u.brand, u.specification].filter(Boolean).length ? ` (${[u.brand, u.specification].filter(Boolean).join(' ')})` : ''}</td>
                                    <td style={{ color: '#94a3b8' }} colSpan={5}>rolls into parent · TP ₹{((Number(u.quantity)||0)*(Number(u.transfer_price)||0)).toLocaleString()}</td>
                                  </tr>
                                )
                              })
                            })
                            charges.forEach((c, i) => {
                              const qty = Number(c.quantity) || 1
                              const rate = Number(c.customer_price) || 0
                              const lineTotal = c.billing === 'off_invoice' ? 0 : Math.round(qty * rate * 100) / 100
                              const taxAmt = Math.round(lineTotal * tax / 100 * 100) / 100
                              const total = Math.round((lineTotal + taxAmt) * 100) / 100
                              if (c.billing !== 'off_invoice') sub += lineTotal
                              body.push(
                                <tr key={'c'+i}>
                                  <td>{(c.product_name || c.charge_kind || 'Charge')}{c.billing === 'off_invoice' ? ' (off invoice)' : ''}</td>
                                  <td>₹{rate.toLocaleString()}</td>
                                  <td>{qty}</td>
                                  <td>{c.billing === 'off_invoice' ? 0 : tax}</td>
                                  <td>₹{taxAmt.toLocaleString()}</td>
                                  <td>₹{total.toLocaleString()}</td>
                                </tr>
                              )
                            })
                            const taxTotal = Math.round(sub * tax / 100 * 100) / 100
                            const grand = Math.round((sub + taxTotal) * 100) / 100
                            body.push(<tr key="sub"><td colSpan={5} style={{ textAlign: 'right', fontWeight: 600 }}>Subtotal (ex-tax)</td><td>₹{sub.toLocaleString()}</td></tr>)
                            body.push(<tr key="tax"><td colSpan={5} style={{ textAlign: 'right' }}>Tax ({tax}%)</td><td>₹{taxTotal.toLocaleString()}</td></tr>)
                            body.push(<tr key="grand"><td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>Grand total</td><td style={{ fontWeight: 700 }}>₹{grand.toLocaleString()}</td></tr>)
                            return body
                          })()}
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
