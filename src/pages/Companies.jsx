import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE, LIFECYCLE, lifecycleLabel } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'

const emptyForm = {
  name: '',
  legal_name: '',
  address: '',
  pincode: '',
  city: '',
  hq_location: '',
  country: '',
  employee_count: '',
  board_no: '',
  website: '',
  email: '',
  gst_no: '',
  industry: '',
  notes: '',
}

export default function Companies({ go }) {
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

  useEffect(() => { load() }, [page, sortKey, sortDir, lifecycle, q])

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let query = supabase.from('companies')
      .select('id, name, legal_name, website, email, industry, city, hq_location, country, gst_no, lifecycle_status, research_status, board_no, pincode, employee_count', { count: 'exact' })
      .neq('state', 'deleted')
      .order(sortKey, { ascending: sortDir === 'asc' })
      .range(from, to)
    if (lifecycle !== 'all') query = query.eq('lifecycle_status', lifecycle)
    if (q.trim()) query = query.or(`name.ilike.%${q.trim()}%,legal_name.ilike.%${q.trim()}%,city.ilike.%${q.trim()}%`)
    const { data, count, error } = await query
    if (error) console.error(error)
    setItems(data || [])
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
    const gst = (form.gst_no || '').trim().toUpperCase()
    if (gst && !/^[0-9A-Z]{15}$/.test(gst)) {
      setFlash('GST No should be 15 characters. Leave blank if unknown.')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      pincode: form.pincode.trim() || null,
      hq_location: form.hq_location.trim() || null,
      country: form.country.trim() || null,
      employee_count: form.employee_count ? Number(form.employee_count) : null,
      board_no: form.board_no.trim() || null,
      website: form.website.trim() || null,
      email: form.email.trim() || null,
      gst_no: gst || null,
      industry: form.industry.trim() || null,
      notes: form.notes.trim() || null,
      state: 'active',
      lifecycle_status: 'prospect_no_contact',
      research_status: 'NOT_RESEARCHED',
      metadata: {},
    }
    let { error } = await supabase.from('companies').insert(payload)
    if (error && /pincode|column/i.test(error.message)) {
      delete payload.pincode
      ;({ error } = await supabase.from('companies').insert(payload))
    }
    setSaving(false)
    if (error) { setFlash('Create failed: ' + error.message); return }
    setShowCreate(false)
    setForm({ ...emptyForm })
    setFlash('Company created.')
    load()
  }

  const columns = [
    { key: 'name', label: 'Company', bold: true },
    { key: 'city', label: 'City', render: r => r.city || r.hq_location || '—' },
    { key: 'industry', label: 'Industry', render: r => r.industry || '—' },
    { key: 'lifecycle', label: 'Lifecycle', render: r => <Badge>{lifecycleLabel(r.lifecycle_status)}</Badge> },
    { key: 'gst', label: 'GST', render: r => r.gst_no || '—' },
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Account" title="Companies" subtitle="Company-centric workspace — open a company to act.">
        <button type="button" className="btn primary" onClick={() => { setForm({ ...emptyForm }); setShowCreate(true) }}>+ New company</button>
      </PageHead>

      {flash && (
        <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search name / city…" value={q}
          onChange={e => { setQ(e.target.value); setPage(1) }} />
      </div>

      <FilterTabs value={lifecycle} onChange={v => { setLifecycle(v); setPage(1) }}
        options={[{ value: 'all', label: 'All' }, ...LIFECYCLE.map(s => ({ value: s, label: lifecycleLabel(s) }))]} />

      {loading ? <div className="loading">Loading…</div> : (
        <DataTable columns={columns} rows={items} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage}
          onRowClick={r => go('company', r.id)}
          empty="No companies match." />
      )}

      {showCreate && (
        <Modal title="New company" onClose={() => setShowCreate(false)} width={560}>
          <form onSubmit={createCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Short name *">
                <input className="input" required value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Trading name" />
              </Field>
              <Field label="Full / legal name">
                <input className="input" value={form.legal_name} onChange={e => setF('legal_name', e.target.value)} placeholder="Registered name" />
              </Field>
            </div>
            <Field label="Address">
              <textarea className="input" rows={2} value={form.address} onChange={e => setF('address', e.target.value)} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="City">
                <input className="input" value={form.city} onChange={e => setF('city', e.target.value)} />
              </Field>
              <Field label="Pincode">
                <input className="input" value={form.pincode} onChange={e => setF('pincode', e.target.value)} placeholder="e.g. 560001" />
              </Field>
              <Field label="Country">
                <input className="input" value={form.country} onChange={e => setF('country', e.target.value)} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="HQ location">
                <input className="input" value={form.hq_location} onChange={e => setF('hq_location', e.target.value)} placeholder="If different from city" />
              </Field>
              <Field label="Board / CIN">
                <input className="input" value={form.board_no} onChange={e => setF('board_no', e.target.value)} placeholder="CIN / Board reg. no." />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Employees">
                <input className="input" type="number" min="0" value={form.employee_count} onChange={e => setF('employee_count', e.target.value)} />
              </Field>
              <Field label="GST">
                <input className="input" value={form.gst_no} onChange={e => setF('gst_no', e.target.value.toUpperCase())} placeholder="15-char GSTIN" />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Website">
                <input className="input" value={form.website} onChange={e => setF('website', e.target.value)} placeholder="https://" />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={form.email} onChange={e => setF('email', e.target.value)} />
              </Field>
            </div>
            <Field label="Industry">
              <input className="input" value={form.industry} onChange={e => setF('industry', e.target.value)} />
            </Field>
            <Field label="Notes">
              <textarea className="input" rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} />
            </Field>
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create company" />
          </form>
        </Modal>
      )}
    </div>
  )
}
