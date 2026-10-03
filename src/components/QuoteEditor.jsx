import { Badge, Field } from '../ui'
import {
  emptyItem, emptyUpgrade, emptyCharge,
  lineTransferTotal, groupRollup,
  quoteCustomerTotal, quoteTransferTotal, quoteMargin,
  QUOTE_STATUS,
} from '../lib/quotations'

export function QuoteEditor({ form, setForm, mode, baseQuote, saving, onSave, onCancel, setItem, applyGroupMargin, setGroupCustomer, addProduct, addUpgrade, addCharge, removeItem }) {
  const mainProducts = form.items.filter(it => (it.line_type || 'product') === 'product')
  const charges = form.items.filter(it => it.line_type === 'charge')
  const custTot = quoteCustomerTotal(form.items)
  const xferTot = quoteTransferTotal(form.items)
  const mgn = quoteMargin(form.items)

  function renderUpgrade(u) {
    return (
      <div key={u.id} style={{ marginLeft: 16, marginBottom: 6, padding: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <Badge tone="blue">Upgrade</Badge>
          <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(u.id)}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 0.45fr 0.7fr 0.55fr', gap: 6 }}>
          <input className="input" placeholder="Component" value={u.product_name} onChange={e => setItem(u.id, 'product_name', e.target.value)} />
          <input className="input" placeholder="Brand" value={u.brand || ''} onChange={e => setItem(u.id, 'brand', e.target.value)} />
          <input className="input" type="number" placeholder="Qty" value={u.quantity} onChange={e => setItem(u.id, 'quantity', e.target.value)} />
          <input className="input" type="number" placeholder="Transfer ₹" value={u.transfer_price ?? ''} onChange={e => setItem(u.id, 'transfer_price', e.target.value)} />
          <input className="input" type="number" placeholder="Min mgn %" value={u.min_margin_pct ?? u.margin_pct ?? ''}
            onChange={e => { setItem(u.id, 'min_margin_pct', e.target.value); setItem(u.id, 'margin_pct', e.target.value) }} />
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Xfer ₹{lineTransferTotal(u).toLocaleString()} · min margin · rolls into parent</div>
      </div>
    )
  }

  function renderProduct(prod) {
    const g = groupRollup(prod, form.items)
    return (
      <div key={prod.id} style={{ marginBottom: 12 }}>
        <div style={{ padding: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <Badge tone="gray">Base product</Badge>
            {g.upgrades.length > 0 && <Badge tone="blue">{g.upgrades.length} upgrade(s)</Badge>}
            {g.belowMin && <Badge tone="red">Below min {g.minMarginPct}%</Badge>}
            <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(prod.id)}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 0.45fr 0.7fr', gap: 6 }}>
            <input className="input" placeholder="Product" value={prod.product_name} onChange={e => setItem(prod.id, 'product_name', e.target.value)} />
            <input className="input" placeholder="Brand" value={prod.brand || ''} onChange={e => setItem(prod.id, 'brand', e.target.value)} />
            <input className="input" type="number" placeholder="Qty" value={prod.quantity} onChange={e => setItem(prod.id, 'quantity', e.target.value)} />
            <input className="input" type="number" placeholder="Transfer ₹" value={prod.transfer_price ?? ''} onChange={e => setItem(prod.id, 'transfer_price', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: 6, marginTop: 6 }}>
            <input className="input" placeholder="Vendor" value={prod.vendor || ''} onChange={e => setItem(prod.id, 'vendor', e.target.value)} />
            <input className="input" type="number" placeholder="Group mgn %" value={prod.margin_pct ?? ''} onChange={e => applyGroupMargin(prod.id, e.target.value)} />
            <input className="input" type="number" placeholder="Customer ₹ (group)" value={g.customerTotal || prod.customer_price || ''} onChange={e => setGroupCustomer(prod.id, e.target.value)} />
          </div>
          <div style={{ marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
            <div style={{ fontWeight: 600 }}>Commercial line (rolled)</div>
            <div>{g.mergedDescription}</div>
            <div style={{ color: '#475569' }}>TP ₹{g.transferTotal.toLocaleString()} → Cust ₹{g.customerTotal.toLocaleString()} · Mgn {g.marginPct}%</div>
          </div>
          <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 8px', marginTop: 6 }} onClick={() => addUpgrade(prod.id)}>+ Upgrade</button>
        </div>
        {g.upgrades.map(renderUpgrade)}
      </div>
    )
  }

  return (
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
            placeholder="Required — e.g. Added base product · RAM upgrade" />
        </Field>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        <Field label="Validity"><input className="input" type="date" value={form.validity_date} onChange={e => setForm({ ...form, validity_date: e.target.value })} /></Field>
        <Field label="Delivery TAT"><input className="input" value={form.delivery_tat} onChange={e => setForm({ ...form, delivery_tat: e.target.value })} /></Field>
        <Field label="Payment"><input className="input" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} /></Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {QUOTE_STATUS.filter(s => s !== 'superseded').map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', margin: '10px 0 6px' }}>Products & upgrades</div>
      {mainProducts.map(renderProduct)}
      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={addProduct}>+ Base product</button>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Additional costs</div>
      {charges.map(c => (
        <div key={c.id} style={{ marginBottom: 8, padding: 8, background: '#fefce8', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <Badge tone="yellow">{c.charge_kind || 'Charge'}</Badge>
            <select className="input" style={{ width: 130, fontSize: 12 }} value={c.billing || 'on_bill'} onChange={e => setItem(c.id, 'billing', e.target.value)}>
              <option value="on_bill">On bill</option>
              <option value="off_invoice">Off invoice</option>
            </select>
            <button type="button" className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={() => removeItem(c.id)}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.5fr 0.7fr 0.55fr 0.7fr', gap: 6 }}>
            <input className="input" value={c.product_name} onChange={e => setItem(c.id, 'product_name', e.target.value)} placeholder="Name" />
            <input className="input" type="number" value={c.quantity} onChange={e => setItem(c.id, 'quantity', e.target.value)} />
            <input className="input" type="number" placeholder="Transfer" value={c.transfer_price ?? ''} onChange={e => setItem(c.id, 'transfer_price', e.target.value)} />
            <input className="input" type="number" placeholder="Mgn %" value={c.margin_pct ?? ''} onChange={e => setItem(c.id, 'margin_pct', e.target.value)} disabled={c.billing === 'off_invoice'} />
            <input className="input" type="number" placeholder="Customer" value={c.customer_price ?? ''} onChange={e => setItem(c.id, 'customer_price', e.target.value)} disabled={c.billing === 'off_invoice'} />
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => addCharge('installation')}>+ Installation</button>
        <button type="button" className="btn" onClick={() => addCharge('warranty')}>+ Warranty</button>
        <button type="button" className="btn" onClick={() => addCharge('transport')}>+ Transport</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
        <div><div style={{ color: '#64748b', fontSize: 11 }}>Customer total</div><strong>₹{custTot.toLocaleString()}</strong></div>
        <div><div style={{ color: '#64748b', fontSize: 11 }}>Transfer total</div><strong>₹{xferTot.toLocaleString()}</strong></div>
        <div><div style={{ color: '#64748b', fontSize: 11 }}>Margin</div><strong>₹{mgn.amount.toLocaleString()} ({mgn.pct}%)</strong></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={form.no_regret_price} onChange={e => setForm({ ...form, no_regret_price: e.target.checked })} />
          No-regret
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="button" className="btn primary" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save quotation'}</button>
      </div>
    </div>
  )
}
