import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE, LIFECYCLE, ROLES, lifecycleLabel } from '../constants'
import { PageHead, FilterTabs, DataTable, Badge, Modal, Field, Actions, CompanySearchSelect } from '../ui'

function phoneLine(c) {
  return [c.phone, c.phone_mobile_2, c.phone_landline].filter(Boolean).join(' / ')
}

function csvEscape(v) {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map(r => headers.map(h => csvEscape(r[h])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Contacts({ go }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [lifecycle, setLifecycle] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('full_name')
  const [sortDir, setSortDir] = useState('asc')
  const [exportMode, setExportMode] = useState('both')
  const [flash, setFlash] = useState('')
  const [moveContact, setMoveContact] = useState(null)
  const [moveForm, setMoveForm] = useState({ mode: 'left', new_company_id: '', job_title: '', role: '', notes: '', left_reason: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [page, sortKey, sortDir, lifecycle, q, statusFilter])

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const companySelect = lifecycle !== 'all'
      ? 'companies!inner(id, name, lifecycle_status, city)'
      : 'companies(id, name, lifecycle_status, city)'
    let query = supabase
      .from('contacts')
      .select(`id, full_name, job_title, role, email, phone, phone_mobile_2, phone_landline, phone_extension, company_id, contact_status, metadata, ${companySelect}`, { count: 'exact' })
      .neq('state', 'deleted')

    if (statusFilter === 'active') {
      query = query.or('contact_status.is.null,contact_status.eq.active')
    } else if (statusFilter === 'left') {
      query = query.eq('contact_status', 'left')
    }

    if (lifecycle !== 'all') {
      query = query.eq('companies.lifecycle_status', lifecycle)
    }

    const SORT_MAP = {
      full_name: { col: 'full_name' },
      job_title: { col: 'job_title' },
      role: { col: 'role' },
      email: { col: 'email' },
      phone: { col: 'phone' },
      company: { col: 'name', foreignTable: 'companies' },
    }
    const sortSpec = SORT_MAP[sortKey] || SORT_MAP.full_name
    if (sortSpec.foreignTable) {
      query = query.order(sortSpec.col, { ascending: sortDir === 'asc', nullsFirst: false, foreignTable: sortSpec.foreignTable })
    } else {
      query = query.order(sortSpec.col, { ascending: sortDir === 'asc', nullsFirst: false })
    }

    if (q.trim()) {
      const s = q.trim().replace(/%/g, '')
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,job_title.ilike.%${s}%`)
    }

    query = query.range(from, to)
    const { data, count, error } = await query
    if (error) {
      console.error(error)
      let q2 = supabase
        .from('contacts')
        .select('id, full_name, job_title, role, email, phone, phone_mobile_2, phone_landline, phone_extension, company_id, contact_status, metadata, companies(id, name, lifecycle_status, city)', { count: 'exact' })
        .neq('state', 'deleted')
        .order('full_name', { ascending: true })
        .range(from, to)
      if (q.trim()) {
        const s = q.trim().replace(/%/g, '')
        q2 = q2.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,job_title.ilike.%${s}%`)
      }
      const res2 = await q2
      let rows = res2.data || []
      if (lifecycle !== 'all') {
        rows = rows.filter(r => r.companies?.lifecycle_status === lifecycle)
      }
      if (statusFilter === 'active') {
        rows = rows.filter(r => (r.contact_status || 'active') !== 'left')
      } else if (statusFilter === 'left') {
        rows = rows.filter(r => r.contact_status === 'left')
      }
      setItems(rows)
      setTotal(res2.count || rows.length)
      setLoading(false)
      return
    }

    let rows = data || []
    if (lifecycle !== 'all') {
      rows = rows.filter(r => r.companies?.lifecycle_status === lifecycle)
    }
    setItems(rows)
    setTotal(count || 0)
    setLoading(false)
  }

  function onSort(key) {
    const sortable = ['full_name', 'job_title', 'role', 'email', 'phone', 'company']
    if (!sortable.includes(key)) return
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  function openMove(ct) {
    setMoveContact(ct)
    setMoveForm({
      mode: ct.contact_status === 'left' ? 'transfer' : 'left',
      new_company_id: '',
      job_title: ct.job_title || '',
      role: ct.role || '',
      notes: '',
      left_reason: '',
    })
  }

  async function saveMove(e) {
    e.preventDefault()
    if (!moveContact) return
    setSaving(true)
    const prevMeta = (moveContact.metadata && typeof moveContact.metadata === 'object') ? moveContact.metadata : {}
    const now = new Date().toISOString()
    const fromCompanyId = moveContact.company_id
    const fromCompanyName = moveContact.companies?.name || null

    if (moveForm.mode === 'left') {
      const metadata = {
        ...prevMeta,
        left_at: now,
        left_reason: (moveForm.left_reason || '').trim() || null,
        left_notes: (moveForm.notes || '').trim() || null,
        left_from_company_id: fromCompanyId,
        left_from_company_name: fromCompanyName,
      }
      let { error } = await supabase.from('contacts').update({ contact_status: 'left', metadata }).eq('id', moveContact.id)
      if (error && /metadata|column/i.test(error.message || '')) {
        ;({ error } = await supabase.from('contacts').update({ contact_status: 'left' }).eq('id', moveContact.id))
      }
      setSaving(false)
      if (error) { alert(error.message); return }
      setMoveContact(null)
      setFlash('Contact marked as left.')
      setTimeout(() => setFlash(''), 3500)
      await load()
      return
    }

    if (!moveForm.new_company_id) {
      setSaving(false)
      alert('Select the new company.')
      return
    }
    if (moveForm.new_company_id === fromCompanyId) {
      setSaving(false)
      alert('Pick a different company than the current one.')
      return
    }
    const metadata = {
      ...prevMeta,
      transferred_at: now,
      transfer_notes: (moveForm.notes || '').trim() || null,
      previous_company_id: fromCompanyId,
      previous_company_name: fromCompanyName,
      previous_job_title: moveContact.job_title || null,
      previous_role: moveContact.role || null,
    }
    const payload = {
      company_id: moveForm.new_company_id,
      contact_status: 'active',
      job_title: (moveForm.job_title || '').trim() || null,
      role: moveForm.role || null,
      metadata,
    }
    let { error } = await supabase.from('contacts').update(payload).eq('id', moveContact.id)
    if (error && /metadata|column/i.test(error.message || '')) {
      delete payload.metadata
      ;({ error } = await supabase.from('contacts').update(payload).eq('id', moveContact.id))
    }
    setSaving(false)
    if (error) { alert(error.message); return }
    setMoveContact(null)
    setFlash('Contact transferred to the new company.')
    setTimeout(() => setFlash(''), 3500)
    await load()
  }

  async function exportContacts() {
    setFlash('Building export…')
    const companySelect = lifecycle !== 'all'
      ? 'companies!inner(name, lifecycle_status, city)'
      : 'companies(name, lifecycle_status, city)'
    let query = supabase
      .from('contacts')
      .select(`full_name, job_title, role, email, phone, phone_mobile_2, phone_landline, phone_extension, contact_status, ${companySelect}`)
      .neq('state', 'deleted')
      .order('full_name')
      .limit(10000)

    if (statusFilter === 'active') {
      query = query.or('contact_status.is.null,contact_status.eq.active')
    } else if (statusFilter === 'left') {
      query = query.eq('contact_status', 'left')
    }
    if (lifecycle !== 'all') {
      query = query.eq('companies.lifecycle_status', lifecycle)
    }
    if (q.trim()) {
      const s = q.trim().replace(/%/g, '')
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,job_title.ilike.%${s}%`)
    }

    let { data, error } = await query
    if (error) {
      const res = await supabase
        .from('contacts')
        .select('full_name, job_title, role, email, phone, phone_mobile_2, phone_landline, phone_extension, contact_status, companies(name, lifecycle_status, city)')
        .neq('state', 'deleted')
        .order('full_name')
        .limit(10000)
      data = res.data || []
      error = res.error
      if (error) {
        setFlash('Export failed: ' + error.message)
        return
      }
    }

    let rows = data || []
    if (lifecycle !== 'all') {
      rows = rows.filter(r => r.companies?.lifecycle_status === lifecycle)
    }
    if (statusFilter === 'active') {
      rows = rows.filter(r => (r.contact_status || 'active') !== 'left')
    } else if (statusFilter === 'left') {
      rows = rows.filter(r => r.contact_status === 'left')
    }

    if (exportMode === 'phone') {
      rows = rows.filter(r => r.phone || r.phone_mobile_2 || r.phone_landline)
    } else if (exportMode === 'email') {
      rows = rows.filter(r => r.email)
    } else {
      rows = rows.filter(r => r.email || r.phone || r.phone_mobile_2 || r.phone_landline)
    }

    const headers = ['Company', 'Lifecycle', 'Status', 'Name', 'Job title', 'Role']
    if (exportMode === 'email' || exportMode === 'both') headers.push('Email')
    if (exportMode === 'phone' || exportMode === 'both') {
      headers.push('Mobile', 'Mobile 2', 'Landline', 'Extension')
    }
    headers.push('City')

    const mapped = rows.map(r => {
      const o = {
        Company: r.companies?.name || '',
        Lifecycle: lifecycleLabel(r.companies?.lifecycle_status),
        Status: (r.contact_status || 'active') === 'left' ? 'Left' : 'Active',
        Name: r.full_name || '',
        'Job title': r.job_title || '',
        Role: r.role || '',
        City: r.companies?.city || '',
      }
      if (exportMode === 'email' || exportMode === 'both') o.Email = r.email || ''
      if (exportMode === 'phone' || exportMode === 'both') {
        o.Mobile = r.phone || ''
        o['Mobile 2'] = r.phone_mobile_2 || ''
        o.Landline = r.phone_landline || ''
        o.Extension = r.phone_extension || ''
      }
      return o
    })

    const stage = lifecycle === 'all' ? 'all' : lifecycle
    const st = statusFilter === 'all' ? 'allstatus' : statusFilter
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`contacts_${stage}_${st}_${exportMode}_${stamp}.csv`, headers, mapped)
    setFlash(`Exported ${mapped.length} contact(s) (${exportMode}).`)
    setTimeout(() => setFlash(''), 4000)
  }

  const columns = useMemo(() => [
    {
      key: 'full_name',
      label: 'Name',
      bold: true,
      render: r => (
        <span>
          {r.full_name || '—'}
          {(r.contact_status || 'active') === 'left' && (
            <span style={{ marginLeft: 6 }}><Badge tone="gray">Left</Badge></span>
          )}
        </span>
      ),
    },
    {
      key: 'job_title',
      label: 'Job title',
      render: r => r.job_title || '—',
    },
    {
      key: 'role',
      label: 'Role',
      render: r => r.role || '—',
    },
    {
      key: 'company',
      label: 'Company',
      render: r => r.companies?.name ? (
        <button
          type="button"
          style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0, textAlign: 'left' }}
          onClick={e => { e.stopPropagation(); go('company', r.company_id) }}
        >
          {r.companies.name}
        </button>
      ) : '—',
    },
    {
      key: 'lifecycle',
      label: 'Lifecycle',
      render: r => r.companies?.lifecycle_status
        ? <Badge>{lifecycleLabel(r.companies.lifecycle_status)}</Badge>
        : '—',
    },
    {
      key: 'email',
      label: 'Email',
      render: r => r.email || '—',
    },
    {
      key: 'phone',
      label: 'Phone',
      render: r => phoneLine(r) || '—',
    },
    {
      key: 'actions',
      label: '',
      render: r => (
        <button
          type="button"
          className="btn"
          style={{ fontSize: 11, padding: '2px 8px', minHeight: 0 }}
          onClick={e => { e.stopPropagation(); openMove(r) }}
        >
          Move
        </button>
      ),
    },
  ], [go])

  return (
    <div style={{ padding: '20px 24px' }}>
      <PageHead
        eyebrow="People"
        title="Contacts"
        subtitle="All contacts across companies. Filter by status or company lifecycle, then export. Use Move when someone leaves or changes employer."
      >
        <button type="button" className="btn" onClick={() => go('companies')}>Companies</button>
        <button type="button" className="btn primary" onClick={exportContacts}>Export CSV</button>
      </PageHead>

      {flash && (
        <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search name / email / phone / title…"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1) }}
        />
        <label style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
          Export fields
          <select
            className="input"
            style={{ width: 'auto', minHeight: 36, padding: '6px 10px', fontSize: 13 }}
            value={exportMode}
            onChange={e => setExportMode(e.target.value)}
          >
            <option value="both">Phone + Email</option>
            <option value="phone">Phone only</option>
            <option value="email">Email only</option>
          </select>
        </label>
        <span style={{ fontSize: 12, color: '#64748b' }}>{total.toLocaleString()} contacts</span>
      </div>

      <FilterTabs
        value={statusFilter}
        onChange={v => { setStatusFilter(v); setPage(1) }}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'left', label: 'Left / former' },
          { value: 'all', label: 'All statuses' },
        ]}
      />

      <FilterTabs
        value={lifecycle}
        onChange={v => { setLifecycle(v); setPage(1) }}
        options={[
          { value: 'all', label: 'All stages' },
          ...LIFECYCLE.map(s => ({ value: s, label: lifecycleLabel(s) })),
        ]}
      />

      {loading ? (
        <div className="loading">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          onRowClick={r => r.company_id && go('company', r.company_id)}
          empty="No contacts match this filter."
        />
      )}

      {moveContact && (
        <Modal title={`Move contact — ${moveContact.full_name || ''}`} onClose={() => setMoveContact(null)} width={520}>
          <form onSubmit={saveMove}>
            <Field label="What happened?">
              <select className="input" value={moveForm.mode} onChange={e => setMoveForm({ ...moveForm, mode: e.target.value })}>
                <option value="left">Left this company (keep as former)</option>
                <option value="transfer">Moved to another company (transfer)</option>
              </select>
            </Field>
            {moveForm.mode === 'left' ? (
              <Field label="Reason (optional)">
                <input
                  className="input"
                  placeholder="e.g. resigned, retired, role ended…"
                  value={moveForm.left_reason}
                  onChange={e => setMoveForm({ ...moveForm, left_reason: e.target.value })}
                />
              </Field>
            ) : (
              <>
                <Field label="New company *">
                  <CompanySearchSelect
                    value={moveForm.new_company_id}
                    onChange={v => setMoveForm({ ...moveForm, new_company_id: v })}
                    required
                    placeholder="Search destination company…"
                  />
                </Field>
                <Field label="New job title">
                  <input className="input" value={moveForm.job_title} onChange={e => setMoveForm({ ...moveForm, job_title: e.target.value })} />
                </Field>
                <Field label="New role">
                  <select className="input" value={moveForm.role || ''} onChange={e => setMoveForm({ ...moveForm, role: e.target.value })}>
                    <option value="">—</option>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </>
            )}
            <Field label="Notes (optional)">
              <textarea
                className="input"
                rows={2}
                value={moveForm.notes}
                onChange={e => setMoveForm({ ...moveForm, notes: e.target.value })}
                placeholder="Any context for the team…"
              />
            </Field>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
              {moveForm.mode === 'left'
                ? 'Stays linked to the company under Former / left. Filter Contacts → Left / former to see them.'
                : 'Moves to the new company as active. Previous employer is stored in history.'}
            </p>
            <Actions saving={saving} onCancel={() => setMoveContact(null)} label={moveForm.mode === 'left' ? 'Mark as left' : 'Transfer contact'} />
          </form>
        </Modal>
      )}
    </div>
  )
}
