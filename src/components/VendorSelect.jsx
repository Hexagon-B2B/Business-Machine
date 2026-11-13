import { useState } from 'react'

function loadVendorsFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem('hexagon_vendors') || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

function saveVendorToStorage(v) {
  const list = loadVendorsFromStorage()
  if (list.some(x => String(x.name).toLowerCase() === String(v.name).toLowerCase())) return list
  const next = [...list, { id: 'v_' + Date.now().toString(36), name: v.name, legal_name: v.legal_name || '', location: v.location || '', brands: v.brands || '' }]
  localStorage.setItem('hexagon_vendors', JSON.stringify(next))
  return next
}

export function VendorSelect({ value, onChange, vendors = [], onVendorsChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const list = vendors.length ? vendors : loadVendorsFromStorage()
  const term = (q || value || '').trim().toLowerCase()
  const filtered = !term
    ? list.slice(0, 40)
    : list.filter(v =>
        [v.name, v.legal_name, v.location, v.brands].filter(Boolean).join(' ').toLowerCase().includes(term)
      ).slice(0, 40)
  const exact = list.find(v => String(v.name).toLowerCase() === term)

  function pick(name) {
    onChange(name)
    setQ('')
    setOpen(false)
  }
  function addNew() {
    const name = (q || value || '').trim()
    if (!name) return
    const next = saveVendorToStorage({ name })
    onVendorsChange && onVendorsChange(next)
    pick(name)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        value={open ? q : (value || '')}
        placeholder="Search vendor or type new…"
        onFocus={() => { setOpen(true); setQ(value || '') }}
        onChange={e => { setQ(e.target.value); setOpen(true); onChange(e.target.value) }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {open && (
        <div style={{
          position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', maxHeight: 220, overflow: 'auto',
        }}>
          {filtered.map(v => (
            <button key={v.id || v.name} type="button"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13 }}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(v.name)}>
              <strong>{v.name}</strong>
              <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>
                {[v.location, v.brands].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
          {!exact && (q || value || '').trim() && (
            <button type="button"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, borderTop: '1px solid #f1f5f9', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}
              onMouseDown={e => e.preventDefault()}
              onClick={addNew}>
              + Add vendor "{(q || value || '').trim()}"
            </button>
          )}
          {filtered.length === 0 && !(q || value || '').trim() && (
            <div style={{ padding: 10, fontSize: 12, color: '#94a3b8' }}>No vendors yet — type a name to add</div>
          )}
        </div>
      )}
    </div>
  )
}

export { loadVendorsFromStorage }
