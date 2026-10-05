import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PageHead, DataTable, Badge } from '../ui'

export default function MeetingsCalls({ go }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [flash, setFlash] = useState('')

  useEffect(() => { load() }, [])

  function showFlash(m) {
    setFlash(m)
    setTimeout(() => setFlash(''), 4000)
  }

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('meetings_calls')
      .select('id, type, subject, outcome, next_action, scheduled_at, company_id, companies(name)')
      .neq('state', 'deleted')
      .order('scheduled_at', { ascending: false })
      .limit(200)
    if (error) console.error(error)
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

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map(i => i.id)))
  }

  async function deleteSelected() {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`Move ${ids.length} selected meeting/call(s) to Deleted? You can restore later from Deleted items.`)) return
    setDeleting(true)
    const { data, error } = await supabase.from('meetings_calls')
      .update({ state: 'deleted', deleted_at: new Date().toISOString() })
      .in('id', ids)
      .select('id')
    setDeleting(false)
    if (error) {
      showFlash('Delete failed: ' + error.message)
      return
    }
    const removed = new Set((data || []).map(r => r.id))
    setItems(prev => prev.filter(i => !removed.has(i.id)))
    setSelected(new Set())
    if (removed.size === 0) showFlash('No meetings were moved to Deleted. Check RLS UPDATE on meetings_calls.')
    else showFlash(`Moved ${removed.size} meeting/call(s) to Deleted.`)
    await load()
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
                {deleting ? 'Deleting…' : (`Move to Deleted (${selected.size})`)}
              </button>
              <button type="button" className="btn" onClick={() => setSelected(new Set())}>Clear</button>
            </>
          )}
        </div>
      </div>

      {flash && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: flash.toLowerCase().includes('fail') ? '#fef2f2' : '#ecfdf5', color: flash.toLowerCase().includes('fail') ? '#991b1b' : '#065f46', fontSize: 13 }}>
          {flash}
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : (
        <DataTable
          rows={items}
          selectable
          selectedIds={selected}
          onToggleRow={toggleSelect}
          onToggleAll={toggleAll}
          allSelected={allSelected}
          someSelected={someSelected}
          columns={[
            { key: 'type', label: 'Type', render: r => <Badge tone="blue">{r.type}</Badge> },
            { key: 'subject', label: 'Subject', render: r => <span style={{ fontWeight: 600 }}>{r.subject}</span> },
            { key: 'company', label: 'Company', render: r => r.companies?.name ? (
              <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
                onClick={() => go('company', r.company_id)}>{r.companies.name}</button>
            ) : '—' },
            { key: 'outcome', label: 'Outcome', render: r => r.outcome || '—' },
            { key: 'next_action', label: 'Next action', render: r => r.next_action || '—' },
            { key: 'when', label: 'When', render: r => r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '—' },
          ]}
        />
      )}
    </div>
  )
}
