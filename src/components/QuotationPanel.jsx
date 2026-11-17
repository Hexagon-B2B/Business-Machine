import { useState, useEffect, useRef } from 'react'
import { Badge } from '../ui'
import {
  emptyItem, emptyUpgrade, emptyCharge, groupRollup, quoteGroups,
  loadQuotesForOpp, saveQuotation, updateQuoteStatus,
  formatQuoteForExcel, customerQuoteNo, downloadQuotePdf, openQuotePrintWindow, DEFAULT_TAX_PCT,
} from '../lib/quotations'
import { QuoteEditor } from './QuoteEditor'
import { HEXAGON_LOGO_DATA_URL, HEXAGON_PARTNERS_DATA_URL, HEXAGON_SIGNATURE_DATA_URL, QUOTE_SIGNATORY } from '../lib/brandAssets'

function blankForm() {
  return {
    validity_date: '',
    delivery_tat: '',
    payment_terms: '',
    transport_terms: '',
    delivery_location: '',
    special_terms: '',
    revision_reason: '',
    no_regret_price: false,
    notes: '',
    status: 'draft',
    items: [emptyItem({ line_type: 'product' })],
  }
}

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
  const [copyText, setCopyText] = useState('')
  const [showCopy, setShowCopy] = useState(false)
  const copyRef = useRef(null)

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
    if (err) setError(err.message || 'Could not load quotes')
    setQuotes(q || [])
  }

  function startCreate() {
    setBaseQuote(null); setMode('create'); setError(''); setOk('')
    setForm(blankForm())
  }

  function startRevise(q) {
    if (!q) { setError('No quotation to revise.'); return }
    setBaseQuote(q); setMode('revise'); setError(''); setOk('')
    setForm({
      validity_date: q.validity_date || '',
      delivery_tat: q.delivery_tat || '',
      payment_terms: q.payment_terms || '',
      transport_terms: q.transport_terms || '',
      delivery_location: q.delivery_location || '',
      special_terms: q.special_terms || '',
      revision_reason: 'Revised pricing / scope',
      no_regret_price: !!q.no_regret_price,
      notes: q.notes || '',
      status: 'draft',
      items: cloneItemsForRevise(q.quotation_items),
    })
  }

  function startHeaderAction() {
    const latest = quotes[0]
    if (latest) startRevise(latest)
    else startCreate()
  }

  function openCopyModal(q) {
    const text = formatQuoteForExcel(q)
    setCopyText(text)
    setShowCopy(true)
    setTimeout(() => { try { copyRef.current?.select() } catch (_) {} }, 50)
  }

  async function exportPdf(q) {
    const co = opportunity?.companies || opportunity?.company || {}
    const legal =
      co.legal_name ||
      opportunity?.legal_name ||
      co.name ||
      opportunity?.company_name ||
      opportunity?.companies?.name ||
      opportunity?.company?.name ||
      'Customer'
    const city = co.city || opportunity?.city || ''
    const contacts = opportunity?._contacts || opportunity?.contacts || []
    let attention = opportunity?.primary_contact_name || ''
    if (!attention && opportunity?.primary_contact_id) {
      const ct = contacts.find(c => String(c.id) === String(opportunity.primary_contact_id))
      attention = ct?.full_name || ''
    }
    setError('')
    setOk('Preparing PDF…')
    try {
      const { error: err } = await downloadQuotePdf(q, {
        companyName: String(legal).trim() || 'Customer',
        companyCity: String(city || '').trim(),
        attentionTo: String(attention || '').trim(),
        opportunityName: opportunity?.name || opportunity?.title || '',
        logoDataUrl: HEXAGON_LOGO_DATA_URL,
        partnersDataUrl: HEXAGON_PARTNERS_DATA_URL,
        signatureDataUrl: HEXAGON_SIGNATURE_DATA_URL,
        signatory: QUOTE_SIGNATORY,
        deliveryLocation: q.delivery_location || '',
      })
      if (err) {
        setOk('')
        setError(err.message)
      } else {
        setOk('PDF downloaded')
        setTimeout(() => setOk(''), 2500)
      }
    } catch (ex) {
      setOk('')
      setError(ex.message || 'PDF download failed')
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
      const changed = items.find(it => it.id === id)
      if (changed && (changed.line_type || 'product') === 'product' && key === 'quantity') {
        const q = Number(val) || 1
        items = items.map(it =>
          it.line_type === 'upgrade' && String(it.parent_id) === String(id)
            ? { ...it, quantity: q }
            : it
        )
      }
      const driverKeys = ['min_margin_pct', 'margin_pct', 'transfer_price', 'quantity']
      if (changed && (changed.line_type || 'product') === 'product' && driverKeys.includes(key)) {
        const prod = items.find(it => it.id === id) || changed
        if (g => true) {
          const g = groupRollup(prod, items)
          if (g.customerTotal > 0 || g.transferTotal > 0) {
            const unit = g.unitCustomer != null
              ? g.unitCustomer
              : (g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : g.customerTotal)
            items = items.map(it => it.id === id ? { ...it, customer_price: unit } : it)
          }
        }
      }
      if (changed && changed.line_type === 'upgrade' && (key === 'margin_pct' || key === 'min_margin_pct' || key === 'transfer_price' || key === 'quantity')) {
        const parent = items.find(it => it.id === changed.parent_id || String(it.id) === String(changed.parent_id))
        if (parent) {
          const g = groupRollup(parent, items)
          const unit = g.unitCustomer != null
            ? g.unitCustomer
            : (g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : g.customerTotal)
          items = items.map(it => it.id === parent.id ? { ...it, customer_price: unit } : it)
        }
      }
      return { ...f, items }
    })
  }

  function applyGroupMargin(parentId, pct) {
    setForm(f => {
      const items = f.items.map(it => it.id === parentId ? { ...it, margin_pct: pct } : it)
      const prod = items.find(it => it.id === parentId)
      if (!prod) return { ...f, items }
      const g = groupRollup(prod, items)
      const unit = g.unitCustomer != null ? g.unitCustomer : (g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : 0)
      return { ...f, items: items.map(it => it.id === parentId ? { ...it, customer_price: unit, margin_pct: pct } : it) }
    })
  }

  function setGroupCustomer(parentId, unitRate) {
    setForm(f => ({
      ...f,
      items: f.items.map(it => it.id === parentId ? { ...it, customer_price: unitRate } : it),
    }))
  }

  function addProduct() {
    setForm(f => ({ ...f, items: [...f.items, emptyItem({ line_type: 'product' })] }))
  }
  function addUpgrade(parentId) {
    setForm(f => {
      const parent = f.items.find(it => it.id === parentId)
      const q = parent ? (Number(parent.quantity) || 1) : 1
      return { ...f, items: [...f.items, emptyUpgrade(parentId, q)] }
    })
  }
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
      let items = form.items.map(it => ({ ...it }))
      for (const prod of items.filter(i => (i.line_type || 'product') === 'product')) {
        const g = groupRollup(prod, items)
        if (g.transferTotal > 0 || g.customerTotal > 0) {
          const unit = g.unitCustomer != null
            ? g.unitCustomer
            : (g.qty > 0 ? Math.round((g.customerTotal / g.qty) * 100) / 100 : g.customerTotal)
          items = items.map(i => i.id === prod.id ? { ...i, customer_price: unit } : i)
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
        delivery_location: form.delivery_location,
        special_terms: form.special_terms,
        revision_reason: isRevise ? (form.revision_reason || '').trim() : (form.revision_reason || null),
        no_regret_price: form.no_regret_price,
        notes: form.notes,
        items,
        supersedePreviousId: isRevise ? baseQuote.id : null,
      })
      setSaving(false)
      if (err) {
        const msg = err.message || 'Save failed'
        setError(msg + (/json|metadata|too long|payload|413|540/i.test(msg) ? ' — quote metadata may be too large; contact admin.' : ''))
        return
      }
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
    const { error: err } = await updateQuoteStatus(opportunity.id, id, status)
    if (err) setError(err.message)
    else load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Quotations</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn primary" onClick={startHeaderAction}>
            {quotes.length ? 'Revise latest quote' : '+ Create quote'}
          </button>
          {quotes.length > 0 && (
            <button type="button" className="btn" onClick={startCreate}>+ New quote number</button>
          )}
        </div>
      </div>

      {error && <div className="notice" style={{ marginBottom: 10, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
      {ok && <div className="notice" style={{ marginBottom: 10 }}>{ok}</div>}

      {mode && (
        <QuoteEditor
          form={form} setForm={setForm} mode={mode} baseQuote={baseQuote} saving={saving}
          onSave={handleSave} onCancel={() => { if (window.confirm('Close without saving this quotation?')) { setMode(null); setError('') } }}
          setItem={setItem} applyGroupMargin={applyGroupMargin} setGroupCustomer={setGroupCustomer}
          addProduct={addProduct} addUpgrade={addUpgrade} addCharge={addCharge} removeItem={removeItem}
        />
      )}

      {loading ? <div className="loading" style={{ padding: 16 }}>Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {quotes.map(q => {
            const open = expandedId === q.id
            const items = q.quotation_items || []
            const groups = quoteGroups(items)
            return (
            <div key={q.id} className="card" style={{ padding: 12 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}
                onClick={() => setExpandedId(open ? null : q.id)}
              >
                <div>
                  <strong>{customerQuoteNo(q)}</strong>
                  <span style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>v{q.version || 1}</span>
                  <span style={{ marginLeft: 8 }}><Badge>{q.status || 'draft'}</Badge></span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#2563eb' }}>{open ? 'Hide preview ▲' : 'Preview ▼'}</span>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Customer ₹{(q.total_value || 0).toLocaleString('en-IN')}
                    {q.revision_reason ? <span style={{ color: '#64748b' }}> · {q.revision_reason}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                  <button type="button" className="btn primary" style={{ fontSize: 12 }} onClick={() => exportPdf(q)}>Export PDF</button>
                  <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => openCopyModal(q)}>Copy for Excel</button>
                  {q.status !== 'superseded' && (
                    <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => startRevise(q)}>Revise</button>
                  )}
                  {q.status === 'draft' && (
                    <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setStatus(q.id, 'sent')}>Mark sent</button>
                  )}
                </div>
              </div>
              {open && (
                <div style={{
                  marginTop: 14,
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                    color: '#f8fafc',
                    padding: '18px 22px',
                  }}>
                    <div style={{ fontSize: 11, letterSpacing: '0.14em', fontWeight: 700, opacity: 0.75, marginBottom: 4 }}>
                      COMMERCIAL DOCUMENT
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.02em' }}>QUOTATION</div>
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 13, opacity: 0.92 }}>
                      <span><strong style={{ opacity: 0.7, fontWeight: 600 }}>Quote No.</strong> {customerQuoteNo(q)}</span>
                      <span><strong style={{ opacity: 0.7, fontWeight: 600 }}>Version</strong> {q.version || 1}</span>
                      <span><strong style={{ opacity: 0.7, fontWeight: 600 }}>Status</strong> {(q.status || 'draft').toUpperCase()}</span>
                      {q.created_at && (
                        <span><strong style={{ opacity: 0.7, fontWeight: 600 }}>Dated</strong> {String(q.created_at).slice(0, 10)}</span>
                      )}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 0,
                    borderBottom: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}>
                    {[
                      ['Validity', q.validity_date || '—'],
                      ['Delivery TAT', q.delivery_tat || '—'],
                      ['Payment terms', q.payment_terms || '—'],
                      ['Delivery location', q.delivery_location || q.transport_terms || '—'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ padding: '12px 18px', borderRight: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '16px 18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f172a', marginBottom: 10, borderBottom: '2px solid #0f172a', paddingBottom: 6 }}>
                      Line items
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #cbd5e1', width: 36 }}>SL</th>
                          <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #cbd5e1' }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #cbd5e1', width: 56 }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #cbd5e1', width: 100 }}>Rate ₹</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #cbd5e1', width: 110 }}>Amount ₹</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.filter(g => !g.isOptional).map((g, i) => {
                          const rate = g.unitCustomer != null ? g.unitCustomer : (g.qty ? Math.round((g.customerTotal / g.qty) * 100) / 100 : 0)
                          return (
                            <tr key={g.base.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ padding: '8px 6px', color: '#64748b', verticalAlign: 'top' }}>{i + 1}</td>
                              <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{(g.base.product_name || 'Product').trim()}</div>
                                {[g.base.brand, g.base.specification].filter(Boolean).length > 0 && (
                                  <div style={{ fontSize: 12, color: '#475569' }}>{[g.base.brand, g.base.specification].filter(Boolean).join(' · ')}</div>
                                )}
                                {(g.upgrades || []).length > 0 && (
                                  <div style={{ marginTop: 6, fontSize: 12, color: '#334155' }}>
                                    <strong>Additional:</strong> {(g.upgrades || []).map(u => u.product_name).filter(Boolean).join('; ')}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 6px', textAlign: 'right', verticalAlign: 'top' }}>{g.qty}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right', verticalAlign: 'top' }}>{Number(rate).toLocaleString('en-IN')}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>{Number(g.customerTotal || 0).toLocaleString('en-IN')}</td>
                            </tr>
                          )
                        })}
                        {items.filter(it => it.line_type === 'charge').map((c, i) => {
                          const amt = (Number(c.quantity) || 1) * (Number(c.customer_price) || 0)
                          return (
                            <tr key={c.id || ('ch' + i)} style={{ background: '#fff' }}>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>{groups.filter(g => !g.isOptional).length + i + 1}</td>
                              <td style={{ padding: '8px 6px', fontWeight: 600 }}>{c.product_name || c.charge_kind || 'Charge'}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{c.quantity || 1}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{Number(c.customer_price || 0).toLocaleString('en-IN')}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{Number(amt).toLocaleString('en-IN')}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ width: 260 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                          <span>Subtotal (ex-tax)</span>
                          <strong>₹ {(q.total_value || 0).toLocaleString('en-IN')}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, borderTop: '2px solid #0f172a', paddingTop: 8, marginTop: 4 }}>
                          <span>Quoted value</span>
                          <span>₹ {(q.total_value || 0).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const fmt = (n) => Number(n || 0).toLocaleString('en-IN')
                    const cost = Number(q.transfer_total) || groups.reduce((s, g) => s + (Number(g.transferTotal) || 0), 0)
                    const sell = Number(q.total_value) || 0
                    const mgn = sell - cost
                    const mgnPct = cost > 0 ? Math.round((mgn / cost) * 1000) / 10 : 0
                    const stdExtra = groups.reduce((s, g) => s + (Number(g.upgradeStdExtra) || 0), 0)
                    return (
                      <div style={{
                        margin: '0 18px 16px',
                        border: '1px solid #fcd34d',
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: '#fffbeb',
                      }}>
                        <div style={{
                          background: 'linear-gradient(180deg, #92400e 0%, #b45309 100%)',
                          color: '#fff',
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 8,
                        }}>
                          <div>
                            <div style={{ fontSize: 10, letterSpacing: '0.12em', fontWeight: 800, opacity: 0.85 }}>INTERNAL ONLY · NOT FOR CUSTOMER</div>
                            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>Quotation P&L</div>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.9 }}>Transfer cost vs customer sell · margin</div>
                        </div>
                        <div style={{ padding: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#92400e', marginBottom: 8 }}>
                            Cost roll-up by package
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 6, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: '#fef3c7' }}>
                                <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #fcd34d' }}>Product / package</th>
                                <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 80 }}>Qty</th>
                                <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 100 }}>Transfer ₹</th>
                                <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 100 }}>Customer ₹</th>
                                <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 72 }}>Mgn %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groups.filter(g => !g.isOptional).map((g, i) => {
                                const t = Number(g.transferTotal) || 0
                                const c = Number(g.customerTotal) || 0
                                const pct = t > 0 ? Math.round(((c - t) / t) * 1000) / 10 : 0
                                const path = [g.base.brand, g.base.model_part_no].filter(Boolean).join(' · ')
                                return (
                                  <tr key={g.base.id || i} style={{ background: i % 2 ? '#fffbeb' : '#fff' }}>
                                    <td style={{ padding: '7px 6px', verticalAlign: 'top' }}>
                                      <div style={{ fontWeight: 600 }}>{(g.base.product_name || 'Product').trim()}</div>
                                      {path && <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>{path}</div>}
                                      {(g.upgrades || []).length > 0 && (
                                        <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>
                                          + {(g.upgrades || []).map(u => u.product_name).filter(Boolean).join(', ')}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '7px 6px', textAlign: 'right', verticalAlign: 'top' }}>{g.qty}</td>
                                    <td style={{ padding: '7px 6px', textAlign: 'right', verticalAlign: 'top' }}>{fmt(t)}</td>
                                    <td style={{ padding: '7px 6px', textAlign: 'right', verticalAlign: 'top', fontWeight: 600 }}>{fmt(c)}</td>
                                    <td style={{ padding: '7px 6px', textAlign: 'right', verticalAlign: 'top', color: pct >= 0 ? '#065f46' : '#991b1b', fontWeight: 700 }}>{pct}%</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 12 }}>
                            {[
                              ['Transfer (cost)', `₹ ${fmt(cost)}`, '#0f172a'],
                              ['Customer sell', `₹ ${fmt(sell)}`, '#1d4ed8'],
                              ['Gross margin ₹', `₹ ${fmt(mgn)}`, mgn >= 0 ? '#065f46' : '#991b1b'],
                              ['Gross margin', `${mgnPct}%`, mgnPct >= 0 ? '#065f46' : '#991b1b'],
                            ].map(([label, val, col]) => (
                              <div key={label} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
                                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#92400e' }}>{label}</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: col, marginTop: 2 }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          {stdExtra > 0 && (
                            <div style={{ padding: '8px 14px', fontSize: 11, color: '#78716c', borderTop: '1px solid #fde68a', background: '#fffbeb', marginTop: 10 }}>
                              Upgrade Std markup reserve (in package): <strong>₹ {fmt(stdExtra)}</strong> — buffer for negotiation / cost movement.
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {(q.special_terms || q.notes || q.revision_reason) && (
                    <div style={{ padding: '0 18px 16px', fontSize: 12, color: '#334155', lineHeight: 1.55 }}>
                      {q.special_terms && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', marginBottom: 2 }}>Special terms</div>
                          <div>{q.special_terms}</div>
                        </div>
                      )}
                      {q.notes && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', marginBottom: 2 }}>Notes</div>
                          <div>{q.notes}</div>
                        </div>
                      )}
                      {q.revision_reason && (
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', marginBottom: 2 }}>Revision</div>
                          <div>{q.revision_reason}</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{
                    borderTop: '1px solid #e2e8f0',
                    padding: '10px 18px',
                    fontSize: 11,
                    color: '#94a3b8',
                    background: '#f8fafc',
                  }}>
                    This preview is for internal review and client discussion. Prices are in INR. Tax as applicable will be charged extra unless stated otherwise.
                  </div>
                </div>
              )}
            </div>
            )
          })}
          {!quotes.length && !mode && (
            <div className="empty" style={{ padding: 20 }}>No quotations yet. Create the first quote for this deal.</div>
          )}
        </div>
      )}

      {showCopy && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setShowCopy(false)}>
          <div className="card" style={{ width: 'min(720px, 100%)', padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Copy for Excel</div>
            <textarea ref={copyRef} className="input" rows={14} readOnly value={copyText} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => setShowCopy(false)}>Close</button>
              <button type="button" className="btn primary" onClick={() => { try { copyRef.current?.select(); document.execCommand('copy') } catch (_) {} }}>Select + Copy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
