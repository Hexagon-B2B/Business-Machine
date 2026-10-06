import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE, TASK_STATUS, TASK_PRIORITY, TRIGGER_TYPE_LABELS, isTaskClosed, isTaskOpen } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'

function hasOutcome(t) {
  const d = (t?.description || '')
  if (/---\s*Work done/i.test(d)) return true
  if (t?.metadata?.outcome) return true
  return false
}

function isInstructionOnly(t) {
  const src = t?.source === 'trigger' || t?.source === 'research' || t?.metadata?.trigger_type
  return src && !hasOutcome(t)
}

export default function Tasks({ go }) {
  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortKey, setSortKey] = useState('due_at')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ company_id: '', title: '', description: '', priority: 'medium', due_at: '' })
  const [companies, setCompanies] = useState([])
  const [complete, setComplete] = useState(null)
  const [completeForm, setCompleteForm] = useState({ outcome: '', next_due: '', next_title: '' })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [flash, setFlash] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { load() }, [filter, sourceFilter, page, sortKey, sortDir])
  useEffect(() => {
    supabase.from('companies').select('id, name').eq('state', 'active').order('name').limit(2000)
      .then(({ data }) => setCompanies(data || []))
  }, [])

  function showFlash(msg) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 4000)
  }

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase.from('tasks')
      .select('id, title, description, priority, status, due_at, company_id, source, metadata, state, companies(name)', { count: 'exact' })
      .neq('state', 'deleted')
      .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to)
    if (filter === 'open') q = q.eq('status', 'open')
    else if (filter === 'in_progress') q = q.eq('status', 'in_progress')
    else if (filter === 'active') q = q.in('status', ['open', 'in_progress'])
    else if (filter === 'done') q = q.in('status', ['completed', 'done'])
    else if (filter === 'cancelled') q = q.eq('status', 'cancelled')
    const { data, count, error } = await q
    if (error) {
      console.error(error)
      showFlash('Load failed: ' + error.message)
    }
    let rows = data || []
    if (sourceFilter === 'trigger') rows = rows.filter(t => t.source === 'trigger' || t.metadata?.trigger_type)
    else if (sourceFilter === 'user') rows = rows.filter(t => t.source === 'user' || !t.source)
    setTasks(rows)
    setTotal(count || 0)
    setLoading(false)
  }

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
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
    if (!confirm(`Move ${ids.length} selected task(s) to Deleted? You can restore later from Deleted items.`)) return
    setDeleting(true)
    const { data, error } = await supabase.from('tasks')
      .update({ state: 'deleted', deleted_at: new Date().toISOString() })
      .in('id', ids)
      .select('id')
    setDeleting(false)
    if (error) {
      showFlash('Delete failed: ' + error.message)
      return
    }
    const removed = new Set((data || []).map(r => r.id))
    setTasks(prev => prev.filter(t => !removed.has(t.id)))
    setSelected(new Set())
    if (removed.size === 0) showFlash('No tasks were moved to Deleted. Check RLS UPDATE on tasks.')
    else showFlash(`Moved ${removed.size} task(s) to Deleted.`)
    await load()
  }

  async function setStatus(id, status) {
    setBusyId(id)
    const dbStatus = status === 'done' ? 'completed' : status
    const { error } = await supabase.from('tasks').update({ status: dbStatus }).eq('id', id)
    setBusyId(null)
    if (error) {
      showFlash('Update failed: ' + error.message)
      return
    }
    showFlash(dbStatus === 'in_progress' ? 'Moved to In progress.' : 'Task updated.')
    load()
  }

  function openComplete(t) {
    setComplete(t)
    setCompleteForm({ outcome: '', next_due: '', next_title: '' })
  }

  async function submitComplete(e) {
    e.preventDefault()
    if (!complete) return
    const outcome = (completeForm.outcome || '').trim()
    if (!outcome) {
      showFlash('Please record what was done on this task before closing it.')
      return
    }
    setSaving(true)
    const stamp = new Date().toLocaleString()
    let description = complete.description || ''
    if (/---\s*Work done/i.test(description)) {
      description = description.replace(/---\s*Work done[\s\S]*$/i, '').trim()
    }
    description = (description ? description + '\n\n' : '') + `--- Work done (${stamp}) ---\n${outcome}`
    const meta = { ...(complete.metadata || {}), outcome, completed_at: new Date().toISOString() }
    const payload = { status: 'completed', description: description || null, metadata: meta }
    let { error } = await supabase.from('tasks').update(payload).eq('id', complete.id)
    if (error && /metadata|column/i.test(error.message)) {
      ;({ error } = await supabase.from('tasks').update({ status: 'completed', description: description || null }).eq('id', complete.id))
    }
    if (!error && completeForm.next_due) {
      await supabase.from('tasks').insert({
        company_id: complete.company_id,
        title: (completeForm.next_title || ('Follow-up: ' + complete.title)).slice(0, 200),
        description: 'Follow-up after: ' + complete.title,
        priority: complete.priority || 'medium',
        status: 'open',
        due_at: completeForm.next_due,
        state: 'active',
        source: 'user',
        metadata: { origin: 'task_complete', parent_task_id: complete.id },
      })
    }
    setSaving(false)
    if (error) {
      showFlash('Could not complete: ' + error.message)
      return
    }
    showFlash('Task marked done. Work log saved.')
    setComplete(null)
    if (edit?.id === complete.id) setEdit(null)
    load()
  }

  async function cancelTask(id) {
    if (!confirm('Cancel this task?')) return
    const { error } = await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', id)
    if (error) showFlash('Cancel failed: ' + error.message)
    else {
      showFlash('Task cancelled.')
      if (edit?.id === id) setEdit(null)
      load()
    }
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!edit) return
    setSaving(true)
    let status = edit.status || 'open'
    if (status === 'done') status = 'completed'
    const payload = {
      title: edit.title?.trim() || edit.title,
      description: edit.description || null,
      priority: (edit.priority || 'medium').toLowerCase(),
      status,
      due_at: edit.due_at || null,
    }
    const { error } = await supabase.from('tasks').update(payload).eq('id', edit.id)
    setSaving(false)
    if (error) {
      showFlash('Save failed: ' + error.message)
      return
    }
    setEdit(null)
    showFlash('Task updated.')
    load()
  }

  async function createTask(e) {
    e.preventDefault()
    if (!createForm.company_id) { showFlash('Select a company.'); return }
    if (!createForm.title.trim()) { showFlash('Title is required.'); return }
    setSaving(true)
    const payload = {
      company_id: createForm.company_id,
      title: createForm.title.trim(),
      description: createForm.description || null,
      priority: (createForm.priority || 'medium').toLowerCase(),
      status: 'open',
      due_at: createForm.due_at || null,
      state: 'active',
      source: 'user',
      metadata: {},
    }
    const { error } = await supabase.from('tasks').insert(payload)
    setSaving(false)
    if (error) { showFlash('Create failed: ' + error.message); return }
    setShowCreate(false)
    setCreateForm({ company_id: '', title: '', description: '', priority: 'medium', due_at: '' })
    showFlash('Task created.')
    load()
  }

  const columns = [
    { key: 'title', label: 'Task', bold: true, render: t => (
      <div>
        <div>{t.title}</div>
        {isInstructionOnly(t) && <div style={{ fontSize: 11, color: '#64748b' }}>Instruction · {TRIGGER_TYPE_LABELS[t.metadata?.trigger_type] || t.source}</div>}
      </div>
    ) },
    { key: 'company', label: 'Company', render: t => t.companies?.name ? (
      <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
        onClick={e => { e.stopPropagation(); go('company', t.company_id) }}>{t.companies.name}</button>
    ) : '—' },
    { key: 'priority', label: 'Priority', render: t => <Badge tone={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}>{t.priority}</Badge> },
    { key: 'status', label: 'Status', render: t => <Badge tone={t.status === 'completed' || t.status === 'done' ? 'green' : t.status === 'in_progress' ? 'yellow' : 'blue'}>{t.status === 'completed' ? 'done' : t.status}</Badge> },
    { key: 'due_at', label: 'Due', render: t => t.due_at ? new Date(t.due_at).toLocaleDateString() : '—' },
    { key: 'actions', label: '', render: t => isTaskOpen(t.status) ? (
      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
        {t.status !== 'in_progress' && <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 6px' }} disabled={busyId === t.id} onClick={() => setStatus(t.id, 'in_progress')}>Start</button>}
        <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => openComplete(t)}>Done</button>
      </div>
    ) : null },
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Work" title="Tasks" subtitle="Open → Start (in progress) → Done with work log. Optional next schedule keeps the pipeline moving.">
        <button type="button" className="btn" onClick={() => go('companies')}>Companies</button>
        <button type="button" className="btn primary" onClick={() => { setCreateForm({ company_id: '', title: '', description: '', priority: 'medium', due_at: '' }); setShowCreate(true) }}>+ New task</button>
      </PageHead>

      {flash && (
        <div className="notice" style={{ marginBottom: 12, background: flash.includes('failed') || flash.includes('Please') || flash.includes('Select') || flash.includes('required') ? '#fef2f2' : '#ecfdf5', borderColor: flash.includes('failed') || flash.includes('Please') || flash.includes('Select') || flash.includes('required') ? '#fecaca' : '#a7f3d0', color: flash.includes('failed') || flash.includes('Please') || flash.includes('Select') || flash.includes('required') ? '#991b1b' : '#065f46' }}>
          {flash}
        </div>
      )}

      <FilterTabs value={filter} onChange={v => { setFilter(v); setPage(1); setSelected(new Set()) }}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'active', label: 'Active' },
          { value: 'done', label: 'Done' },
          { value: 'cancelled', label: 'Cancelled' },
          { value: 'all', label: 'All' },
        ]} />

      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{selected.size} selected</span>
          <button type="button" className="btn danger" disabled={deleting} onClick={deleteSelected}>
            {deleting ? 'Deleting…' : (`Move to Deleted (${selected.size})`)}
          </button>
          <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      {loading ? <div className="loading">Loading...</div> : (
        <DataTable columns={columns} rows={tasks} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage}
          onRowClick={t => setEdit({ ...t, due_at: (t.due_at || '').slice(0, 10) })}
          empty="No tasks in this view."
          selectable
          selectedIds={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      )}

      {complete && (
        <Modal title="Complete task — record work done" onClose={() => setComplete(null)} width={540}>
          <form onSubmit={submitComplete}>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#64748b' }}>
              <strong style={{ color: '#0f172a' }}>{complete.title}</strong>
              {complete.companies?.name && <> · {complete.companies.name}</>}
            </div>
            <Field label="Work done / outcome *">
              <textarea className="input" rows={4} required
                value={completeForm.outcome}
                onChange={e => setCompleteForm({ ...completeForm, outcome: e.target.value })}
                placeholder="What did you do?" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Next due (optional)">
                <input className="input" type="date" value={completeForm.next_due}
                  onChange={e => setCompleteForm({ ...completeForm, next_due: e.target.value })} />
              </Field>
              <Field label="Next task title">
                <input className="input" value={completeForm.next_title}
                  onChange={e => setCompleteForm({ ...completeForm, next_title: e.target.value })}
                  disabled={!completeForm.next_due} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Mark done'}</button>
              <button type="button" className="btn" onClick={() => setComplete(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {showCreate && (
        <Modal title="New task" onClose={() => setShowCreate(false)} width={520}>
          <form onSubmit={createTask}>
            <Field label="Company *">
              <select className="input" required value={createForm.company_id} onChange={e => setCreateForm({ ...createForm, company_id: e.target.value })}>
                <option value="">Select company…</option>
                {companies.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
              </select>
            </Field>
            <Field label="Title *">
              <input className="input" required value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea className="input" rows={2} value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Priority">
                <select className="input" value={createForm.priority} onChange={e => setCreateForm({ ...createForm, priority: e.target.value })}>
                  {TASK_PRIORITY.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Due">
                <input className="input" type="date" value={createForm.due_at} onChange={e => setCreateForm({ ...createForm, due_at: e.target.value })} />
              </Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create task" />
          </form>
        </Modal>
      )}

      {edit && (
        <Modal title="Update Task" onClose={() => setEdit(null)} width={520}>
          <form onSubmit={saveEdit}>
            <Field label="Title *">
              <input className="input" value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} required />
            </Field>
            <Field label="Description / instructions">
              <textarea className="input" rows={3} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Priority">
                <select className="input" value={edit.priority || 'medium'} onChange={e => setEdit({ ...edit, priority: e.target.value })}>
                  {TASK_PRIORITY.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={edit.status === 'done' ? 'completed' : (edit.status || 'open')} onChange={e => setEdit({ ...edit, status: e.target.value })}>
                  {TASK_STATUS.map(s => <option key={s} value={s}>{s === 'completed' ? 'done' : s}</option>)}
                </select>
              </Field>
              <Field label="Due date">
                <input className="input" type="date" value={edit.due_at || ''} onChange={e => setEdit({ ...edit, due_at: e.target.value })} />
              </Field>
            </div>
            <p style={{ fontSize: 12, color: '#64748b' }}>Edit corrects mistakes. In progress = working on it. Done = completed.</p>
            <Actions saving={saving} onCancel={() => setEdit(null)} label="Save changes" />
          </form>
        </Modal>
      )}
    </div>
  )
}
