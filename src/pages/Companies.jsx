import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, PAGE_SIZE } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'

export default function Companies({ go }) {
  const [companies, setCompanies] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lifecycle, setLifecycle] = useState('all')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', website: '', industry: '', city: '', country: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [page, sortKey, sortDir, lifecycle])

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase.from('companies')
      .select('id, name, website, industry, city, country, lifecycle_status, research_status, created_at', { count: 'exact' })
      .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to)
    if (search.trim()) {
      const s = search.trim()
      q = q.or(`name.ilike.%${s}%,industry.ilike.%${s}%,city.ilike.%${s}%,country.ilike.%${s}%`)
    }
    if (lifecycle !== 'all') q = q.eq('lifecycle_status', lifecycle)
    const { data, count, error } = await q
    if (error) console.error(error)
    setCompanies(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  async function createCompany(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('companies').insert({
      name: form.name.trim(),
      website: form.website || null,
      industry: form.industry || null,
      city: form.city || null,
      country: form.country || null,
      notes: form.notes || null,
      lifecycle_status: 'prospect',
      state: 'active',
      research_status: 'NOT_RESEARCHED'
    }).select('id').single()
    setSaving(false)
    if (!error && data) {
      setShowNew(false)
      setForm({ name: '', website: '', industry: '', city: '', country: '', notes: '' })
      go('company', data.id)
    } else alert(error?.message || 'Failed to create')
  }

  const columns = [
    { key: 'name', label: 'Company', bold: true },
    { key: 'industry', label: 'Industry' },
    { key: 'city', label: 'City' },
    { key: 'country', label: 'Country' },
    { key: 'lifecycle_status', label: 'Lifecycle', render: r => <Badge tone="blue">{r.lifecycle_status}</Badge> },
    { key: 'research_status', label: 'Research', render: r => <Badge>{r.research_status}</Badge> },
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Relationships" title="Companies" subtitle="Account-level context, activity and commercial relationships">
        <button className="btn primary" onClick={() => setShowNew(true)}>+ New Company</button>
      </PageHead>

      <div className="toolbar">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search name, industry, city..."
          value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load() } }} />
        <button className="btn" onClick={() => { setPage(1); load() }}>Search</button>
      </div>

      <FilterTabs value={lifecycle} onChange={v => { setLifecycle(v); setPage(1) }}
        options={[{ value: 'all', label: 'All' }, ...LIFECYCLE.map(s => ({ value: s, label: s }))] } />

      {loading ? <div className="loading">Loading companies...</div> : (
        <DataTable
          columns={columns} rows={companies}
          sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          onRowClick={r => go('company', r.id)}
          page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage}
          empty="No companies found."
        />
      )}

      {showNew && (
        <Modal title="New Company" onClose={() => setShowNew(false)}>
          <form onSubmit={createCompany}>
            <Field label="Company Name *"><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></Field>
            <Field label="Website"><input className="input" value={form.website} onChange={e => setForm({...form, website: e.target.value})} placeholder="https://" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Industry"><input className="input" value={form.industry} onChange={e => setForm({...form, industry: e.target.value})} /></Field>
              <Field label="City"><input className="input" value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></Field>
            </div>
            <Field label="Country"><input className="input" value={form.country} onChange={e => setForm({...form, country: e.target.value})} /></Field>
            <Field label="Notes"><textarea className="input" rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></Field>
            <Actions saving={saving} onCancel={() => setShowNew(false)} label="Create Company" />
          </form>
        </Modal>
      )}
    </div>
  )
}
