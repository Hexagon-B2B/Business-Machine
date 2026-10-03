import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE, TASK_STATUS, TASK_PRIORITY, TRIGGER_TYPE_LABELS, isTaskClosed, isTaskOpen } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'

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
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [flash, setFlash] = useState('')

  useEffect(() => { load() }, [filter, sourceFilter, page, sortKey, sortDir])

  function showFlash(msg) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 3500)
  }

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase.from('tasks')
      .select('id, title, description, priority, status, due_at, company_id, source, metadata, state, companies(name)', { count: 'exact' })
      .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to)
    if (filter === 'open') q = q.in('status', ['open', 'in_progress'])
    else if (filter === 'done') q = q.in('status', ['completed', 'done'])
    else if (filter === 'cancelled') q = q.eq('status', 'cancelled')
    const { data, count, error } = await q
    if (error) {
      console.error(error)
      showFlash('Load failed: ' + error.message)
    }
    let rows = data || []
    const isTrig = t => t.source === 'trigger' || t.source === 'research' || t.metadata?.origin === 'trigger' || t.metadata?.trigger_type
    if (sourceFilter === 'trigger') rows = rows.filter(isTrig)
    else if (sourceFilter === 'user') rows = rows.filter(t => !isTrig(t))
    setTasks(rows)
    setTotal(count || 0)
    setLoading(false)
  }

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  async function updateTaskStatus(id, status) {
    setBusyId(id)
    const dbStatus = status === 'done' ? 'completed' : status
    const payload = { status: dbStatus }
    if (dbStatus === 'completed') payload.completed_at = new Date().toISOString()
    let { error } = await supabase.from('tasks').update(payload).eq('id', id)
    if (error && /completed_at|column/i.test(error.message)) {
      ;({ error } = await supabase.from('tasks').update({ status: dbStatus }).eq('id', id))
    }
    setBusyId(null)
    if (error) {
      showFlash('Update failed: ' + error.message)
      console.error('task status update', error)
      return false
    }
    if (filter === 'open' && isTaskClosed(dbStatus)) {
      setTasks(prev => prev.filter(t => t.id !== id))
      setTotal(t => Math.max(0, t - 1))
    } else {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: dbStatus } : t))
    }
    if (edit?.id === id) setEdit(null)
    showFlash(dbStatus === 'completed' ? 'Task marked done.' : dbStatus === 'cancelled' ? 'Task cancelled.' : 'Task updated.')
    load()
    return true
  }

  async function markDone(e, id) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    await updateTaskStatus(id, 'completed')
  }

  async function cancelTask(e, id) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    if (!confirm('Cancel this task?')) return
    await updateTaskStatus(id, 'cancelled')
  }

  async function saveEdit(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!edit?.title?.trim()) return
    setSaving(true)
    let status = edit.status || 'open'
    if (status === 'done') status = 'completed'
    const payload = {
      title: edit.title.trim(),
      description: edit.description || null,
      priority: edit.priority || 'medium',
      status,
      due_at: edit.due_at || null,
    }
    if (payload.status === 'completed') payload.completed_at = new Date().toISOString()
    let { error } = await supabase.from('tasks').update(payload).eq('id', edit.id)
    if (error && /completed_at|column/i.test(error.message)) {
      delete payload.completed_at
      ;({ error } = await supabase.from('tasks').update(payload).eq('id', edit.id))
    }
    setSaving(false)
    if (error) {
      showFlash('Save failed: ' + error.message)
      console.error('task save', error)
      return
    }
    const id = edit.id
    const newStatus = payload.status
    setEdit(null)
    showFlash('Task saved.')
    if (filter === 'open' && isTaskClosed(newStatus)) {
      setTasks(prev => prev.filter(t => t.id !== id))
      setTotal(t => Math.max(0, t - 1))
    }
    load()
  }

  function typeBadge(t) {
    const tt = t.metadata?.trigger_type || (t.source === 'trigger' || t.source === 'research' ? t.source : null)
    return tt ? <Badge tone="blue">{TRIGGER_TYPE_LABELS[tt] || tt}</Badge> : <Badge>Scheduled</Badge>
  }

  const columns = [
    { key: 'title', label: 'Title', bold: true },
    { key: 'company', label: 'Company', render: t => t.companies?.name ? (
      <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
        onClick={e => { e.stopPropagation(); go('company', t.company_id) }}>{t.companies.name}</button>
    ) : '—' },
    { key: 'type', label: 'Type', render: typeBadge },
    { key: 'priority', label: 'Priority', render: t => <Badge tone={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}>{t.priority}</Badge> },
    { key: 'status', label: 'Status', render: t => <Badge tone={t.status === 'completed' || t.status === 'done' ? 'green' : t.status === 'cancelled' ? 'gray' : 'blue'}>{t.status === 'completed' ? 'done' : t.status}</Badge> },
    { key: 'due_at', label: 'Due', render: t => t.due_at ? new Date(t.due_at).toLocaleDateString() : '—' },
    { key: 'action', label: '', render: t => (
      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
        {isTaskOpen(t.status) && (
          <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
            disabled={busyId === t.id}
            onClick={e => markDone(e, t.id)}>
            {busyId === t.id ? '…' : 'Done'}
          </button>
        )}
        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={e => { e.stopPropagation(); setEdit({ ...t, due_at: (t.due_at || '').slice(0, 10) }) }}>
          Edit
        </button>
      </div>
    )},
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Work" title="Tasks" subtitle="Scheduled by you or generated by triggers. Use Done or Edit → Mark Done to close work.">
        <button type="button" className="btn primary" onClick={() => go('companies')}>Go to Companies →</button>
      </PageHead>

      {flash && (
        <div className="notice" style={{ marginBottom: 12, background: flash.includes('failed') ? '#fef2f2' : '#ecfdf5', borderColor: flash.includes('failed') ? '#fecaca' : '#a7f3d0', color: flash.includes('failed') ? '#991b1b' : '#065f46' }}>
          {flash}
        </div>
      )}

      <FilterTabs value={filter} onChange={v => { setFilter(v); setPage(1) }}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Done' },
          { value: 'cancelled', label: 'Cancelled' },
          { value: 'all', label: 'All' },
        ]} />

      <div className="toolbar">
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Source:</span>
        {[
          { value: 'all', label: 'All sources' },
          { value: 'user', label: 'Scheduled (you)' },
          { value: 'trigger', label: 'Trigger / Enrichment' },
        ].map(o => (
          <button type="button" key={o.value} className="btn" onClick={() => { setSourceFilter(o.value); setPage(1) }}
            style={{ background: sourceFilter === o.value ? '#1e40af' : '#fff', color: sourceFilter === o.value ? '#fff' : '#0f172a', fontSize: 12 }}>
            {o.label}
          </button>
        ))}
      </div>

      {loading ? <div className="loading">Loading...</div> : (
        <DataTable columns={columns} rows={tasks} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage}
          onRowClick={t => setEdit({ ...t, due_at: (t.due_at || '').slice(0, 10) })}
          empty="No tasks. Open a Company to create one, or run Generate on Action Centre." />
      )}

      {edit && (
        <Modal title="Update Task" onClose={() => setEdit(null)} width={520}>
          <form onSubmit={saveEdit}>
            {edit.companies?.name && (
              <div style={{ marginBottom: 12, fontSize: 13, color: '#64748b' }}>
                Company: <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                  onClick={() => { setEdit(null); go('company', edit.company_id) }}>{edit.companies.name}</button>
              </div>
            )}
            {typeBadge(edit)}
            <div style={{ height: 10 }} />
            <Field label="Title *">
              <input className="input" value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} required />
            </Field>
            <Field label="Description / notes">
              <textarea className="input" rows={4} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })}
                placeholder="What to do, links, outcome notes…" />
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {isTaskOpen(edit.status) && (
                <button type="button" className="btn primary" disabled={busyId === edit.id}
                  onClick={e => markDone(e, edit.id)}>
                  {busyId === edit.id ? 'Saving…' : 'Mark Done'}
                </button>
              )}
              {edit.status !== 'cancelled' && (
                <button type="button" className="btn danger" disabled={busyId === edit.id}
                  onClick={e => cancelTask(e, edit.id)}>Cancel task</button>
              )}
              {edit.company_id && (
                <button type="button" className="btn" onClick={() => { setEdit(null); go('company', edit.company_id) }}>Open company →</button>
              )}
            </div>
            <Actions saving={saving} onCancel={() => setEdit(null)} label="Save changes" />
          </form>
        </Modal>
      )}
    </div>
  )
}
