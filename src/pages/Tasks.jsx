import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Tasks({ go }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    let q = supabase.from('tasks').select('id, title, description, priority, status, due_at, company_id, companies(name)').order('due_at', { ascending: true }).limit(100)
    if (filter === 'open') q = q.in('status', ['open', 'in_progress'])
    else if (filter === 'done') q = q.eq('status', 'done')
    const { data } = await q
    setTasks(data || [])
    setLoading(false)
  }

  async function markDone(id) {
    await supabase.from('tasks').update({ status: 'done' }).eq('id', id)
    load()
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Tasks</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Create tasks from a Company for best results</p>
        </div>
        <button className="btn primary" onClick={() => go('companies')}>Go to Companies →</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([f, label]) => (
          <button key={f} className="btn" onClick={() => setFilter(f)}
            style={{ background: filter === f ? '#2563eb' : '#fff', color: filter === f ? '#fff' : '#0f172a' }}>{label}</button>
        ))}
      </div>

      {loading ? <div className="loading">Loading...</div> : tasks.length === 0 ? (
        <div className="empty">No tasks. Open a Company and create a task from there.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Title</th><th>Company</th><th>Priority</th><th>Status</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.title}</td>
                  <td>{t.companies?.name ? (
                    <button style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
                      onClick={() => go('company', t.company_id)}>{t.companies.name}</button>
                  ) : '—'}</td>
                  <td><span className={`badge ${t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}`}>{t.priority}</span></td>
                  <td><span className="badge blue">{t.status}</span></td>
                  <td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}</td>
                  <td>{t.status !== 'done' && <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => markDone(t.id)}>Done</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
