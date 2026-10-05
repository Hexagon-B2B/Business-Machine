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
