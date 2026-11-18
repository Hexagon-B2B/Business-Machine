import { useState, useEffect } from 'react'
import { loadCompanyQuotedItems, customerQuoteNo } from '../lib/quotations'
import { oppStageLabel, oppStageTone } from '../constants'
import { Badge } from '../ui'

/**
 * Company-level history of product lines quoted (non-superseded), with TP / rate for analysis.
 */
export default function CompanyQuotedItems({ companyId, opportunities = [], onOpenOpportunity }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!companyId) return
    setLoading(true)
    setError('')
    const { rows: r, error: err } = await loadCompanyQuotedItems(companyId)
    setLoading(false)
    if (err) setError(err.message || 'Could not load quoted items')
    setRows(r || [])
  }

  useEffect(() => { load() }, [companyId])

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Quoted items history</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Products quoted across all deals for this company (excludes superseded quotes). Transfer price and customer rate for analysis.
          </div>
        </div>
        <button type="button" className="btn" style={{ fontSize: 12 }} disabled={loading} onClick={load}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <div className="notice" style={{ margin: 12, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
      {loading && !rows.length ? (
        <div className="loading" style={{ padding: 24 }}>Loading quoted items…</div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 'min(70vh, 560px)', margin: 0 }}>
          <table className="table quoted-items-table" style={{ minWidth: 720, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '28%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '5%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Product / description</th>
                <th>Brand</th>
                <th style={{ textAlign: 'right' }}>TP ₹</th>
                <th style={{ textAlign: 'right' }}>Rate ₹</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Mgn %</th>
                <th>Quote</th>
                <th>Deal / stage</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const qLabel = customerQuoteNo({ quotation_no: r.quotation_no, version: r.version }) || '—'
                const d = r.quote_date ? String(r.quote_date).slice(0, 10) : '—'
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', verticalAlign: 'top', lineHeight: 1.35 }}>
                      <div style={{ fontWeight: 600 }}>{r.product_name || '—'}</div>
                      {r.specification ? (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, whiteSpace: 'normal' }}>{r.specification}</div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', verticalAlign: 'top', fontSize: 12 }}>
                      {r.brand || '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                      {r.transfer_price != null ? Number(r.transfer_price).toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                      {r.customer_price != null ? Number(r.customer_price).toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{r.quantity ?? '—'}</td>
                    <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{r.margin_pct != null ? Number(r.margin_pct).toFixed(1) : '—'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'normal', wordBreak: 'break-word', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600 }}>{qLabel}</div>
                      {r.quote_status ? <span style={{ color: '#64748b' }}>{r.quote_status}</span> : null}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'normal', wordBreak: 'break-word', verticalAlign: 'top' }}>
                      <div
                        style={{ color: '#2563eb', cursor: onOpenOpportunity ? 'pointer' : 'default', fontWeight: 600 }}
                        onClick={() => {
                          if (!onOpenOpportunity) return
                          const opp = opportunities.find(o => o.id === r.opportunity_id)
                          if (opp) onOpenOpportunity(opp)
                        }}
                      >
                        {r.opportunity_name || '—'}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <Badge tone={oppStageTone(r.opportunity_stage)}>{oppStageLabel(r.opportunity_stage)}</Badge>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, verticalAlign: 'top' }}>{d}</td>
                  </tr>
                )
              })}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={9} style={{ padding: 20, color: '#64748b', whiteSpace: 'normal' }}>
                    No quoted product lines yet for this company.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
