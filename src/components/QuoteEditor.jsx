import { useMemo, useState } from 'react'
import { groupRollup, quoteGroups, quoteCustomerTotal, quoteTransferTotal, quoteMargin, lineTransferTotal } from '../lib/quotations'

function MiniLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{children}</div>
}

function money(n) {
  return Number(n || 0).toLocaleString('en-IN')
}

export function QuoteEditor({
  form, setForm, mode, baseQuote, saving,
  onSave, onCancel, setItem, applyGroupMargin, setGroupCustomer,
  addProduct, addUpgrade, addCharge, removeItem,
  vendors = [],
}) {
  const items = form.items || []
  const products = items.filter(it => (it.line_type || 'product') === 'product')
  const charges = items.filter(it => it.line_type === 'charge')
  const groups = quoteGroups(items)
  const custTot = quoteCustomerTotal(items)
  const xferTot = quoteTransferTotal(items)
  const mgn = quoteMargin(items)
  const [showRates, setShowRates] = useState(false)
  const pastRates = useMemo(() => {
    try {
      const all = JSON.parse(localStorage.getItem('hexagon_product_rates') || '[]')
      return Array.isArray(all) ? all.slice(0, 80) : []
    } catch { return [] }
  }, [showRates, form.items])

  function upgradesOf(parentId) {
    return items.filter(it => it.line_type === 'upgrade' && String(it.parent_id) === String(parentId))
  }

  function setTransportMode(modeVal) {
    setForm(f => {
      let nextItems = [...(f.items || [])]
      const hasTransport = nextItems.some(it => it.line_type === 'charge' && (it.charge_kind === 'transport' || /transport/i.test(it.product_name || '')))
      if (modeVal === 'chargeable' && !hasTransport) {
        nextItems = [...nextItems, {
          id: 'tmp_' + Math.random().toString(36).slice(2, 9),
          line_type: 'charge', parent_id: null, product_name: 'Transportation', specification: '', brand: '',
          model_part_no: '', vendor: '', quantity: 1, transfer_price: '', customer_price: '',
          margin_pct: '', min_margin_pct: '', billing: 'on_bill', charge_kind: 'transport', notes: '', optionality: 'mandatory',
        }]
      }
      if (modeVal === 'free') {
        nextItems = nextItems.filter(it => !(it.line_type === 'charge' && (it.charge_kind === 'transport' || /transport/i.test(it.product_name || ''))))
      }
      return {
        ...f,
        transport_mode: modeVal,
        transport_terms: modeVal === 'free' ? 'Free delivery' : (modeVal === 'chargeable' ? 'Chargeable' : (f.transport_terms || '')),
        items: nextItems,
      }
    })
  }

  function upgradeRow(u, idx) {
    const unitTP = Number(u.transfer_price) || 0
    const pct = u.margin_pct !== '' && u.margin_pct != null ? Number(u.margin_pct) : 0
    const sell = Math.round(unitTP * (1 + (Number.isNaN(pct) ? 0 : pct) / 100) * 100) / 100
    return (
      <div key={u.id} style={{
        display: 'grid', gridTemplateColumns: '28px 1.4fr 1fr 0.7fr 0.9fr 0.8fr 0.9fr 36px',
        gap: 8, alignItems: 'end', marginBottom: 6, padding: '8px 8px',
        background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8,
      }}>
        <div style={{ fontSize: 11, color: '#94a3b8', paddingBottom: 8 }}>U{idx + 1}</div>
        <div>
          <MiniLabel>Upgrade / sub-item (additional to base)</MiniLabel>
          <input className="input" value={u.product_name || ''} onChange={e => setItem(u.id, 'product_name', e.target.value)} placeholder="e.g. +16GB DDR5 RAM (additional)" />
        </div>
        <div>
          <MiniLabel>Specification</MiniLabel>
          <input className="input" value={u.specification || ''} onChange={e => setItem(u.id, 'specification', e.target.value)} />
        </div>
        <div>
          <MiniLabel>Qty / base</MiniLabel>
          <input className="input" type="number" value={u.quantity ?? 1} onChange={e => setItem(u.id, 'quantity', e.target.value)} />
        </div>
        <div>
          <MiniLabel>Transfer ₹ / unit</MiniLabel>
          <input className="input" type="number" value={u.transfer_price ?? ''} onChange={e => setItem(u.id, 'transfer_price', e.target.value)} />
        </div>
        <div>
          <MiniLabel>Std markup % (on TP)</MiniLabel>
          <input className="input" type="number" value={u.margin_pct ?? ''} onChange={e => setItem(u.id, 'margin_pct', e.target.value)} placeholder="0" />
        </div>
        <div>
          <MiniLabel>Sell / unit ₹</MiniLabel>
          <div style={{ fontSize: 13, fontWeight: 700, padding: '8px 0' }}>{money(sell)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
          <button type="button" className="btn" title="Remove upgrade" onClick={() => removeItem(u.id)}>×</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 16, padding: 14, maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>
          {mode === 'revise' ? `Revise ${baseQuote?.quotation_no || ''} → next version` : 'New quotation'}
        </div>
        <div style={{ fontSize: 13, padding: '8px 14px', background: '#0f172a', color: '#f8fafc', borderRadius: 8, fontWeight: 700 }}>
          Live total · Transfer ₹{money(xferTot)} · Customer ₹{money(custTot)} · Margin {mgn.pct}% (₹{money(Math.round(mgn.amount || 0))})
        </div>
      </div>

      {mode === 'revise' && (
        <div style={{ marginBottom: 12 }}>
          <MiniLabel>Revision reason * (required to save)</MiniLabel>
          <input className="input" value={form.revision_reason || ''} onChange={e => setForm(f => ({ ...f, revision_reason: e.target.value }))} placeholder="What changed?" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div>
          <MiniLabel>Validity date</MiniLabel>
          <input className="input" type="date" value={form.validity_date || ''} onChange={e => setForm(f => ({ ...f, validity_date: e.target.value }))} />
        </div>
        <div>
          <MiniLabel>Delivery TAT</MiniLabel>
          <input className="input" value={form.delivery_tat || ''} onChange={e => setForm(f => ({ ...f, delivery_tat: e.target.value }))} placeholder="e.g. 2–3 weeks" />
        </div>
        <div>
          <MiniLabel>Payment terms</MiniLabel>
          <input className="input" value={form.payment_terms || ''} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} />
        </div>
        <div>
          <MiniLabel>Transportation</MiniLabel>
          <select
            className="input"
            value={form.transport_mode || (form.transport_terms === 'Free delivery' ? 'free' : form.transport_terms ? 'chargeable' : '')}
            onChange={e => setTransportMode(e.target.value)}
          >
            <option value="">— Select —</option>
            <option value="free">Free</option>
            <option value="chargeable">Chargeable</option>
          </select>
        </div>
      </div>

      {products.map((prod, pIdx) => {
        const g = groups.find(x => x.base.id === prod.id) || groupRollup(prod, items)
        const ups = upgradesOf(prod.id)
        const unitRate = g.unitCustomer != null ? g.unitCustomer : 0
        return (
          <div key={prod.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 10, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>Line {pIdx + 1} · Base product</div>
              <button type="button" className="btn" style={{ fontSize: 12, color: '#991b1b', borderColor: '#fecaca' }}
                onClick={() => removeItem(prod.id)} title="Remove this base product and all its upgrades">
                Remove product + upgrades
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1.5fr 1.3fr', gap: 8, marginBottom: 8 }}>
              <div>
                <MiniLabel>SL</MiniLabel>
                <div style={{ fontWeight: 700, paddingTop: 8 }}>{pIdx + 1}</div>
              </div>
              <div>
                <MiniLabel>Brand</MiniLabel>
                <input className="input" value={prod.brand || ''} onChange={e => setItem(prod.id, 'brand', e.target.value)} placeholder="HP / Dell / …" />
              </div>
              <div>
                <MiniLabel>Product name *</MiniLabel>
                <input className="input" value={prod.product_name || ''} onChange={e => setItem(prod.id, 'product_name', e.target.value)} />
              </div>
              <div>
                <MiniLabel>Vendor (procurement)</MiniLabel>
                {vendors.length > 0 ? (
                  <select className="input" value={prod.vendor || ''} onChange={e => setItem(prod.id, 'vendor', e.target.value)}>
                    <option value="">— Select vendor —</option>
                    {vendors.map(v => (
                      <option key={v.id || v.name} value={v.name}>{v.name}{v.location ? ` · ${v.location}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input" value={prod.vendor || ''} onChange={e => setItem(prod.id, 'vendor', e.target.value)} placeholder="Vendor short name" />
                )}
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <MiniLabel>Description / specification</MiniLabel>
              <textarea
                className="input"
                rows={2}
                value={prod.specification || ''}
                onChange={e => setItem(prod.id, 'specification', e.target.value)}
                placeholder="Spec / bullets — expand if needed"
                style={{ lineHeight: 1.35, minHeight: 40, maxHeight: 72, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 8 }}>
              <div>
                <MiniLabel>Qty (base units)</MiniLabel>
                <input className="input" type="number" value={prod.quantity ?? 1} onChange={e => setItem(prod.id, 'quantity', e.target.value)} />
              </div>
              <div>
                <MiniLabel>Transfer price ₹ / unit</MiniLabel>
                <input className="input" type="number" value={prod.transfer_price ?? ''} onChange={e => setItem(prod.id, 'transfer_price', e.target.value)} />
              </div>
              <div>
                <MiniLabel>Min mgn % (base+upgrades)</MiniLabel>
                <input className="input" type="number" value={prod.min_margin_pct ?? ''} onChange={e => setItem(prod.id, 'min_margin_pct', e.target.value)} placeholder="0" />
              </div>
              <div>
                <MiniLabel>% Markup (after min)</MiniLabel>
                <input className="input" type="number" value={prod.margin_pct ?? ''} onChange={e => setItem(prod.id, 'margin_pct', e.target.value)} placeholder="0" />
              </div>
              <div>
                <MiniLabel>Customer rate ₹ / unit</MiniLabel>
                <div style={{ fontSize: 15, fontWeight: 800, paddingTop: 8, color: '#0f172a' }}>{money(unitRate)}</div>
              </div>
              <div>
                <MiniLabel>Line total ₹</MiniLabel>
                <div style={{ fontSize: 15, fontWeight: 800, paddingTop: 8, color: '#0f172a' }}>{money(g.customerTotal)}</div>
              </div>
            </div>

            {ups.length > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                Upgrades are <strong>additional</strong> to the base configuration (e.g. base 16GB + upgrade +16GB → 32GB configured).
              </div>
            )}
            {ups.map((u, i) => upgradeRow(u, i))}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => addUpgrade(prod.id)}>+ Sub-item / upgrade</button>
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" onClick={addProduct}>+ Base product</button>
        <button type="button" className="btn" onClick={() => addCharge('other')}>+ Charge / other</button>
      </div>

      {charges.map(c => (
        <div key={c.id} style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 0.9fr 0.9fr 36px',
          gap: 8, marginBottom: 8, padding: 10, border: '1px solid #e2e8f0', borderRadius: 10, alignItems: 'end',
        }}>
          <div>
            <MiniLabel>{c.charge_kind === 'transport' ? 'Transport detail' : 'Charge name'}</MiniLabel>
            <input className="input" value={c.product_name || ''} onChange={e => setItem(c.id, 'product_name', e.target.value)} placeholder="Installation / transport / …" />
          </div>
          <div>
            <MiniLabel>Vendor</MiniLabel>
            <input className="input" value={c.vendor || ''} onChange={e => setItem(c.id, 'vendor', e.target.value)} />
          </div>
          <div>
            <MiniLabel>Qty</MiniLabel>
            <input className="input" type="number" value={c.quantity ?? 1} onChange={e => setItem(c.id, 'quantity', e.target.value)} />
          </div>
          <div>
            <MiniLabel>Transfer ₹</MiniLabel>
            <input className="input" type="number" value={c.transfer_price ?? ''} onChange={e => setItem(c.id, 'transfer_price', e.target.value)} />
          </div>
          <div>
            <MiniLabel>Customer ₹</MiniLabel>
            <input className="input" type="number" value={c.customer_price ?? ''} onChange={e => setItem(c.id, 'customer_price', e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => removeItem(c.id)}>×</button>
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 12, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <button type="button" className="btn" style={{ width: '100%', textAlign: 'left', borderRadius: 0, border: 0 }}
          onClick={() => setShowRates(s => !s)}>
          {showRates ? '▼' : '▶'} Past unit rates (1 unit · product + upgrades · TP · rate · company)
        </button>
        {showRates && (
          <div style={{ maxHeight: 260, overflow: 'auto', padding: 10, background: '#f8fafc', fontSize: 12 }}>
            {pastRates.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>No history yet. Rates are recorded when you save a quotation.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 4 }}>Product</th>
                    <th style={{ textAlign: 'left', padding: 4 }}>Upgrades</th>
                    <th style={{ textAlign: 'right', padding: 4 }}>Unit TP</th>
                    <th style={{ textAlign: 'right', padding: 4 }}>Unit rate</th>
                    <th style={{ textAlign: 'left', padding: 4 }}>Company</th>
                    <th style={{ textAlign: 'left', padding: 4 }}>Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {pastRates.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: 4 }}>{[r.brand, r.product].filter(Boolean).join(' · ')}</td>
                      <td style={{ padding: 4, color: '#64748b' }}>{(r.upgrades || []).join('; ') || '—'}</td>
                      <td style={{ padding: 4, textAlign: 'right' }}>{Number(r.unit_tp || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: 4, textAlign: 'right', fontWeight: 700 }}>{Number(r.unit_rate || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: 4 }}>{r.company_short || r.company || '—'}</td>
                      <td style={{ padding: 4, color: '#64748b' }}>{r.quote_no || ''} · {(r.at || '').slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div style={{
        position: 'sticky', bottom: 0, fontSize: 13, padding: '10px 12px', background: '#f1f5f9',
        borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 12,
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      }}>
        <div><strong>Quotation summary</strong><span style={{ color: '#64748b' }}> · updates as you type</span></div>
        <div style={{ fontWeight: 700 }}>
          Transfer ₹{money(xferTot)}
          <span style={{ margin: '0 10px', color: '#cbd5e1' }}>|</span>
          Customer ₹{money(custTot)}
          <span style={{ margin: '0 10px', color: '#cbd5e1' }}>|</span>
          Gross margin {mgn.pct}% (₹{money(Math.round(mgn.amount || 0))})
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : (mode === 'revise' ? 'Save as next version' : 'Save quotation')}
        </button>
      </div>
    </div>
  )
}
