import { groupRollup, quoteGroups, quoteCustomerTotal, quoteTransferTotal, quoteMargin, lineTransferTotal } from '../lib/quotations'

function MiniLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{children}</div>
}

export function QuoteEditor({
  form, setForm, mode, baseQuote, saving,
  onSave, onCancel, setItem, applyGroupMargin, setGroupCustomer,
  addProduct, addUpgrade, addCharge, removeItem,
}) {
  const items = form.items || []
  const products = items.filter(it => (it.line_type || 'product') === 'product')
  const charges = items.filter(it => it.line_type === 'charge')
  const groups = quoteGroups(items)
  const custTot = quoteCustomerTotal(items)
  const xferTot = quoteTransferTotal(items)
  const mgn = quoteMargin(items)

  function upgradesOf(parentId) {
    return items.filter(it => it.line_type === 'upgrade' && it.parent_id === parentId)
  }

  function upgradeRow(u) {
    const xfer = lineTransferTotal(u)
    const pct = Number(u.margin_pct || u.min_margin_pct) || 0
    const extra = Math.round(xfer * pct / 100 * 100) / 100
    return (
      <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, padding: 8, background: '#f8fafc', borderRadius: 8 }}>
        <div>
          <MiniLabel>Sub-item / upgrade</MiniLabel>
          <input className="input" value={u.product_name || ''} onChange={e => setItem(u.id, 'product_name', e.target.value)} placeholder="e.g. 16GB → 32GB RAM" />
        </div>
        <div>
          <MiniLabel>Qty (per base)</MiniLabel>
          <input className="input" type="number" value={u.quantity ?? 1} onChange={e => setItem(u.id, 'quantity', e.target.value)} />
        </div>
        <div>
          <MiniLabel>Transfer ₹</MiniLabel>
          <input className="input" type="number" value={u.transfer_price ?? ''} onChange={e => setItem(u.id, 'transfer_price', e.target.value)} />
        </div>
        <div>
          <MiniLabel>Std markup % (on TP)</MiniLabel>
          <input className="input" type="number" value={u.margin_pct ?? ''}
            onChange={e => setItem(u.id, 'margin_pct', e.target.value)} placeholder="10" />
        </div>
        <div>
          <MiniLabel>Extra ₹</MiniLabel>
          <div style={{ fontSize: 13, paddingTop: 8 }}>{extra ? extra.toLocaleString('en-IN') : '—'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => removeItem(u.id)}>×</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>
        {mode === 'revise' ? `Revise ${baseQuote?.quotation_no || ''} → next version` : 'New quotation'}
      </div>

      {mode === 'revise' && (
        <div style={{ marginBottom: 12 }}>
          <MiniLabel>Revision reason * (required to save)</MiniLabel>
          <input className="input" value={form.revision_reason || ''} onChange={e => setForm(f => ({ ...f, revision_reason: e.target.value }))} placeholder="What changed?" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
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
      </div>

      {products.map(prod => {
        const g = groups.find(x => x.base.id === prod.id) || groupRollup(prod, items)
        const ups = upgradesOf(prod.id)
        return (
          <div key={prod.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <MiniLabel>Product name *</MiniLabel>
                <input className="input" value={prod.product_name || ''} onChange={e => setItem(prod.id, 'product_name', e.target.value)} />
              </div>
              <div>
                <MiniLabel>Brand</MiniLabel>
                <input className="input" value={prod.brand || ''} onChange={e => setItem(prod.id, 'brand', e.target.value)} />
              </div>
              <div>
                <MiniLabel>Qty (base units)</MiniLabel>
                <input className="input" type="number" value={prod.quantity ?? 1} onChange={e => setItem(prod.id, 'quantity', e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <MiniLabel>Specification / description</MiniLabel>
              <textarea className="input" rows={2} value={prod.specification || ''} onChange={e => setItem(prod.id, 'specification', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <MiniLabel>Transfer price ₹ (unit)</MiniLabel>
                <input className="input" type="number" value={prod.transfer_price ?? ''} onChange={e => setItem(prod.id, 'transfer_price', e.target.value)} />
              </div>
              <div>
                <MiniLabel>Min mgn % (on base+upgrades)</MiniLabel>
                <input className="input" type="number" value={prod.min_margin_pct ?? ''} onChange={e => setItem(prod.id, 'min_margin_pct', e.target.value)} placeholder="2" />
              </div>
              <div>
                <MiniLabel>% Markup (after min, on package)</MiniLabel>
                <input className="input" type="number" value={prod.margin_pct ?? ''} onChange={e => setItem(prod.id, 'margin_pct', e.target.value)} placeholder="10" />
              </div>
              <div>
                <MiniLabel>Customer rate ₹ / unit</MiniLabel>
                <input className="input" type="number" value={prod.customer_price ?? ''} onChange={e => setGroupCustomer(prod.id, e.target.value)} />
              </div>
              <div>
                <MiniLabel>Line total ₹</MiniLabel>
                <div style={{ fontSize: 14, fontWeight: 700, paddingTop: 8 }}>{(g.customerTotal || 0).toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              Package math: (base TP + upgrade sells) → Min mgn % → % Markup = customer unit. Upgrade is per 1 base unit — qty follows base.
            </div>
            {ups.map(upgradeRow)}
            <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => addUpgrade(prod.id)}>+ Sub-item / upgrade</button>
            <button type="button" className="btn" style={{ fontSize: 12, marginLeft: 6 }} onClick={() => removeItem(prod.id)}>Remove product</button>
          </div>
        )
      })}

      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={addProduct}>+ Product</button>

      {charges.map(c => (
        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
          <div>
            <MiniLabel>Charge</MiniLabel>
            <input className="input" value={c.product_name || ''} onChange={e => setItem(c.id, 'product_name', e.target.value)} placeholder="Installation / transport" />
          </div>
          <div>
            <MiniLabel>Qty</MiniLabel>
            <input className="input" type="number" value={c.quantity ?? 1} onChange={e => setItem(c.id, 'quantity', e.target.value)} />
          </div>
          <div>
            <MiniLabel>Customer rate ₹</MiniLabel>
            <input className="input" type="number" value={c.customer_price ?? ''} onChange={e => setItem(c.id, 'customer_price', e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => removeItem(c.id)}>×</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={() => addCharge('other')}>+ Charge</button>

      <div style={{ fontSize: 13, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
        <strong>Quote totals</strong> · Transfer ₹{xferTot.toLocaleString('en-IN')} · Customer ₹{custTot.toLocaleString('en-IN')} · Margin {mgn.pct}% (₹{Math.round(mgn.amount || 0).toLocaleString('en-IN')})
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
