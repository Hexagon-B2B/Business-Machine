import { useState, useEffect } from 'react'
import { Badge } from '../ui'
import {
  emptyItem, emptyUpgrade, emptyCharge, groupRollup, quoteGroups,
  loadQuotesForOpp, saveQuotation, updateQuoteStatus,
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

  function blankForm() {
    return {
      validity_date: '', delivery_tat: '', payment_terms: '', transport_terms: '',
      special_terms: '', revision_reason: '', no_regret_price: false, notes: '', status: 'draft',
      items: [emptyItem({ line_type: 'product' })],
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
      validity_date: q.validity_date || '', delivery_tat: q.delivery_tat || '',
      payment_terms: q.payment_terms || '', transport_terms: q.transport_terms || '',
      special_terms: q.special_terms || '', revision_reason: '', no_regret_price: false,
      notes: q.notes || '', status: 'draft', items,
    })
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
        setError('Enter a revision reason (what changed), then Save again.'); return
      }
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
      const nextVersion = mode === 'revise' && baseQuote
        ? (Number(baseQuote.version) || 1) + 1
        : (quotes.length ? Math.max(...quotes.map(q => q.version || 1)) + 1 : 1)
      const { quote, error: err } = await saveQuotation({
        opportunityId: opportunity.id,
        companyId: opportunity.company_id,
        quotation_no: mode === 'revise' ? (baseQuote?.quotation_no || '') : '',
        version: mode === 'create' && !quotes.length ? 1 : nextVersion,
        status: form.status || 'draft',
        validity_date: form.validity_date,
        delivery_tat: form.delivery_tat,
        payment_terms: form.payment_terms,
        transport_terms: form.transport_terms,
        special_terms: form.special_terms,
        revision_reason: form.revision_reason || null,
        no_regret_price: form.no_regret_price,
        notes: form.notes,
        items,
        supersedePreviousId: mode === 'revise' && baseQuote ? baseQuote.id : null,
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
          <button type="button" className="btn primary" onClick={startCreate}>
            {quotes.length ? '+ New revision' : '+ Create quote'}
          </button>
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
              const items = q.quotation_items || []
              const lines = q.commercial_lines || quoteGroups(items).map(g => ({
                description: g.mergedDescription, transfer_total: g.transferTotal,
                customer_total: g.customerTotal, margin_pct: g.marginPct, upgrade_count: g.upgrades.length,
              }))
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
                      {lines.map((line, i) => (
                        <div key={i} style={{ marginBottom: 8, padding: 8, background: '#f8fafc', borderRadius: 6 }}>
                          <div style={{ fontWeight: 600 }}>{line.description}</div>
                          <div style={{ color: '#64748b' }}>
                            TP ₹{Number(line.transfer_total || 0).toLocaleString()} → Cust ₹{Number(line.customer_total || 0).toLocaleString()}
                            {line.margin_pct != null ? ` · Mgn ${line.margin_pct}%` : ''}
                            {line.upgrade_count ? ` · ${line.upgrade_count} upgrade(s)` : ''}
                          </div>
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
