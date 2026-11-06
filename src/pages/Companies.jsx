import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE, LIFECYCLE, lifecycleLabel, notQualifiedReasonLabel } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'

const emptyForm = {
  name: '', legal_name: '', address: '', pincode: '', city: '', hq_location: '',
  country: '', employee_count: '', board_no: '', website: '', email: '', gst_no: '', industry: '', notes: '',
}

function formatInr(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(v % 10000000 === 0 ? 0 : 1)}Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`
  return `₹${Math.round(v).toLocaleString('en-IN')}`
}

function researchTone(s) {
  if (s === 'RESEARCHED') return 'green'
  if (s === 'IN_PROGRESS') return 'yellow'
  if (s === 'NEEDS_UPDATE') return 'blue'
  return 'gray'
}

export default function Companies({ go, access }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [lifecycle, setLifecycle] = useState('all')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')

  useEffect(() => { load() }, [page, sortKey, sortDir, lifecycle, q, access?.isAdmin, JSON.stringify(access?.visibleIds)])

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function loadActivity(companyIds, { all = false } = {}) {
    const map = {}
    const ensure = (id) => {
      if (!id) return null
      if (!map[id]) map[id] = { tasks: 0, calls: 0, opps: 0, pipeline: 0 }
      return map[id]
    }
    if (!all) {
      if (!companyIds?.length) return {}
      for (const id of companyIds) ensure(id)
    }
    let tasksQ = supabase.from('tasks').select('company_id').neq('state', 'deleted').in('status', ['open', 'in_progress']).limit(10000)
    let callsQ = supabase.from('meetings_calls').select('company_id').neq('state', 'deleted').limit(10000)
    let oppsQ = supabase.from('opportunities').select('company_id, stage, deal_size').neq('state', 'deleted').limit(10000)
    if (!all && companyIds?.length) {
      tasksQ = tasksQ.in('company_id', companyIds)
      callsQ = callsQ.in('company_id', companyIds)
      oppsQ = oppsQ.in('company_id', companyIds)
    }
    const [tasksRes, callsRes, oppsRes] = await Promise.all([
      tasksQ.then(r => r).catch(err => ({ data: null, error: err })),
      callsQ.then(r => r).catch(err => ({ data: null, error: err })),
      oppsQ.then(r => r).catch(err => ({ data: null, error: err })),
    ])
    for (const t of tasksRes.data || []) {
      const row = all ? ensure(t.company_id) : map[t.company_id]
      if (row) row.tasks += 1
    }
    for (const row of callsRes.data || []) {
      const m = all ? ensure(row.company_id) : map[row.company_id]
      if (m) m.calls += 1
    }
    for (const o of oppsRes.data || []) {
      if (o.stage === 'won' || o.stage === 'lost') continue
      const m = all ? ensure(o.company_id) : map[o.company_id]
      if (!m) continue
      m.opps += 1
      if (o.deal_size != null && !Number.isNaN(Number(o.deal_size))) m.pipeline += Number(o.deal_size)
    }
    return map
  }

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const SORT_DB = { name: 'name', city: 'city', industry: 'industry', lifecycle: 'lifecycle_status', research: 'research_status' }
    const ACTIVITY_SORT = ['tasks', 'calls', 'opps', 'pipeline']
    const isActivitySort = ACTIVITY_SORT.includes(sortKey)
    const orderCol = SORT_DB[sortKey] || 'name'
    const selectCols = 'id, name, legal_name, website, email, industry, city, hq_location, country, gst_no, lifecycle_status, research_status, board_no, pincode, employee_count, not_qualified_reason, metadata, owner_id'
    const selectColsSafe = 'id, name, legal_name, website, email, industry, city, hq_location, country, gst_no, lifecycle_status, research_status, board_no, pincode, employee_count, metadata'

    function applyFilters(query) {
      query = query.neq('state', 'deleted')
      if (access && !access.isAdmin && Array.isArray(access.visibleIds)) {
        if (access.visibleIds.length === 0) query = query.eq('id', '00000000-0000-0000-0000-000000000000')
        else query = query.in('id', access.visibleIds)
      }
      if (lifecycle !== 'all') query = query.eq('lifecycle_status', lifecycle)
      if (q.trim()) {
        const s = q.trim().replace(/%/g, '')
        query = query.or(`name.ilike.%${s}%,legal_name.ilike.%${s}%,city.ilike.%${s}%,industry.ilike.%${s}%`)
      }
      return query
    }

    if (isActivitySort) {
      async function fetchAll(cols) {
        return await applyFilters(supabase.from('companies').select(cols)).order('name', { ascending: true }).limit(5000)
      }
      let { data, error } = await fetchAll(selectCols)
      if (error && /owner_id|not_qualified_reason|column/i.test(error.message || '')) {
        ;({ data, error } = await fetchAll(selectColsSafe))
      }
      if (error) console.error(error)
      const rows = data || []
      const activity = await loadActivity(null, { all: true })
      const withAct = rows.map(r => ({ ...r, _act: activity[r.id] || { tasks: 0, calls: 0, opps: 0, pipeline: 0 } }))
      const dir = sortDir === 'asc' ? 1 : -1
      withAct.sort((a, b) => {
        const av = Number(a._act?.[sortKey] || 0)
        const bv = Number(b._act?.[sortKey] || 0)
        if (av !== bv) return (av - bv) * dir
        return String(a.name || '').localeCompare(String(b.name || ''))
      })
      setTotal(withAct.length)
      setItems(withAct.slice(from, to + 1))
      setLoading(false)
      return
    }

    function buildQuery(cols) {
      return applyFilters(supabase.from('companies').select(cols, { count: 'exact' }))
        .order(orderCol, { ascending: sortDir === 'asc', nullsFirst: false })
        .range(from, to)
    }

    let { data, count, error } = await buildQuery(selectCols)
    if (error && /owner_id|not_qualified_reason|column/i.test(error.message || '')) {
      ;({ data, count, error } = await buildQuery(selectColsSafe))
    }
    if (error) console.error(error)
    const rows = data || []
    const activity = await loadActivity(rows.map(r => r.id))
    setItems(rows.map(r => ({ ...r, _act: activity[r.id] || { tasks: 0, calls: 0, opps: 0, pipeline: 0 } })))
    setTotal(count || 0)
    setLoading(false)
  }

  function onSort(key) {
    const sortable = ['name', 'city', 'industry', 'lifecycle', 'research', 'tasks', 'calls', 'opps', 'pipeline']
    if (!sortable.includes(key)) return
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(['tasks', 'calls', 'opps', 'pipeline'].includes(key) ? 'desc' : 'asc') }
    setPage(1)
  }

  async function createCompany(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    const gst = (form.gst_no || '').trim().toUpperCase()
    if (gst && !/^[0-9A-Z]{15}$/.test(gst)) { setFlash('GST No should be 15 characters. Leave blank if unknown.'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(), legal_name: form.legal_name.trim() || null, address: form.address.trim() || null,
      city: form.city.trim() || null, pincode: form.pincode.trim() || null, hq_location: form.hq_location.trim() || null,
      country: form.country.trim() || null, employee_count: form.employee_count ? Number(form.employee_count) : null,
      board_no: form.board_no.trim() || null, website: form.website.trim() || null, email: form.email.trim() || null,
      gst_no: gst || null, industry: form.industry.trim() || null, notes: form.notes.trim() || null,
      state: 'active', lifecycle_status: 'prospect_no_contact', research_status: 'NOT_RESEARCHED', metadata: {},
      owner_id: access?.userId || null,
    }
    let { error } = await supabase.from('companies').insert(payload)
    if (error && /owner_id|column/i.test(error.message || '')) {
      delete payload.owner_id
      ;({ error } = await supabase.from('companies').insert(payload))
      if (!error) setFlash('Company created. Run SQL 015 so owner is stored on new accounts.')
    }
    if (error && /pincode|column/i.test(error.message || '')) {
      delete payload.pincode
      ;({ error } = await supabase.from('companies').insert(payload))
    }
    setSaving(false)
    if (error) { setFlash('Create failed: ' + error.message); return }
    setShowCreate(false); setForm({ ...emptyForm }); setFlash('Company created — you are the Account Owner.'); load()
  }

  const columns = [
    { key: 'name', label: 'Company', bold: true, render: r => (
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}{r.employee_count ? <span style={{ fontWeight: 400, fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{Number(r.employee_count).toLocaleString()} emp</span> : null}</span>
    ) },
    { key: 'city', label: 'City', render: r => r.city || r.hq_location || '—' },
    { key: 'industry', label: 'Industry', render: r => <span style={{ display: 'inline-block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.industry || ''}>{r.industry || '—'}</span> },
    { key: 'lifecycle', label: 'Lifecycle', render: r => (
      <span style={{ whiteSpace: 'nowrap' }}><Badge>{lifecycleLabel(r.lifecycle_status)}</Badge>{r.lifecycle_status === 'not_qualified' && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>{notQualifiedReasonLabel(r.not_qualified_reason || r.metadata?.not_qualified_reason)}</span>}</span>
    ) },
    { key: 'research', label: 'Research', render: r => <Badge tone={researchTone(r.research_status)}>{(r.research_status || 'NOT_RESEARCHED').replace(/_/g, ' ')}</Badge> },
    { key: 'tasks', label: 'Tasks', render: r => { const n = r._act?.tasks || 0; return <span style={{ fontWeight: n ? 600 : 400, color: n ? '#0f172a' : '#94a3b8' }}>{n || '—'}</span> } },
    { key: 'calls', label: 'Calls', render: r => { const n = r._act?.calls || 0; return <span style={{ fontWeight: n ? 600 : 400, color: n ? '#0f172a' : '#94a3b8' }}>{n || '—'}</span> } },
    { key: 'opps', label: 'Opps', render: r => { const n = r._act?.opps || 0; return <span style={{ fontWeight: n ? 600 : 400, color: n ? '#0f172a' : '#94a3b8' }}>{n || '—'}</span> } },
    { key: 'pipeline', label: 'Pipeline', render: r => { const n = r._act?.pipeline || 0; return <span style={{ fontWeight: n ? 600 : 400, color: n ? '#065f46' : '#94a3b8', whiteSpace: 'nowrap' }}>{n ? formatInr(n) : '—'}</span> } },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <PageHead eyebrow="Account" title="Companies" subtitle="Company-centric workspace. Creator becomes Account Owner. Only the owner can add tasks, meetings and opportunities.">
        <button type="button" className="btn primary" onClick={() => { setForm({ ...emptyForm }); setShowCreate(true) }}>+ New company</button>
      </PageHead>
      {flash && <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search name / city / industry…" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
        <span style={{ fontSize: 12, color: '#64748b' }}>{total.toLocaleString()} companies</span>
      </div>
      <FilterTabs value={lifecycle} onChange={v => { setLifecycle(v); setPage(1) }} options={[{ value: 'all', label: 'All' }, ...LIFECYCLE.map(s => ({ value: s, label: lifecycleLabel(s) }))]} />
      {loading ? <div className="loading">Loading…</div> : (
        <DataTable columns={columns} rows={items} sortKey={sortKey} sortDir={sortDir} onSort={onSort} page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} onRowClick={r => go('company', r.id)} empty="No companies match." />
      )}
      {showCreate && (
        <Modal title="New company" onClose={() => setShowCreate(false)} width={560}>
          <form onSubmit={createCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Short name *"><input className="input" required value={form.name} onChange={e => setF('name', e.target.value)} /></Field>
              <Field label="Full / legal name"><input className="input" value={form.legal_name} onChange={e => setF('legal_name', e.target.value)} /></Field>
            </div>
            <Field label="Address"><textarea className="input" rows={2} value={form.address} onChange={e => setF('address', e.target.value)} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="City"><input className="input" value={form.city} onChange={e => setF('city', e.target.value)} /></Field>
              <Field label="Pincode"><input className="input" value={form.pincode} onChange={e => setF('pincode', e.target.value)} /></Field>
              <Field label="Country"><input className="input" value={form.country} onChange={e => setF('country', e.target.value)} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="HQ location"><input className="input" value={form.hq_location} onChange={e => setF('hq_location', e.target.value)} /></Field>
              <Field label="Board Tele No"><input className="input" value={form.board_no} onChange={e => setF('board_no', e.target.value)} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Employees"><input className="input" type="number" min="0" value={form.employee_count} onChange={e => setF('employee_count', e.target.value)} /></Field>
              <Field label="GST"><input className="input" value={form.gst_no} onChange={e => setF('gst_no', e.target.value.toUpperCase())} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Website"><input className="input" value={form.website} onChange={e => setF('website', e.target.value)} /></Field>
              <Field label="Email"><input className="input" type="email" value={form.email} onChange={e => setF('email', e.target.value)} /></Field>
            </div>
            <Field label="Industry"><input className="input" value={form.industry} onChange={e => setF('industry', e.target.value)} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create company" />
          </form>
        </Modal>
      )}
    </div>
  )
}
