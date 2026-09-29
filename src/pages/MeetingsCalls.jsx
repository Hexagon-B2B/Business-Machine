import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function MeetingsCalls({ go }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('meetings_calls')
      .select('id, type, subject, outcome, next_action, next_action_due_at, scheduled_at, company_id, companies(name)')
      .order('scheduled_at', { ascending: false }).limit(60)
    setItems(data || [])
    setLoading(false)
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Meetings & Calls</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Purpose → Outcome → Next Action — log from a Company</p>
        </div>
        <button className="btn primary" onClick={() => go('companies')}>Go to Companies →</button>
      </div>

      {loading ? <div className="loading">Loading...</div> : items.length === 0 ? (
        <div className="empty">No meetings or calls yet. Open a Company and log from there.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Type</th><th>Subject</th><th>Company</th><th>Outcome</th><th>Next Action</th><th>When</th></tr></thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td><span className="badge blue">{i.type}</span></td>
                  <td style={{ fontWeight: 600 }}>{i.subject}</td>
                  <td>{i.companies?.name ? (
                    <button style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
                      onClick={() => go('company', i.company_id)}>{i.companies.name}</button>
                  ) : '—'}</td>
                  <td>{i.outcome || '—'}</td>
                  <td style={{ color: i.next_action ? '#1e40af' : undefined }}>{i.next_action || '—'}</td>
                  <td>{i.scheduled_at ? new Date(i.scheduled_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
