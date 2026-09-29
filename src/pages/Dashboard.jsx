import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Dashboard({ go }) {
  const [stats, setStats] = useState({ companies: 0, contacts: 0, tasks: 0, meetings: 0, opportunities: 0 })
  const [recentTasks, setRecentTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [c, ct, t, m, o, tasks] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done'),
        supabase.from('meetings_calls').select('id', { count: 'exact', head: true }),
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).neq('stage', 'won').neq('stage', 'lost'),
        supabase.from('tasks').select('id, title, due_at, priority, status, company_id').order('due_at', { ascending: true }).limit(8)
      ])
      setStats({
        companies: c.count || 0,
        contacts: ct.count || 0,
        tasks: t.count || 0,
        meetings: m.count || 0,
        opportunities: o.count || 0
      })
      setRecentTasks(tasks.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Loading dashboard...</div>

  const cards = [
    { label: 'Companies', value: stats.companies, page: 'companies' },
    { label: 'Contacts', value: stats.contacts, page: 'companies' },
    { label: 'Open Tasks', value: stats.tasks, page: 'tasks' },
    { label: 'Meetings & Calls', value: stats.meetings, page: 'meetings' },
    { label: 'Open Opportunities', value: stats.opportunities, page: 'opportunities' },
  ]

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22 }}>Dashboard</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>What needs attention today</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        {cards.map(c => (
          <div key={c.label} className="card" style={{ cursor: 'pointer' }} onClick={() => go(c.page)}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{c.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15 }}>Upcoming / Recent Tasks</h2>
          <button className="btn" onClick={() => go('tasks')}>View all</button>
        </div>
        {recentTasks.length === 0 ? (
          <div className="empty">No tasks yet. Create your first task.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map(t => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td><span className={`badge ${t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}`}>{t.priority || '—'}</span></td>
                  <td><span className="badge blue">{t.status}</span></td>
                  <td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}