import { supabase } from './supabase'
import { useState, useEffect, useRef } from 'react'

export function PageHead({ eyebrow, title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 style={{ fontSize: 22 }}>{title}</h1>
        {subtitle && <p style={{ color: '#64748b', fontSize: 14 }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

export function FilterTabs({ value, options, onChange }) {
  return (
    <div className="toolbar">
      {options.map(o => (
        <button key={o.value} className="btn" onClick={() => onChange(o.value)}
          style={{ background: value === o.value ? '#2563eb' : '#fff', color: value === o.value ? '#fff' : '#0f172a' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DataTable({
  columns, rows, sortKey, sortDir, onSort, onRowClick,
  page, pageSize, total, onPage, empty,
  selectable = false, selectedIds = null, onToggleSelect, onToggleSelectAll,
}) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total || 0)
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || [])
  const allOnPageSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const someOnPageSelected = rows.some(r => selected.has(r.id))

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: 40 }} onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected }}
                    onChange={() => onToggleSelectAll && onToggleSelectAll(rows, !allOnPageSelected)}
                    aria-label="Select all on page"
                  />
                </th>
              )}
              {columns.map(c => (
                <th key={c.key} onClick={() => onSort && onSort(c.key)}>
                  {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)}><div className="empty">{empty || 'No records'}</div></td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ cursor: onRowClick ? 'pointer' : 'default' }} onClick={() => onRowClick && onRowClick(r)}>
                {selectable && (
                  <td onClick={e => e.stopPropagation()} style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => onToggleSelect && onToggleSelect(r.id)}
                      aria-label="Select row"
                    />
                  </td>
                )}
                {columns.map(c => <td key={c.key} style={c.bold ? { fontWeight: 600 } : undefined}>{c.render ? c.render(r) : (r[c.key] || '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <div>Showing {from}–{to} of {(total || 0).toLocaleString()}</div>
        <div className="pages">
          <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <span style={{ padding: '8px 6px' }}>Page {page} of {pages}</span>
          <button className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  )
}

export function Modal({ title, children, onClose, width = 480 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="card" style={{ width, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17 }}>{title}</h2>
          <button className="btn ghost" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><label className="label">{label}</label>{children}</div>
}

export function Actions({ saving, onCancel, label }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
      <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : label}</button>
    </div>
  )
}

export function Badge({ children, tone = 'gray' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

/** Searchable company picker — queries Supabase live (name, legal name, city). */
export function CompanySearchSelect({ companies: companiesProp, value, onChange, required, placeholder = 'Type to search company…' }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (!value) { setSelectedLabel(''); return }
    const fromProp = (companiesProp || []).find(c => c.id === value)
    if (fromProp) { setSelectedLabel(fromProp.name || ''); return }
    let cancelled = false
    supabase.from('companies').select('id, name').eq('id', value).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setSelectedLabel(data.name || '') })
    return () => { cancelled = true }
  }, [value, companiesProp])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      const term = q.trim().replace(/%/g, '').replace(/,/g, ' ')
      let query = supabase
        .from('companies')
        .select('id, name, legal_name, city')
        .order('name')
        .limit(60)
      query = query.not('state', 'eq', 'deleted')
      if (term) {
        query = query.or(
          `name.ilike.%${term}%,legal_name.ilike.%${term}%,city.ilike.%${term}%`
        )
      }
      let { data, error } = await query
      if (error) {
        let q2 = supabase.from('companies').select('id, name, legal_name, city').order('name').limit(60)
        if (term) q2 = q2.or(`name.ilike.%${term}%,legal_name.ilike.%${term}%,city.ilike.%${term}%`)
        ;({ data, error } = await q2)
      }
      if (!error && term && (!data || data.length === 0)) {
        const token = term.split(/\s+/).filter(t => t.length >= 3)[0]
        if (token) {
          let q3 = supabase.from('companies').select('id, name, legal_name, city').order('name').limit(60)
          q3 = q3.or(`name.ilike.%${token}%,legal_name.ilike.%${token}%,city.ilike.%${token}%`)
          const r3 = await q3
          if (!r3.error && r3.data) data = r3.data
        }
      }
      if (companiesProp?.length && term) {
        const t = term.toLowerCase()
        const local = companiesProp.filter(c =>
          (c.name || '').toLowerCase().includes(t) ||
          (c.legal_name || '').toLowerCase().includes(t) ||
          (c.city || '').toLowerCase().includes(t)
        )
        const seen = new Set((data || []).map(c => c.id))
        for (const c of local) {
          if (!seen.has(c.id)) { (data = data || []).push(c); seen.add(c.id) }
        }
      }
      if (!cancelled) {
        setResults(data || [])
        setLoading(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [q, open, companiesProp])

  function pick(c) {
    onChange(c.id)
    setSelectedLabel(c.name || '')
    setQ('')
    setOpen(false)
  }

  function clear() {
    onChange('')
    setSelectedLabel('')
    setQ('')
    setOpen(true)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {value && selectedLabel && !open ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="input" style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 44, cursor: 'pointer' }} onClick={() => setOpen(true)}>
            <span style={{ fontWeight: 600 }}>{selectedLabel}</span>
          </div>
          <button type="button" className="btn" style={{ flexShrink: 0, minHeight: 44 }} onClick={clear}>Change</button>
        </div>
      ) : (
        <input
          className="input"
          value={q}
          required={required && !value}
          placeholder={placeholder}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
      )}
      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 80,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
        }}>
          {loading ? (
            <div style={{ padding: 12, fontSize: 13, color: '#64748b' }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, color: '#64748b' }}>
              {q.trim() ? `No companies match “${q.trim()}” — try fewer letters` : 'Start typing a company name'}
            </div>
          ) : results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                border: 0, borderBottom: '1px solid #f1f5f9', background: c.id === value ? '#eff6ff' : '#fff',
                cursor: 'pointer', fontSize: 14, minHeight: 44,
              }}
            >
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              {c.legal_name && c.legal_name !== c.name ? (
                <span style={{ color: '#64748b', marginLeft: 8, fontSize: 12 }}>{c.legal_name}</span>
              ) : null}
              {c.city ? <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 12 }}>{c.city}</span> : null}
            </button>
          ))}
        </div>
      )}
      <input type="hidden" value={value || ''} required={required} readOnly />
    </div>
  )
}
