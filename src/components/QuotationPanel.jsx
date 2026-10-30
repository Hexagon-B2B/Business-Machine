import { useState, useEffect, useRef } from 'react'
import { Badge } from '../ui'
import {
  emptyItem, emptyUpgrade, emptyCharge, groupRollup, quoteGroups,
  loadQuotesForOpp, saveQuotation, updateQuoteStatus,
  formatQuoteForExcel, customerQuoteNo, DEFAULT_TAX_PCT,
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
  const [copyModal, setCopyModal] = useState(null)
  const copyRef = useRef(null)

  function blankForm() {
    return {
      validity_date: '', delivery_tat: '', payment_terms: '', transport_terms: '',
      special_terms: '', revision_reason: '', no_regret_price: false, notes: '', status: 'draft',
      items: [emptyItem({ line_type: 'product' })],
    }
  }

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
        charge_kind: typeof it.charge_kind === 'string' ? it.charge_kind : '',
        notes: it.notes || '',
        optionality: it.optionality === 'optional' ? 'optional' : 'mandatory',
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
    if (q.length && !expandedId) setExpandedId(q[0].id)
    // Do not call onTotalChange on initial load — prevents blink from Company tab
  }

  function startCreate() {
    setBaseQuote(null); setMode('create'); setForm(blankForm()); setError(''); setOk('')
  }

  function startRevise(q) {
    if (!q) { setError('No quotation to revise.'); return }
    setBaseQuote(q); setMode('revise'); setError(''); setOk('')
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
      items: cloneItemsForRevise(q.quotation_items),
    })
  }

  function startHeaderAction() {
    const latest = quotes.find(q => q.status !== 'superseded') || quotes[0]
    if (latest) startRevise(latest)
    else startCreate()
  }

  function openCopyModal(q) {
    const text = formatQuoteForExcel(q, taxPct)
    setCopyModal({ text, label: customerQuoteNo(q) })
    setTimeout(() => {
      if (copyRef.current) { copyRef.current.focus(); copyRef.current.select() }
    }, 50)
  }

  async function doCopy() {
    if (!copyModal?.text) return
    try {
      await navigator.clipboard.writeText(copyModal.text)
      setOk('Copied — paste into Excel (Ctrl+V)')
      setTimeout(() => setOk(''), 3500)
      setCopyModal(null)
    } catch {
      try {
        copyRef.current?.select()
        document.execCommand('copy')
        setOk('Copied — paste into Excel')
        setTimeout(() => setOk(''), 3500)
        setCopyModal(null)
      } catch {
        setError('Select all text in the box and press Ctrl+C')
      }
    }
  }

  function setItem(id, key, val) {
    setForm(f => {
      let items = f.items.map(it => {
        if (it.id !== id) return it
        const next = { ...it, [key]: val }
        if (it.line_type === 'upgrade' && key === 'margin_pct') next.min_margin_pct = val
        return next
      })
      // When min mgn % or transfer/qty changes on a base product, recalculate customer unit rate
      const changed = items.find(it => it.id === id)
      if (changed && (changed.line_type || 'product') === 'product' &&
          (key === 'min_margin_pct' || key === 'transfer_price' || key === 'quantity')) {
        const g = groupRollup(changed, items)
        if (g.transferTotal > 0 && g.customerTotal > 0) {
          const unit = g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : g.customerTotal
          items = items.map(it => it.id === id
            ? { ...it, customer_price: unit, margin_pct: it.margin_pct !== '' && it.margin_pct != null ? it.margin_pct : (g.marginPct ?? '') }
            : it)
        }
      }
      return { ...f, items }
    })
  }

  function applyGroupMargin(baseId, marginPct) {
    setForm(f => {
      const items = f.items.map(it => it.id === baseId ? { ...it, margin_pct: marginPct } : it)
      const base = items.find(i => i.id === baseId)
      if (!base) return f
      const g = groupRollup({ ...base, margin_pct: marginPct }, items)
      const qty = Number(base.quantity) || 1
      // customer_price is unit rate
      const unit = g.customerTotal > 0 && qty > 0
        ? Math.round((g.customerTotal / qty) * 100) / 100
        : (marginPct !== '' && g.transferTotal > 0
          ? Math.round((g.transferTotal * (1 + Number(marginPct) / 100) / qty) * 100) / 100
          : base.customer_price)
      return { ...f, items: items.map(it => it.id === baseId ? { ...it, margin_pct: marginPct, customer_price: unit } : it) }
    })
  }

  function setGroupCustomer(baseId, unitRate) {
    setForm(f => {
      const base = f.items.find(i => i.id === baseId)
      if (!base) return f
      // Clear markup so min floor / entered rate drive the total
      const items = f.items.map(it => it.id === baseId
        ? { ...it, customer_price: unitRate, margin_pct: '' }
        : it)
      const updated = items.find(i => i.id === baseId)
      const g = groupRollup(updated, items)
      // If min mgn lifts the rate, reflect that in the field
      const qty = Number(updated.quantity) || 1
      const unit = g.customerTotal > 0 && qty > 0
        ? Math.round((g.customerTotal / qty) * 100) / 100
        : unitRate
      return {
        ...f,
        items: items.map(it => it.id === baseId
          ? { ...it, customer_price: unit, margin_pct: g.marginPct != null ? g.marginPct : '' }
          : it),
      }
    })
  }

  function addProduct() { setForm(f => ({ ...f, items: [...f.items, emptyItem({ line_type: 'product' })] })) }
  function addUpgrade(parentId) { setForm(f => ({ ...f, items: [...f.items, emptyUpgrade(parentId)] })) }
  function addCharge(kind) {
    const k = typeof kind === 'string' ? kind : 'other'
    setForm(f => ({ ...f, items: [...f.items, emptyCharge(k)] }))
  }
  function removeItem(id) {
    setForm(f => {
      const items = f.items.filter(it => it.id !== id && it.parent_id !== id)
      return { ...f, items: items.length ? items : [emptyItem()] }
    })
  }

  async function handleSave() {
    try {
      const filled = form.items.filter(it => (it.product_name || '').trim() || (it.line_type === 'charge' && (Number(it.customer_price) || 0) > 0))
      if (!filled.length) { setError('Add at least one product or charge with a name / amount.'); return }
      if (mode === 'revise' && !(form.revision_reason || '').trim()) {
        setError('Enter a revision reason (what changed), then Save again.'); return }
      if (!opportunity?.id) { setError('Deal not loaded — close and reopen.'); return }

      // Always sync customer_price from groupRollup so Min mgn % floor and
      // % Markup / sub-item extras are persisted correctly
      let items = form.items.map(it => ({ ...it }))
      for (const prod of items.filter(i => (i.line_type || 'product') === 'product')) {
        const g = groupRollup(prod, items)
        if (g.transferTotal > 0 || g.customerTotal > 0) {
          const unit = g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : g.customerTotal
          items = items.map(i => i.id === prod.id
            ? { ...i, customer_price: unit, margin_pct: g.marginPct != null ? g.marginPct : i.margin_pct }
            : i)
        }
      }

      setSaving(true); setError(''); setOk('')
      const isRevise = mode === 'revise' && baseQuote
      const { quote, error: err } = await saveQuotation({
        opportunityId: opportunity.id,
        companyId: opportunity.company_id,
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
      setOk('Saved ' + customerQuoteNo(quote))
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
    if (err) setError(err.message); else { setOk('Status → ' + status); load() }
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Quotations</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Validity & Delivery TAT on the quote · Copy for Excel opens a popup</div>
        </div>
        {!mode && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={startHeaderAction}>
              {quotes.length ? 'Revise latest quote' : '+ Create quote'}
            </button>
            {quotes.length > 0 && (
              <button type="button" className="btn" onClick={startCreate}>+ New quote no.</button>
            )}
          </div>
        )}
      </div>
      {error && <div className="notice" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>{error}</div>}
      {ok && <div className="notice" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>{ok}</div>}

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
              return (
                <div key={q.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      onClick={() => setExpandedId(open ? null : q.id)}>
                      <strong>{customerQuoteNo(q)}</strong>
                      {' · '}<Badge tone={q.status === 'superseded' ? 'gray' : q.status === 'sent' ? 'yellow' : 'blue'}>{q.status}</Badge>
                      <span style={{ marginLeft: 8 }}>Cust ₹{Number(q.total_value || 0).toLocaleString('en-IN')}</span>
                      {q.validity_date && <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>· Valid {q.validity_date}</span>}
                    </button>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="btn primary" style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={() => openCopyModal(q)}>Copy for Excel</button>
                      {q.status !== 'superseded' && q.status !== 'sent' && (
                        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setStatus(q.id, 'sent')}>Mark sent</button>
                      )}
                      {q.status !== 'superseded' && (
                        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => startRevise(q)}>Revise</button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                      Validity: {q.validity_date || '—'} · TAT: {q.delivery_tat || '—'} · Tax %{' '}
                      <input className="input" type="number" style={{ width: 56, display: 'inline-block', padding: '2px 6px' }}
                        value={taxPct} onChange={e => setTaxPct(e.target.value)} />
                      {' '}
                      <button type="button" className="btn primary" style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={() => openCopyModal(q)}>Copy for Excel</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {copyModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setCopyModal(null)}>
          <div className="card" style={{ width: 560, maxWidth: '96vw', maxHeight: '85vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Copy for Excel — {copyModal.label}</h2>
              <button type="button" className="btn ghost" onClick={() => setCopyModal(null)}>×</button>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              Click <strong>Copy</strong>, then open Excel and paste (Ctrl+V). Columns: SL No · Brand · Description · Rate · Qty · Amount.
            </p>
            <textarea
              ref={copyRef}
              readOnly
              value={copyModal.text}
              style={{
                width: '100%', minHeight: 220, fontFamily: 'ui-monospace, monospace', fontSize: 12,
                padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, resize: 'vertical',
              }}
              onFocus={e => e.target.select()}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setCopyModal(null)}>Close</button>
              <button type="button" className="btn primary" onClick={doCopy}>Copy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
