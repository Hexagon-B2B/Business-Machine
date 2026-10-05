import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PageHead, Badge } from '../ui'

const TABLES = [
  { key: 'tasks', label: 'Tasks', select: 'id, title, status, due_at, company_id, deleted_at, companies(name)', title: r => r.title },
  { key: 'meetings_calls', label: 'Meetings & Calls', select: 'id, type, subject, scheduled_at, company_id, deleted_at, companies(name)', title: r => r.subject },
  { key: 'opportunities', label: 'Opportunities', select: 'id, name, stage, deal_size, company_id, deleted_at, companies(name)', title: r => r.name },
]

export default function Trash({ go }) {
  const [tab, setTab] = useState('tasks')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [flash, setFlash] = useState('')

  useEffect(() => { load() }, [tab])

  function show(msg) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 4000)
  }

  async function load() {
    setLoading(true)
    const meta = TABLES.find(t => t.key === tab)
    const { data, error } = await supabase.from(tab)
      .select(meta.select)
      .eq('state', 'deleted')
      .order('deleted_at', { ascending: false, nullsFirst: false })
      .limit(200)
    if (error) {
      const r2 = await supabase.from(tab).select(meta.select).eq('state', 'deleted').limit(200)
      if (r2.error) show('Load failed: ' + r2.error.message)
      setRows(r2.data || [])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  async function restore(id) {
    setBusy(id)
    const { error } = await supabase.from(tab).update({ state: 'active', deleted_at: null }).eq('id', id)
    setBusy(null)
    if (error) {
      const { error: e2 } = await supabase.from(tab).update({ state: 'active' }).eq('id', id)
      if (e2) { show('Restore failed: ' + e2.message); return }
    }
    show('Restored.')
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function purge(id) {
    if (!confirm('Permanently delete? This cannot be undone.')) return
    setBusy(id)
    if (tab === 'opportunities') {
      await supabase.from('opportunity_history').delete().in('opportunity_id', [id])
      const { data: qs } = await supabase.from('quotations').select('id').eq('opportunity_id', id)
      const qids = (qs || []).map(q => q.id)
      if (qids.length) {
        await supabase.from('quotation_items').delete().in('quotation_id', qids)
        await supabase.from('quotations').delete().in('id', qids)
      }
    }
    const { error } = await supabase.from(tab).delete().eq('id', id)
    setBusy(null)
    if (error) { show('Permanent delete failed: ' + error.message); return }
    show('Permanently deleted.')
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const meta = TABLES.find(t => t.key === tab)

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Recovery" title="Trash" subtitle="Items moved to trash. Restore if deleted by mistake, or permanently delete.">
        <button type="button" className="btn" onClick={() => go('dashboard')}>Action Centre</button>
      </PageHead>

      {flash && (
        <div className="notice" style={{ marginBottom: 12, background: flash.includes('failed') ? '#fef2f2' : '#ecfdf5', color: flash.includes('failed') ? '#991b1b' : '#065f46' }}>
          {flash}
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 12 }}>
        {TABLES.map(t => (
          <button key={t.key} type="button" className="btn"
            style={{ background: tab === t.key ? '#1e40af' : '#fff', color: tab === t.key ? '#fff' : '#0f172a', fontSize: 12 }}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="loading">Loading…</div> : rows.length === 0 ? (
        <div className="empty">Trash is empty for {meta.label.toLowerCase()}.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Company</th>
                <th>Deleted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>
                    {meta.title(r)}{' '}
                    {tab === 'tasks' && r.status && <Badge tone="gray">{r.status}</Badge>}
                    {tab === 'opportunities' && r.stage && <Badge tone="gray">{r.stage}</Badge>}
                    {tab === 'meetings_calls' && r.type && <Badge tone="blue">{r.type}</Badge>}
                  </td>
                  <td>
                    {r.companies?.name ? (
                      <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
                        onClick={() => go('company', r.company_id)}>{r.companies.name}</button>
                    ) : '—'}
                  </td>
                  <td>{r.deleted_at ? new Date(r.deleted_at).toLocaleString() : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn primary" style={{ fontSize: 12 }} disabled={busy === r.id}
                        onClick={() => restore(r.id)}>Restore</button>
                      <button type="button" className="btn danger" style={{ fontSize: 12 }} disabled={busy === r.id}
                        onClick={() => purge(r.id)}>Delete forever</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
