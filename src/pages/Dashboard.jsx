import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Dashboard({ go }) {
  const [stats, setStats] = useState({ companies: 0, contacts: 0, openTasks: 0, meetings: 0, openOpps: 0, research: 0 })
  const [overdue, setOverdue] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [recentMeetings, setRecentMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const [c, ct, tOpen, m, o, rq, tasksOver, tasksUp, meets] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
        supabase.from('meetings_calls').select('id', { count: 'exact', head: true }),
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).not('stage', 'in', '(won,lost)'),
        supabase.from('research_queue').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
        supabase.from('tasks').select('id, title, due_at, priority, status, company_id').in('status', ['open', 'in_progress']).lt('due_at', today).order('due_at').limit(8),
        supabase.from('tasks').select('id, title, due_at, priority, status, company_id').in('status', ['open', 'in_progress']).gte('due_at', today).order('due_at').limit(8),
        supabase.from('meetings_calls').select('id, subject, type, outcome, next_action, scheduled_at, company_id').order('scheduled_at', { ascending: false }).limit(6)
      ])
      setStats({
        companies: c.count || 0,
        contacts: ct.count || 0,
        openTasks: tOpen.count || 0,
        meetings: m.count || 0,
        openOpps: o.count || 0,
        research: rq.count || 0
      })
      setOverdue(tasksOver.data || [])
      setUpcoming(tasksUp.data || [])
      setRecentMeetings(meets.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Loading Action Centre...</div>

  const cards = [
    { label: 'Companies', value: stats.companies, page: 'companies' },
    { label: 'Contacts', value: stats.contacts, page: 'companies' },
    { label: 'Open Tasks', value: stats.openTasks, page: 'tasks' },
    { label: 'Meetings & Calls', value: stats.meetings, page: 'meetings' },
    { label: 'Open Opportunities', value: stats.openOpps, page: 'opportunities' },
    { label: 'Research Queue', value: stats.research, page: 'research' },
  ]

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22 }}>Action Centre</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>What needs attention today</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map(c => (
          <div key={c.label} className="card" style={{ cursor: 'pointer' }} onClick={() => go(c.page)}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{c.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14 }}>Overdue Tasks</h2>
            <button className="btn" onClick={() => go('tasks')}>View all</button>
          </div>
          {overdue.length === 0 ? <div className="empty" style={{ padding: 16 }}>None overdue</div> :
            overdue.map(t => (
              <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                <div style={{ color: '#dc2626' }}>
                  <span className={`badge ${t.priority === 'high' ? 'red' : 'yellow'}`}>{t.priority}</span>
                  {' '}Due {new Date(t.due_at).toLocaleDateString()}
                </div>
              </div>
            ))}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14 }}>Upcoming Tasks</h2>
            <button className="btn" onClick={() => go('tasks')}>View all</button>
          </div>
          {upcoming.length === 0 ? <div className="empty" style={{ padding: 16 }}>No upcoming</div> :
            upcoming.map(t => (
              <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                <div style={{ color: '#64748b' }}>
                  <span className={`badge ${t.priority === 'high' ? 'red' : 'gray'}`}>{t.priority}</span>
                  {' '}Due {new Date(t.due_at).toLocaleDateString()}
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14 }}>Recent Meetings & Calls</h2>
          <button className="btn" onClick={() => go('meetings')}>View all</button>
        </div>
        {recentMeetings.length === 0 ? <div className="empty" style={{ padding: 16 }}>None logged yet</div> :
          <table className="table">
            <thead><tr><th>Type</th><th>Subject</th><th>Outcome</th><th>Next Action</th><th>When</th></tr></thead>
            <tbody>
              {recentMeetings.map(m => (
                <tr key={m.id}>
                  <td><span className="badge blue">{m.type}</span></td>
                  <td style={{ fontWeight: 600 }}>{m.subject}</td>
                  <td>{m.outcome || '—'}</td>
                  <td style={{ color: m.next_action ? '#1e40af' : undefined }}>{m.next_action || '—'}</td>
                  <td>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  )
}
