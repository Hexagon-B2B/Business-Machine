import { Badge } from '../ui'
import { quoteGroups, customerQuoteNo } from '../lib/quotations'

/** Expanded commercial preview for a saved quote — presentational only */
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

        <div style={{
          marginTop: 16,
          padding: 14,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Transfer total</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>₹ {Number(q.transfer_total || q.cost_total || 0).toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Customer total</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>₹ {Number(q.total_value || 0).toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Gross margin</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>
              {(() => {
                const cust = Number(q.total_value || 0)
                const xfer = Number(q.transfer_total || q.cost_total || 0)
                const amt = cust - xfer
                const pct = xfer > 0 ? Math.round((amt / xfer) * 1000) / 10 : 0
                return `${pct}% (₹ ${Math.round(amt).toLocaleString('en-IN')})`
              })()}
            </div>
          </div>
        </div>

        {q.notes ? (
          <div style={{ marginTop: 12, fontSize: 13, color: '#475569' }}>
            <strong>Notes:</strong> {q.notes}
          </div>
        ) : null}
      </div>
    </div>
  )
}
