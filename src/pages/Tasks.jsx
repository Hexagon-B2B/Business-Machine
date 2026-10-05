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
  const [complete, setComplete] = useState(null)
  const [completeForm, setCompleteForm] = useState({ outcome: '', next_due: '', next_title: '' })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [flash, setFlash] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { load() }, [filter, sourceFilter, page, sortKey, sortDir])

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
    if (!confirm(`Delete ${ids.length} selected task(s)? This cannot be undone.`)) return
    setDeleting(true)
    let deletedIds = []
    let errMsg = null
    {
      const { data, error } = await supabase.from('tasks').delete().in('id', ids).select('id')
      if (error) errMsg = error.message
      else deletedIds = (data || []).map(r => r.id)
    }
    if (errMsg && /permission|policy|returning/i.test(errMsg)) {
      const { error } = await supabase.from('tasks').delete().in('id', ids)
      if (error) {
        setDeleting(false)
        showFlash('Delete failed: ' + error.message)
        return
      }
      deletedIds = ids
      errMsg = null
    }
    setDeleting(false)
    if (errMsg) {
      showFlash('Delete failed: ' + errMsg)
      return
    }
    const removed = new Set(deletedIds)
    setTasks(prev => prev.filter(t => !removed.has(t.id)))
    setTotal(t => Math.max(0, (t || 0) - removed.size))
    setSelected(new Set())
    if (removed.size === 0) {
      showFlash('No tasks were deleted. Check Supabase RLS DELETE policy on tasks.')
    } else if (removed.size < ids.length) {
      showFlash(`Deleted ${removed.size} of ${ids.length} task(s). Some may be blocked by related data or RLS.`)
    } else {
      showFlash(`Deleted ${removed.size} task(s).`)
    }
    await load()
  }

  async function setStatus(id, status) {
    setBusyId(id)
    const dbStatus = status === 'done' ? 'completed' : status
    const { error } = await supabase.from('tasks').update({ status: dbStatus }).eq('id', id)
    setBusyId(null)
    if (error) {
      showFlash('Update failed: ' + error.message)
      return false
    }
    showFlash(dbStatus === 'in_progress' ? 'Moved to In progress.' : 'Task updated.')
    load()
    return true
  }

  function openComplete(t) {
    setComplete(t)
    setCompleteForm({
      outcome: t.metadata?.outcome || '',
      next_due: '',
      next_title: t.title ? `Follow-up: ${t.title}` : '',
    })
  }

  async function submitComplete(e) {
    e.preventDefault()
    if (!complete) return
    const outcome = (completeForm.outcome || '').trim()
    const needOutcome = !(complete.description || '').trim() || isInstructionOnly(complete) || !hasOutcome(complete)
    if (needOutcome && !outcome) {
      showFlash('Please record what was done on this task before closing it.')
      return
    }
    setSaving(true)
    const stamp = new Date().toISOString().slice(0, 10)
    let description = complete.description || ''
    if (outcome) {
      if (/---\s*Work done/i.test(description)) {
        description = description.replace(/---\s*Work done[\s\S]*$/i, '').trim()
      }
      description = (description ? description + '\n\n' : '') + `--- Work done (${stamp}) ---\n${outcome}`
    }
    const meta = { ...(complete.metadata || {}), outcome: outcome || complete.metadata?.outcome || null, completed_on: stamp }
    const payload = { status: 'completed', description: description || null, metadata: meta }
    let { error } = await supabase.from('tasks').update(payload).eq('id', complete.id)
    if (error && /metadata|column/i.test(error.message)) {
      ;({ error } = await supabase.from('tasks').update({ status: 'completed', description: description || null }).eq('id', complete.id))
    }
    if (error) {
      setSaving(false)
      showFlash('Complete failed: ' + error.message)
      return
    }
    if (completeForm.next_due) {
      const followTitle = (completeForm.next_title || `Follow-up: ${complete.title}`).trim()
      await supabase.from('tasks').insert({
        company_id: complete.company_id,
        title: followTitle,
        description: `Follow-up from completed task: ${complete.title}`,
        priority: complete.priority || 'medium',
        status: 'open',
        due_at: completeForm.next_due,
        state: 'active',
        source: 'user',
        metadata: { origin: 'follow_up', parent_task_id: complete.id },
      })
      showFlash('Task completed and next work scheduled.')
    } else {
      showFlash('Task marked done. Work log saved.')
    }
    setSaving(false)
    setComplete(null)
    if (edit?.id === complete.id) setEdit(null)
    load()
  }

  async function cancelTask(e, id) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    if (!confirm('Cancel this task?')) return
    setBusyId(id)
    const { error } = await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', id)
    setBusyId(null)
    if (error) showFlash('Update failed: ' + error.message)
    else {
      showFlash('Task cancelled.')
      if (edit?.id === id) setEdit(null)
      load()
    }
  }

  async function saveEdit(e) {
    e.preventDefault()
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
    const { error } = await supabase.from('tasks').update(payload).eq('id', edit.id)
    setSaving(false)
    if (error) {
      showFlash('Save failed: ' + error.message)
      return
    }
    setEdit(null)
    showFlash('Task saved.')
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
    { key: 'status', label: 'Status', render: t => <Badge tone={t.status === 'completed' || t.status === 'done' ? 'green' : t.status === 'cancelled' ? 'gray' : t.status === 'in_progress' ? 'yellow' : 'blue'}>{t.status === 'completed' ? 'done' : t.status}</Badge> },
    { key: 'due_at', label: 'Due', render: t => t.due_at ? new Date(t.due_at).toLocaleDateString() : '—' },
    { key: 'action', label: '', render: t => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
        {t.status === 'open' && (
          <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
            disabled={busyId === t.id}
            onClick={() => setStatus(t.id, 'in_progress')}>Start</button>
        )}
        {isTaskOpen(t.status) && (
          <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
            disabled={busyId === t.id}
            onClick={() => openComplete(t)}>Done</button>
        )}
        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => setEdit({ ...t, due_at: (t.due_at || '').slice(0, 10) })}>Edit</button>
      </div>
    )},
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Work" title="Tasks" subtitle="Open → Start (in progress) → Done with work log. Optional next schedule keeps the pipeline moving.">
        <button type="button" className="btn primary" onClick={() => go('companies')}>Go to Companies →</button>
      </PageHead>

      {flash && (
        <div className="notice" style={{ marginBottom: 12, background: flash.includes('failed') || flash.includes('Please') ? '#fef2f2' : '#ecfdf5', borderColor: flash.includes('failed') || flash.includes('Please') ? '#fecaca' : '#a7f3d0', color: flash.includes('failed') || flash.includes('Please') ? '#991b1b' : '#065f46' }}>
          {flash}
        </div>
      )}

      <FilterTabs value={filter} onChange={v => { setFilter(v); setPage(1); setSelected(new Set()) }}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'active', label: 'All active' },
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
          <button type="button" key={o.value} className="btn" onClick={() => { setSourceFilter(o.value); setPage(1); setSelected(new Set()) }}
            style={{ background: sourceFilter === o.value ? '#1e40af' : '#fff', color: sourceFilter === o.value ? '#fff' : '#0f172a', fontSize: 12 }}>
            {o.label}
          </button>
        ))}
        {selected.size > 0 && (
          <>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{selected.size} selected</span>
            <button type="button" className="btn danger" disabled={deleting} onClick={deleteSelected} style={{ fontSize: 12 }}>
              {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
            <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setSelected(new Set())}>Clear selection</button>
          </>
        )}
      </div>

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
              <Field label="Next due date">
                <input className="input" type="date" value={completeForm.next_due}
                  onChange={e => setCompleteForm({ ...completeForm, next_due: e.target.value })} />
              </Field>
              <Field label="Follow-up title">
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
            <Actions saving={saving} onCancel={() => setEdit(null)} label="Save changes" />
          </form>
        </Modal>
      )}
    </div>
  )
}
