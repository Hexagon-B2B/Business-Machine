import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Opportunities({ go }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('opportunities')
      .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, company_id, companies(name)')
      .order('created_at', { ascending: false }).limit(80)
    setItems(data || [])
    setLoading(false)
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Opportunities</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Commercial requirements — create from a Company</p>
        </div>
        <button className="btn primary" onClick={() => go('companies')}>Go to Companies →</button>
      </div>

      {loading ? <div className="loading">Loading...</div> : items.length === 0 ? (
        <div className="empty">No opportunities yet. Open a Company and create one there.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Name</th><th>Company</th><th>Stage</th><th>Value</th><th>Code</th><th>Close</th></tr></thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td>{i.companies?.name ? (
                    <button style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
                      onClick={() => go('company', i.company_id)}>{i.companies.name}</button>
                  ) : '—'}</td>
                  <td><span className="badge blue">{i.stage}</span></td>
                  <td>{i.deal_size ? `${i.currency || 'INR'} ${Number(i.deal_size).toLocaleString()}` : '—'}</td>
                  <td>{i.opportunity_code}</td>
                  <td>{i.expected_close_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
