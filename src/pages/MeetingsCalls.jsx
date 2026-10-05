import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function MeetingsCalls({ go }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [flash, setFlash] = useState('')

  useEffect(() => { load() }, [])

  function showFlash(msg) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 4000)
  }

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('meetings_calls')
      .select('id, type, subject, outcome, next_action, next_action_due_at, scheduled_at, company_id, companies(name)')
      .order('scheduled_at', { ascending: false }).limit(60)
    if (error) showFlash('Load failed: ' + error.message)
    setItems(data || [])
    setLoading(false)
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(selectAll) {
    if (selectAll) setSelected(new Set(items.map(i => i.id)))
    else setSelected(new Set())
  }

  async function deleteSelected() {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} selected meeting/call(s)? This cannot be undone.`)) return
    setDeleting(true)
    const { error } = await supabase.from('meetings_calls').delete().in('id', ids)
    setDeleting(false)
    if (error) {
      showFlash('Delete failed: ' + error.message)
      return
    }
    setSelected(new Set())
    showFlash(`Deleted ${ids.length} meeting/call(s).`)
    load()
  }

  const allSelected = items.length > 0 && items.every(i => selected.has(i.id))
  const someSelected = items.some(i => selected.has(i.id))

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Meetings & Calls</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Purpose → Outcome → Next Action — log from a Company</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: '#64748b' }}>{selected.size} selected</span>
              <button type="button" className="btn danger" disabled={deleting} onClick={deleteSelected}>
                {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
              </button>
              <button type="button" className="btn" onClick={() => setSelected(new Set())}>Clear</button>
            </>
          )}
          <button className="btn primary" onClick={() => go('companies')}>Go to Companies →</button>
        </div>
      </div>

      {flash && (
        <div className="notice" style={{ marginBottom: 12, background: flash.includes('failed') ? '#fef2f2' : '#ecfdf5', color: flash.includes('failed') ? '#991b1b' : '#065f46' }}>
          {flash}
        </div>
      )}

      {loading ? <div className="loading">Loading...</div> : items.length === 0 ? (
        <div className="empty">No meetings or calls yet. Open a Company and log from there.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={() => toggleSelectAll(!allSelected)}
                    aria-label="Select all"
                  />
                </th>
                <th>Type</th>
                <th>Subject</th>
                <th>Company</th>
                <th>Outcome</th>
                <th>Next Action</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(i.id)}
                      onChange={() => toggleSelect(i.id)}
                      aria-label="Select row"
                    />
                  </td>
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
