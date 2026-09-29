import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_at: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('id, title, description, priority, status, due_at, company_id').order('due_at', { ascending: true }).limit(100)
    setTasks(data || [])
    setLoading(false)
  }

  async function createTask(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: form.title.trim(),
      description: form.description || null,
      priority: form.priority,
      status: 'open',
      due_at: form.due_at || null,
      state: 'active'
    })
    setSaving(false)
    if (!error) {
      setShowNew(false)
      setForm({ title: '', description: '', priority: 'medium', due_at: '' })
      load()
    } else alert(error.message)
  }

  async function markDone(id) {
    await supabase.from('tasks').update({ status: 'done' }).eq('id', id)
    load()
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Tasks</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>What needs to be done</p>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>+ New Task</button>
      </div>

      {loading ? <div className="loading">Loading tasks...</div> : tasks.length === 0 ? (
        <div className="empty">No tasks yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.title}</td>
                  <td><span className={`badge ${t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}`}>{t.priority}</span></td>
                  <td><span className="badge blue">{t.status}</span></td>
                  <td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}</td>
                  <td>
                    {t.status !== 'done' && (
                      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => markDone(t.id)}>Mark done</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ width: 420 }}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>New Task</h2>
            <form onSubmit={createTask}>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Title *</label>
                <input className="input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Description</label>
                <textarea className="input" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="label">Due date</label>
                  <input className="input" type="date" value={form.due_at} onChange={e => setForm({...form, due_at: e.target.value})} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Create Task'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}