import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Research({ go }) {
  const [queue, setQueue] = useState([])
  const [signals, setSignals] = useState([])
  const [tab, setTab] = useState('queue')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [q, s] = await Promise.all([
      supabase.from('research_queue').select('id, company_id, research_tier, status, next_research_at, last_researched_at, approval_status, companies(name)').order('next_research_at').limit(50),
      supabase.from('signals').select('id, company_id, contact_id, signal_type, observation, source, review_status, relevance, observed_at, companies(name)').order('created_at', { ascending: false }).limit(50)
    ])
    setQueue(q.data || [])
    setSignals(s.data || [])
    setLoading(false)
  }

  if (loading) return <div className="loading">Loading research...</div>

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Research & Signals</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>Target → Evidence → Signal → Action</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={() => setTab('queue')}
          style={{ background: tab === 'queue' ? '#2563eb' : '#fff', color: tab === 'queue' ? '#fff' : '#0f172a' }}>
          Research Queue ({queue.length})
        </button>
        <button className="btn" onClick={() => setTab('signals')}
          style={{ background: tab === 'signals' ? '#2563eb' : '#fff', color: tab === 'signals' ? '#fff' : '#0f172a' }}>
          Buying Signals ({signals.length})
        </button>
      </div>

      {tab === 'queue' && (
        <div className="card" style={{ padding: 0 }}>
          {queue.length === 0 ? (
            <div className="empty">No items in research queue. Companies marked for research will appear here.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Next Research</th>
                  <th>Approval</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queue.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      <button style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                        onClick={() => go('company', r.company_id)}>
                        {r.companies?.name || 'Unknown'}
                      </button>
                    </td>
                    <td>{r.research_tier}</td>
                    <td><span className="badge blue">{r.status}</span></td>
                    <td>{r.next_research_at ? new Date(r.next_research_at).toLocaleDateString() : '—'}</td>
                    <td><span className="badge gray">{r.approval_status}</span></td>
                    <td><button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => go('company', r.company_id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'signals' && (
        <div className="card" style={{ padding: 0 }}>
          {signals.length === 0 ? (
            <div className="empty">
              No signals yet.<br />
              <span style={{ fontSize: 12 }}>Signal without Contact is a valid state. Research findings will appear here.</span>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Observation</th>
                  <th>Relevance</th>
                  <th>Contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(s => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => go('company', s.company_id)}>
                    <td style={{ fontWeight: 600 }}>{s.companies?.name || '—'}</td>
                    <td><span className="badge blue">{s.signal_type}</span></td>
                    <td>{s.observation}</td>
                    <td>{s.relevance || '—'}</td>
                    <td>{s.contact_id ? 'Linked' : <span className="badge yellow">No contact</span>}</td>
                    <td><span className="badge gray">{s.review_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
