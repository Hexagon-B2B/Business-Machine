import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SIGNAL_REVIEW } from '../constants'
import { Badge } from '../ui'

export default function Research({ go }) {
  const [queue, setQueue] = useState([])
  const [signals, setSignals] = useState([])
  const [tab, setTab] = useState('queue')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [q, s] = await Promise.all([
      supabase.from('research_queue')
        .select('id, company_id, research_tier, status, next_research_at, last_researched_at, approval_status, companies(name)')
        .order('next_research_at').limit(80),
      supabase.from('signals')
        .select('id, company_id, contact_id, signal_type, observation, source, review_status, relevance, observed_at, companies(name)')
        .order('created_at', { ascending: false }).limit(80),
    ])
    setQueue(q.data || [])
    setSignals(s.data || [])
    setLoading(false)
  }

  async function setSignalReview(id, review_status) {
    const { error } = await supabase.from('signals').update({ review_status }).eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  async function completeQueueItem(id) {
    const { error } = await supabase.from('research_queue').update({
      status: 'completed', last_researched_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (loading) return <div className="loading">Loading research...</div>

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Research & Signals</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>Target → Evidence → Signal → Action. Signal without Contact is valid.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={() => setTab('queue')}
          style={{ background: tab === 'queue' ? '#2563eb' : '#fff', color: tab === 'queue' ? '#fff' : '#0f172a' }}>
          Research Queue ({queue.filter(r => r.status !== 'completed').length})
        </button>
        <button className="btn" onClick={() => setTab('signals')}
          style={{ background: tab === 'signals' ? '#2563eb' : '#fff', color: tab === 'signals' ? '#fff' : '#0f172a' }}>
          Buying Signals ({signals.length})
        </button>
      </div>

      {tab === 'queue' && (
        <div className="card" style={{ padding: 0 }}>
          {queue.length === 0 ? (
            <div className="empty">No items in research queue. Use Initiate Research on a Company.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Company</th><th>Tier</th><th>Status</th><th>Next Research</th><th>Approval</th><th></th></tr></thead>
              <tbody>
                {queue.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      <button style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                        onClick={() => go('company', r.company_id)}>{r.companies?.name || 'Unknown'}</button>
                    </td>
                    <td>{r.research_tier}</td>
                    <td><Badge tone={r.status === 'completed' ? 'green' : 'blue'}>{r.status}</Badge></td>
                    <td>{r.next_research_at ? new Date(r.next_research_at).toLocaleDateString() : '—'}</td>
                    <td><Badge>{r.approval_status}</Badge></td>
                    <td>
                      <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => go('company', r.company_id)}>Open</button>
                      {r.status !== 'completed' && (
                        <button className="btn" style={{ fontSize: 11, padding: '3px 8px', marginLeft: 4 }} onClick={() => completeQueueItem(r.id)}>Complete</button>
                      )}
                    </td>
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
            <div className="empty">No signals yet. Log them from a Company after checking news / hiring / funding.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Company</th><th>Type</th><th>Observation</th><th>Status</th><th>Contact</th><th></th></tr></thead>
              <tbody>
                {signals.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>
                      <button style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                        onClick={() => go('company', s.company_id)}>{s.companies?.name || '—'}</button>
                    </td>
                    <td><Badge tone="blue">{s.signal_type}</Badge></td>
                    <td style={{ maxWidth: 280 }}>{s.observation}</td>
                    <td>
                      <select className="input" style={{ width: 'auto', fontSize: 12, padding: '2px 6px' }}
                        value={s.review_status || 'pending'} onChange={e => setSignalReview(s.id, e.target.value)}>
                        {SIGNAL_REVIEW.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>{s.contact_id ? 'Linked' : <Badge tone="yellow">No contact</Badge>}</td>
                    <td><button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => go('company', s.company_id)}>Open</button></td>
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
