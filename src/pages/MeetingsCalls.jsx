import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PageHead, DataTable, Badge, Modal, Field, Actions } from '../ui'

const TYPES = ['call', 'meeting', 'visit', 'message']
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

const emptyForm = {
  company_id: '', type: 'call', subject: '', description: '',
  outcome: '', next_action: '', scheduled_at: '', status: 'open',
}

function statusTone(s) {
  if (s === 'completed') return 'green'
  if (s === 'in_progress') return 'yellow'
  if (s === 'cancelled') return 'gray'
  return 'blue'
}

export default function MeetingsCalls({ go }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [flash, setFlash] = useState('')
  const [companies, setCompanies] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
    supabase.from('companies').select('id, name').eq('state', 'active').order('name').limit(2000)
      .then(({ data }) => setCompanies(data || []))
  }, [])

  function showFlash(m) {
    setFlash(m)
    setTimeout(() => setFlash(''), 4000)
  }

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('meetings_calls')
      .select('id, type, subject, description, outcome, next_action, scheduled_at, status, company_id, contact_id, companies(name)')
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

  function toggleSelectAll(rows, selectAll) {
    setSelected(prev => {
      const next = new Set(prev)
      for (const r of rows) {
        if (selectAll) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
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

  function openCreate() {
    setForm({ ...emptyForm, scheduled_at: new Date().toISOString().slice(0, 16) })
    setShowCreate(true)
  }

  function openEdit(row) {
    setEdit({
      ...row,
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at).toISOString().slice(0, 16) : '',
      status: row.status || 'open',
    })
  }

  async function createItem(e) {
    e.preventDefault()
    if (!form.company_id) { showFlash('Select a company.'); return }
    if (!form.subject.trim()) { showFlash('Subject is required.'); return }
    setSaving(true)
    const payload = {
      company_id: form.company_id,
      type: form.type || 'call',
      subject: form.subject.trim(),
      description: form.description || null,
      outcome: form.outcome || null,
      next_action: form.next_action || null,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : new Date().toISOString(),
      status: form.status || 'open',
      state: 'active',
      metadata: {},
    }
    const { error } = await supabase.from('meetings_calls').insert(payload)
    setSaving(false)
    if (error) { showFlash('Save failed: ' + error.message); return }
    setShowCreate(false)
    showFlash('Saved.')
    load()
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!edit?.id) return
    if (!edit.subject?.trim()) { showFlash('Subject is required.'); return }
    setSaving(true)
    const payload = {
      type: edit.type || 'call',
      subject: edit.subject.trim(),
      description: edit.description || null,
      outcome: edit.outcome || null,
      next_action: edit.next_action || null,
      scheduled_at: edit.scheduled_at ? new Date(edit.scheduled_at).toISOString() : null,
      status: edit.status || 'open',
    }
    const { error } = await supabase.from('meetings_calls').update(payload).eq('id', edit.id)
    setSaving(false)
    if (error) { showFlash('Update failed: ' + error.message); return }
    setEdit(null)
    showFlash('Updated.')
    load()
  }

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Activity" title="Meetings & Calls"
        subtitle="Log calls and meetings. Edit if you made a mistake. Status: Open → In progress → Done.">
        <button type="button" className="btn primary" onClick={openCreate}>+ Log call / meeting</button>
      </PageHead>

      {flash && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: flash.toLowerCase().includes('fail') || flash.toLowerCase().includes('required') || flash.toLowerCase().includes('select') ? '#fef2f2' : '#ecfdf5', color: flash.toLowerCase().includes('fail') || flash.toLowerCase().includes('required') || flash.toLowerCase().includes('select') ? '#991b1b' : '#065f46', fontSize: 13 }}>
          {flash}
        </div>
      )}

      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{selected.size} selected</span>
          <button type="button" className="btn danger" disabled={deleting} onClick={deleteSelected}>
            {deleting ? 'Deleting…' : (`Move to Deleted (${selected.size})`)}
          </button>
          <button type="button" className="btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : (
        <DataTable
          rows={items}
          selectable
          selectedIds={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onRowClick={openEdit}
          empty="No meetings or calls yet. Log from here or from a Company."
          columns={[
            { key: 'type', label: 'Type', render: r => <Badge tone="blue">{r.type}</Badge> },
            { key: 'subject', label: 'Subject', bold: true },
            { key: 'company', label: 'Company', render: r => r.companies?.name ? (
              <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
                onClick={e => { e.stopPropagation(); go('company', r.company_id) }}>{r.companies.name}</button>
            ) : '—' },
            { key: 'status', label: 'Status', render: r => <Badge tone={statusTone(r.status)}>{r.status === 'completed' ? 'done' : (r.status || 'open')}</Badge> },
            { key: 'outcome', label: 'Outcome', render: r => r.outcome || '—' },
            { key: 'next_action', label: 'Next action', render: r => r.next_action || '—' },
            { key: 'when', label: 'When', render: r => r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '—' },
          ]}
        />
      )}

      {showCreate && (
        <Modal title="Log call / meeting" onClose={() => setShowCreate(false)} width={520}>
          <form onSubmit={createItem}>
            <Field label="Company *">
              <select className="input" required value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })}>
                <option value="">Select company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type">
                <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Subject *">
              <input className="input" required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="What was discussed?" />
            </Field>
            <Field label="Notes">
              <textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Outcome">
              <input className="input" value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })} placeholder="Result of the call / meeting" />
            </Field>
            <Field label="Next action">
              <input className="input" value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} />
            </Field>
            <Field label="When">
              <input className="input" type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
            </Field>
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Save" />
          </form>
        </Modal>
      )}

      {edit && (
        <Modal title={`Edit ${edit.type || 'entry'}`} onClose={() => setEdit(null)} width={520}>
          <form onSubmit={saveEdit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type">
                <select className="input" value={edit.type || 'call'} onChange={e => setEdit({ ...edit, type: e.target.value })}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={edit.status || 'open'} onChange={e => setEdit({ ...edit, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
              Use <strong>Edit</strong> to correct mistakes. <strong>In progress</strong> = working on it. <strong>Done</strong> = activity completed.
            </p>
            <Field label="Subject *">
              <input className="input" required value={edit.subject || ''} onChange={e => setEdit({ ...edit, subject: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className="input" rows={2} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Field label="Outcome">
              <input className="input" value={edit.outcome || ''} onChange={e => setEdit({ ...edit, outcome: e.target.value })} />
            </Field>
            <Field label="Next action">
              <input className="input" value={edit.next_action || ''} onChange={e => setEdit({ ...edit, next_action: e.target.value })} />
            </Field>
            <Field label="When">
              <input className="input" type="datetime-local" value={edit.scheduled_at || ''} onChange={e => setEdit({ ...edit, scheduled_at: e.target.value })} />
            </Field>
            <Actions saving={saving} onCancel={() => setEdit(null)} label="Save changes" />
          </form>
        </Modal>
      )}
    </div>
  )
}
