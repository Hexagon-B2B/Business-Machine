import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE } from '../constants'
import { PageHead, FilterTabs, DataTable, Badge } from '../ui'

export default function Tasks({ go }) {
  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [sortKey, setSortKey] = useState('due_at')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  useEffect(() => { load() }, [filter, page, sortKey, sortDir])

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase.from('tasks')
      .select('id, title, description, priority, status, due_at, company_id, companies(name)', { count: 'exact' })
      .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to)
    if (filter === 'open') q = q.in('status', ['open', 'in_progress'])
    else if (filter === 'done') q = q.eq('status', 'done')
    const { data, count } = await q
    setTasks(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  async function markDone(id) {
    await supabase.from('tasks').update({ status: 'done' }).eq('id', id)
    load()
  }

  const columns = [
    { key: 'title', label: 'Title', bold: true },
    { key: 'company', label: 'Company', render: t => t.companies?.name ? (
      <button style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }} onClick={e => { e.stopPropagation(); go('company', t.company_id) }}>{t.companies.name}</button>
    ) : '—' },
    { key: 'priority', label: 'Priority', render: t => <Badge tone={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}>{t.priority}</Badge> },
    { key: 'status', label: 'Status', render: t => <Badge tone="blue">{t.status}</Badge> },
    { key: 'due_at', label: 'Due', render: t => t.due_at ? new Date(t.due_at).toLocaleDateString() : '—' },
    { key: 'action', label: '', render: t => t.status !== 'done' ? <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); markDone(t.id) }}>Done</button> : null },
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Work" title="Tasks" subtitle="Create tasks from a Company. Every task should answer What, Why, Who, When.">
        <button className="btn primary" onClick={() => go('companies')}>Go to Companies →</button>
      </PageHead>
      <FilterTabs value={filter} onChange={v => { setFilter(v); setPage(1) }}
        options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]} />
      {loading ? <div className="loading">Loading...</div> : (
        <DataTable columns={columns} rows={tasks} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage}
          empty="No tasks. Open a Company and create a task from there." />
      )}
    </div>
  )
}
