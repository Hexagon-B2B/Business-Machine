import { quoteGroups, customerQuoteNo } from '../lib/quotations'

/** Expanded commercial preview + internal P&L for a saved quote */
export default function QuotationExpandedPreview({ q }) {
  const items = q.quotation_items || []
  const groups = quoteGroups(items)
  return (
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
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
              <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #cbd5e1' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #cbd5e1' }}>Unit ₹</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #cbd5e1' }}>Amount ₹</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={g.base?.id || i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>{i + 1}</td>
                <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 600 }}>{g.mergedDescription || g.base?.product_name || '—'}</div>
                  {g.base?.brand ? <div style={{ fontSize: 12, color: '#64748b' }}>{g.base.brand}</div> : null}
                </td>
                <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{g.qty}</td>
                <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{Number(g.unitCustomer || 0).toLocaleString('en-IN')}</td>
                <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 700 }}>{Number(g.customerTotal || 0).toLocaleString('en-IN')}</td>
              </tr>
            ))}
            {(items || []).filter(it => it.line_type === 'charge').map((c, i) => {
              const amt = (Number(c.quantity) || 1) * (Number(c.customer_price) || 0)
              return (
                <tr key={c.id || 'ch' + i} style={{ background: '#fffbeb' }}>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>—</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>{c.product_name || c.charge_kind || 'Charge'}</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{c.quantity || 1}</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{Number(c.customer_price || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 700 }}>{amt.toLocaleString('en-IN')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0 8px' }}>
          <div style={{ minWidth: 280, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
              <span style={{ color: '#64748b', fontWeight: 600 }}>Subtotal (ex-tax)</span>
              <span style={{ fontWeight: 700 }}>₹ {Number(q.total_value || 0).toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#0f172a', color: '#f8fafc', fontSize: 14 }}>
              <span style={{ fontWeight: 700 }}>Quoted value</span>
              <span style={{ fontWeight: 800 }}>₹ {Number(q.total_value || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* INTERNAL P&L — not for customer */}
      {(() => {
        const transferSum = groups.reduce((s, g) => s + (Number(g.transferTotal) || 0), 0)
        const customerSum = groups.reduce((s, g) => s + (Number(g.customerTotal) || 0), 0)
        const chargeItems = items.filter(it => it.line_type === 'charge')
        const chargeCust = chargeItems.reduce((s, c) => s + (Number(c.quantity) || 1) * (Number(c.customer_price) || 0), 0)
        const chargeXfer = chargeItems.reduce((s, c) => s + (Number(c.quantity) || 1) * (Number(c.transfer_price) || 0), 0)
        const revenue = customerSum + chargeCust
        const cost = transferSum + chargeXfer
        const profit = Math.round((revenue - cost) * 100) / 100
        const mgnPct = cost > 0 ? Math.round((profit / cost) * 1000) / 10 : 0
        const stdExtra = groups.reduce((s, g) => s + (Number(g.upgradeStdExtra) || 0), 0)
        const fmt = (n) => Number(n || 0).toLocaleString('en-IN')
        return (
          <div style={{
            margin: '0 18px 16px',
            border: '1px solid #fcd34d',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fffbeb',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: 'linear-gradient(90deg, #78350f 0%, #92400e 100%)',
              color: '#fffbeb',
            }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', fontWeight: 800, opacity: 0.85 }}>INTERNAL ONLY · NOT FOR CUSTOMER</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>Quotation P&L</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.9 }}>
                {customerQuoteNo(q)} · v{q.version || 1}
              </div>
            </div>

            <div style={{ padding: '12px 14px 4px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#92400e', marginBottom: 8 }}>
                Line economics
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#fef3c7' }}>
                    <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #fcd34d' }}>Product / package</th>
                    <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 72 }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 100 }}>Transfer ₹</th>
                    <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 100 }}>Customer ₹</th>
                    <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 90 }}>Profit ₹</th>
                    <th style={{ textAlign: 'right', padding: '7px 6px', borderBottom: '1px solid #fcd34d', width: 64 }}>Mgn %</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => {
                    const xfer = Number(g.transferTotal) || 0
                    const cust = Number(g.customerTotal) || 0
                    const gp = Math.round((cust - xfer) * 100) / 100
                    const gpct = xfer > 0 ? Math.round((gp / xfer) * 1000) / 10 : 0
                    const path = [
                      g.baseUnitTP != null ? `Base TP ${fmt(g.baseUnitTP)}` : null,
                      g.unitUpSell ? `+ Up sell ${fmt(g.unitUpSell)}` : null,
                      g.minMarginPct != null ? `→ Min ${g.minMarginPct}%` : null,
                      g.markupPct != null ? `→ Mk ${g.markupPct}%` : null,
                    ].filter(Boolean).join(' ')
                    return (
                      <tr key={g.base?.id || i}>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{(g.base?.product_name || 'Product').trim()}</div>
                          {path && <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>{path}</div>}
                          {g.upgrades?.length > 0 && (
                            <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>
                              Upgrades: {g.upgrades.map(u => u.product_name).filter(Boolean).join('; ')}
                              {g.upgradeStdExtra ? ` · Std extra ₹${fmt(g.upgradeStdExtra)}` : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right' }}>{g.qty}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right' }}>{fmt(xfer)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right', fontWeight: 600 }}>{fmt(cust)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right', fontWeight: 700, color: gp >= 0 ? '#065f46' : '#991b1b' }}>{fmt(gp)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right' }}>{gpct}%</td>
                      </tr>
                    )
                  })}
                  {chargeItems.map(c => {
                    const xfer = (Number(c.quantity) || 1) * (Number(c.transfer_price) || 0)
                    const cust = (Number(c.quantity) || 1) * (Number(c.customer_price) || 0)
                    const gp = Math.round((cust - xfer) * 100) / 100
                    const gpct = xfer > 0 ? Math.round((gp / xfer) * 1000) / 10 : 0
                    return (
                      <tr key={c.id}>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a' }}>{c.product_name || c.charge_kind || 'Charge'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right' }}>{c.quantity || 1}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right' }}>{fmt(xfer)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right', fontWeight: 600 }}>{fmt(cust)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right', fontWeight: 700 }}>{fmt(gp)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #fde68a', textAlign: 'right' }}>{gpct}%</td>
                      </tr>
                    )
                  })}
                  {!groups.length && !chargeItems.length && (
                    <tr><td colSpan={6} style={{ padding: 12, color: '#a8a29e', textAlign: 'center' }}>No lines to analyse</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 0,
              borderTop: '1px solid #fcd34d',
              background: '#fff',
            }}>
              {[
                ['Transfer (cost)', `₹ ${fmt(cost)}`, '#0f172a'],
                ['Customer (revenue)', `₹ ${fmt(revenue)}`, '#0f172a'],
                ['Gross profit', `₹ ${fmt(profit)}`, profit >= 0 ? '#065f46' : '#991b1b'],
                ['Gross margin', `${mgnPct}%`, mgnPct >= 0 ? '#065f46' : '#991b1b'],
              ].map(([lab, val, col]) => (
                <div key={lab} style={{ padding: '12px 14px', borderRight: '1px solid #fde68a' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a16207' }}>{lab}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: col, marginTop: 2 }}>{val}</div>
                </div>
              ))}
            </div>
            {stdExtra > 0 && (
              <div style={{ padding: '8px 14px', fontSize: 11, color: '#78716c', borderTop: '1px solid #fde68a', background: '#fffbeb' }}>
                Upgrade Std markup reserve (in package): <strong>₹ {fmt(stdExtra)}</strong> — buffer for negotiation / cost movement.
              </div>
            )}
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
  )
}
