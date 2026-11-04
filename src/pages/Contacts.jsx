import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE, LIFECYCLE, lifecycleLabel } from '../constants'
import { PageHead, FilterTabs, DataTable, Badge } from '../ui'

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
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('full_name')
  const [sortDir, setSortDir] = useState('asc')
  const [exportMode, setExportMode] = useState('both')
  const [flash, setFlash] = useState('')

  useEffect(() => { load() }, [page, sortKey, sortDir, lifecycle, q])

  async function load() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const companySelect = lifecycle !== 'all'
      ? 'companies!inner(id, name, lifecycle_status, city)'
      : 'companies(id, name, lifecycle_status, city)'
    let query = supabase
      .from('contacts')
      .select(`id, full_name, job_title, role, email, phone, phone_mobile_2, phone_landline, phone_extension, company_id, ${companySelect}`, { count: 'exact' })
      .neq('state', 'deleted')

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
      if (/companies|relationship|foreign/i.test(error.message || '')) {
        let q2 = supabase
          .from('contacts')
          .select('id, full_name, job_title, role, email, phone, phone_mobile_2, phone_landline, phone_extension, company_id, companies(id, name, lifecycle_status, city)', { count: 'exact' })
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
        setItems(rows)
        setTotal(res2.count || rows.length)
        setLoading(false)
        return
      }
      setFlash('Load failed: ' + error.message)
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

  async function exportContacts() {
    setFlash('Building export…')
    const companySelect = lifecycle !== 'all'
      ? 'companies!inner(name, lifecycle_status, city)'
      : 'companies(name, lifecycle_status, city)'
    let query = supabase
      .from('contacts')
      .select(`full_name, job_title, role, email, phone, phone_mobile_2, phone_landline, phone_extension, ${companySelect}`)
      .neq('state', 'deleted')
      .order('full_name')
      .limit(10000)

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
        .select('full_name, job_title, role, email, phone, phone_mobile_2, phone_landline, phone_extension, companies(name, lifecycle_status, city)')
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

    if (exportMode === 'phone') {
      rows = rows.filter(r => r.phone || r.phone_mobile_2 || r.phone_landline)
    } else if (exportMode === 'email') {
      rows = rows.filter(r => r.email)
    } else {
      rows = rows.filter(r => r.email || r.phone || r.phone_mobile_2 || r.phone_landline)
    }

    const headers = ['Company', 'Lifecycle', 'Name', 'Job title', 'Role']
    if (exportMode === 'email' || exportMode === 'both') headers.push('Email')
    if (exportMode === 'phone' || exportMode === 'both') {
      headers.push('Mobile', 'Mobile 2', 'Landline', 'Extension')
    }
    headers.push('City')

    const mapped = rows.map(r => {
      const o = {
        Company: r.companies?.name || '',
        Lifecycle: lifecycleLabel(r.companies?.lifecycle_status),
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
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`contacts_${stage}_${exportMode}_${stamp}.csv`, headers, mapped)
    setFlash(`Exported ${mapped.length} contact(s) (${exportMode}).`)
    setTimeout(() => setFlash(''), 4000)
  }

  const columns = useMemo(() => [
    {
      key: 'full_name',
      label: 'Name',
      bold: true,
      render: r => r.full_name || '—',
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
  ], [go])

  return (
    <div style={{ padding: '20px 24px' }}>
      <PageHead
        eyebrow="People"
        title="Contacts"
        subtitle="All contacts across companies. Filter by company lifecycle, then export phone, email, or both."
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
    </div>
  )
}
