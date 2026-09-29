import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function MeetingsCalls() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ type: 'call', subject: '', description: '', scheduled_at: '', outcome: '', next_action: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('meetings_calls').select('*').order('scheduled_at', { ascending: false }).limit(50)
    setItems(data || [])
    setLoading(false)
  }

  async function createItem(e) {
    e.preventDefault()
    if (!form.subject.trim()) return
    setSaving(true)
    const { error } = await supabase.from('meetings_calls').insert({
      type: form.type,
      subject: form.subject.trim(),
      description: form.description || null,
      scheduled_at: form.scheduled_at || new Date().toISOString(),
      status: 'completed',
      outcome: form.outcome || null,
      next_action: form.next_action || null,
      state: 'active'
    })
    setSaving(false)
    if (!error) {
      setShowNew(false)
      setForm({ type: 'call', subject: '', description: '', scheduled_at: '', outcome: '', next_action: '' })
      load()
    } else alert(error.message)
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Meetings & Calls</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Log interactions and next actions</p>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>+ Log Call / Meeting</button>
      </div>

      {loading ? <div className="loading">Loading...</div> : items.length === 0 ? (
        <div className="empty">No meetings or calls recorded yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Subject</th>
                <th>Outcome</th>
                <th>Next Action</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td><span className="badge blue">{i.type}</span></td>
                  <td style={{ fontWeight: 600 }}>{i.subject}</td>
                  <td>{i.outcome || '—'}</td>
                  <td>{i.next_action || '—'}</td>
                  <td>{i.scheduled_at ? new Date(i.scheduled_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ width: 440, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>Log Call or Meeting</h2>
            <form onSubmit={createItem}>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Type</label>
                <select className="input" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Subject *</label>
                <input className="input" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} required />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Notes / Description</label>
                <textarea className="input" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Outcome</label>
                <input className="input" value={form.outcome} onChange={e => setForm({...form, outcome: e.target.value})} placeholder="e.g. Interested, Call back next week" />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label className="label">Next Action</label>
                <input className="input" value={form.next_action} onChange={e => setForm({...form, next_action: e.target.value})} placeholder="What should happen next?" />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}