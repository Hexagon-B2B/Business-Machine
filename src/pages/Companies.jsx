import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, PAGE_SIZE, lifecycleLabel, lifecycleShort } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'

const emptyForm = {
  name: '',
  legal_name: '',
  address: '',
  city: '',
  hq_location: '',
  country: 'India',
  employee_count: '',
  board_no: '',
  website: '',
  email: '',
  gst_no: '',
  industry: '',
  notes: '',
}

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
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [page, sortKey, sortDir, lifecycle])

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase.from('companies')
      .select('id, name, legal_name, website, email, industry, city, hq_location, country, gst_no, lifecycle_status, research_status, created_at', { count: 'exact' })
      .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to)
    if (search.trim()) {
      const s = search.trim()
      q = q.or(`name.ilike.%${s}%,legal_name.ilike.%${s}%,industry.ilike.%${s}%,city.ilike.%${s}%,gst_no.ilike.%${s}%,email.ilike.%${s}%`)
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

  function setF(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function createCompany(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    const gst = (form.gst_no || '').trim().toUpperCase()
    if (gst && !/^[0-9A-Z]{15}$/.test(gst)) {
      alert('GST No should be 15 characters (letters and numbers). Leave blank if unknown.')
      return
    }
    setSaving(true)
    const { data, error } = await supabase.from('companies').insert({
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      hq_location: form.hq_location.trim() || null,
      country: form.country.trim() || null,
      employee_count: form.employee_count ? Number(form.employee_count) : null,
      board_no: form.board_no.trim() || null,
      website: form.website.trim() || null,
      email: form.email.trim() || null,
      gst_no: gst || null,
      industry: form.industry.trim() || null,
      notes: form.notes.trim() || null,
      lifecycle_status: 'prospect_no_contact',
      state: 'active',
      research_status: 'NOT_RESEARCHED',
    }).select('id').single()
    setSaving(false)
    if (!error && data) {
      setShowNew(false)
      setForm({ ...emptyForm })
      go('company', data.id)
    } else alert(error?.message || 'Failed to create')
  }

  const columns = [
    { key: 'name', label: 'Short name', bold: true },
    { key: 'legal_name', label: 'Full name' },
    { key: 'city', label: 'City' },
    { key: 'industry', label: 'Industry' },
    {
      key: 'lifecycle_status', label: 'Lifecycle',
      render: r => <Badge tone={r.lifecycle_status === 'active' ? 'green' : r.lifecycle_status === 'lost' ? 'red' : 'gray'}>{lifecycleShort(r.lifecycle_status)}</Badge>
    },
    { key: 'gst_no', label: 'GST' },
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Accounts" title="Companies" subtitle="Account-level context, activity and commercial relationships">
        <button className="btn primary" onClick={() => setShowNew(true)}>+ New Company</button>
      </PageHead>

      <div className="toolbar">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search name, GST, city, email..."
          value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load() } }} />
        <button className="btn" onClick={() => { setPage(1); load() }}>Search</button>
      </div>

      <FilterTabs value={lifecycle} onChange={v => { setLifecycle(v); setPage(1) }}
        options={[{ value: 'all', label: 'All' }, ...LIFECYCLE.map(s => ({ value: s, label: lifecycleLabel(s) }))] } />

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
        <Modal title="New Company" onClose={() => setShowNew(false)} width={560}>
          <form onSubmit={createCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Short name *">
                <input className="input" required value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Trading / display name" />
              </Field>
              <Field label="Full company name">
                <input className="input" value={form.legal_name} onChange={e => setF('legal_name', e.target.value)} placeholder="Registered legal name" />
              </Field>
            </div>
            <Field label="Address">
              <textarea className="input" rows={2} value={form.address} onChange={e => setF('address', e.target.value)} placeholder="Street, area, pin" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="City">
                <input className="input" value={form.city} onChange={e => setF('city', e.target.value)} />
              </Field>
              <Field label="HQ location">
                <input className="input" value={form.hq_location} onChange={e => setF('hq_location', e.target.value)} placeholder="If different from city" />
              </Field>
              <Field label="Country">
                <input className="input" value={form.country} onChange={e => setF('country', e.target.value)} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Employee count">
                <input className="input" type="number" min="0" value={form.employee_count} onChange={e => setF('employee_count', e.target.value)} />
              </Field>
              <Field label="Board No / CIN">
                <input className="input" value={form.board_no} onChange={e => setF('board_no', e.target.value)} placeholder="CIN or registration no." />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Website">
                <input className="input" value={form.website} onChange={e => setF('website', e.target.value)} placeholder="https://" />
              </Field>
              <Field label="Company email">
                <input className="input" type="email" value={form.email} onChange={e => setF('email', e.target.value)} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="GST No">
                <input className="input" value={form.gst_no} onChange={e => setF('gst_no', e.target.value.toUpperCase())} placeholder="15-character GSTIN" maxLength={15} />
              </Field>
              <Field label="Industry">
                <input className="input" value={form.industry} onChange={e => setF('industry', e.target.value)} />
              </Field>
            </div>
            <Field label="Notes">
              <textarea className="input" rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} />
            </Field>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
              After create you land on the company page — add contacts next (Decision Maker, Procurement, etc.).
            </p>
            <Actions saving={saving} onCancel={() => setShowNew(false)} label="Create company" />
          </form>
        </Modal>
      )}
    </div>
  )
}
