import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE, LIFECYCLE, lifecycleLabel, lifecycleTone, notQualifiedReasonLabel } from '../constants'
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
  const [ownerMap, setOwnerMap] = useState({})

  useEffect(() => { load() }, [page, sortKey, sortDir, lifecycle, q, access?.isAdmin, JSON.stringify(access?.visibleIds)])

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function loadOwnerMap(rows) {
    const oids = [...new Set((rows || []).map(r => r.owner_id).filter(Boolean))]
    if (!oids.length) { setOwnerMap({}); return }
    const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', oids)
    const om = {}
    for (const p of profs || []) om[p.id] = p.full_name || p.email || '—'
    setOwnerMap(om)
  }

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
    let query = supabase.from('companies').select('*', { count: 'exact' }).neq('state', 'deleted')
    if (!access?.isAdmin && access?.visibleIds) {
      if (!access.visibleIds.length) { setItems([]); setTotal(0); setLoading(false); return }
      query = query.in('id', access.visibleIds)
    }
    if (lifecycle !== 'all') query = query.eq('lifecycle_status', lifecycle)
    if (q.trim()) {
      const t = q.trim()
      query = query.or(`name.ilike.%${t}%,legal_name.ilike.%${t}%,city.ilike.%${t}%,industry.ilike.%${t}%`)
    }
    const col = SORT_DB[sortKey] || 'name'
    query = query.order(col, { ascending: sortDir === 'asc' }).range(from, to)
    const { data, error, count } = await query
    if (error) { setFlash(error.message); setItems([]); setTotal(0) }
    else {
      const rows = data || []
      const act = await loadActivity(rows.map(r => r.id))
      for (const r of rows) r._act = act[r.id] || { tasks: 0, calls: 0, opps: 0, pipeline: 0 }
      setItems(rows); setTotal(count || 0)
      await loadOwnerMap(rows)
    }
    setLoading(false)
  }

  async function createCompany(e) {
    e.preventDefault()
    if (!(form.name || '').trim()) { setFlash('Name required'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      legal_name: form.legal_name || null,
      address: form.address || null,
      pincode: form.pincode || null,
      city: form.city || null,
      hq_location: form.hq_location || null,
      country: form.country || null,
      employee_count: form.employee_count ? Number(form.employee_count) : null,
      board_no: form.board_no || null,
      website: form.website || null,
      email: form.email || null,
      gst_no: form.gst_no || null,
      industry: form.industry || null,
      notes: form.notes || null,
      lifecycle_status: 'prospect_no_contact',
      owner_id: access?.profile?.id || null,
      state: 'active',
    }
    const { error } = await supabase.from('companies').insert(payload)
    setSaving(false)
    if (error) { setFlash('Create failed: ' + error.message); return }
    setShowCreate(false); setForm({ ...emptyForm }); setFlash('Company created — you are the Account Owner.'); load()
  }

  const columns = [
    { key: 'name', label: 'Company', bold: true, render: r => (
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}{r.employee_count ? <span style={{ fontWeight: 400, fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{Number(r.employee_count).toLocaleString()} emp</span> : null}</span>
    ) },
    { key: 'city', label: 'City', render: r => r.city || r.hq_location || '—' },
    { key: 'owner', label: 'Owner', render: r => (
      <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{r.owner_id ? (ownerMap[r.owner_id] || '…') : '—'}</span>
    ) },
    { key: 'industry', label: 'Industry', render: r => <span style={{ display: 'inline-block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.industry || ''}>{r.industry || '—'}</span> },
    { key: 'lifecycle', label: 'Lifecycle', render: r => (
      <span style={{ whiteSpace: 'nowrap' }}><Badge tone={lifecycleTone(r.lifecycle_status)}>{lifecycleLabel(r.lifecycle_status)}</Badge>{r.lifecycle_status === 'not_qualified' && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>{notQualifiedReasonLabel(r.not_qualified_reason || r.metadata?.not_qualified_reason)}</span>}</span>
    ) },
    { key: 'research', label: 'Research', render: r => <Badge tone={researchTone(r.research_status)}>{(r.research_status || 'NOT_RESEARCHED').replace(/_/g, ' ')}</Badge> },
    { key: 'tasks', label: 'Tasks', render: r => { const n = r._act?.tasks || 0; return <span style={{ fontWeight: n ? 600 : 400, color: n ? '#0f172a' : '#94a3b8' }}>{n || '—'}</span> } },
    { key: 'calls', label: 'Calls', render: r => { const n = r._act?.calls || 0; return <span style={{ fontWeight: n ? 600 : 400, color: n ? '#0f172a' : '#94a3b8' }}>{n || '—'}</span> } },
    { key: 'opps', label: 'Opps', render: r => { const n = r._act?.opps || 0; return <span style={{ fontWeight: n ? 600 : 400, color: n ? '#0f172a' : '#94a3b8' }}>{n || '—'}</span> } },
    { key: 'pipeline', label: 'Pipeline', render: r => { const n = r._act?.pipeline || 0; return <span style={{ fontWeight: n ? 600 : 400, color: n ? '#065f46' : '#94a3b8' }}>{n ? formatInr(n) : '—'}</span> } },
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead
        eyebrow="Accounts"
        title="Companies"
        subtitle="Master account list. Click a row to open the company workspace."
        actions={<button type="button" className="btn primary" onClick={() => setShowCreate(true)}>+ New company</button>}
      />
      {flash && <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>}
      <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search name, city, industry…" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
      </div>
      <FilterTabs value={lifecycle} onChange={v => { setLifecycle(v); setPage(1) }} options={[{ value: 'all', label: 'All' }, ...LIFECYCLE.map(s => ({ value: s, label: lifecycleLabel(s) }))]} />
      {loading ? <div className="loading">Loading…</div> : (
        <DataTable
          columns={columns}
          rows={items}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={k => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc') } }}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          onRowClick={r => go('company', r.id)}
          empty="No companies match"
        />
      )}
      {showCreate && (
        <Modal title="New company" onClose={() => setShowCreate(false)} width={640}>
          <form onSubmit={createCompany}>
            <Field label="Short name *"><input className="input" required value={form.name} onChange={e => setF('name', e.target.value)} /></Field>
            <Field label="Legal name"><input className="input" value={form.legal_name} onChange={e => setF('legal_name', e.target.value)} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="City"><input className="input" value={form.city} onChange={e => setF('city', e.target.value)} /></Field>
              <Field label="Industry"><input className="input" value={form.industry} onChange={e => setF('industry', e.target.value)} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create company" />
          </form>
        </Modal>
      )}
    </div>
  )
}
