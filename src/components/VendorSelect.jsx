import { useState } from 'react'

function loadVendorsFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem('hexagon_vendors') || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

function saveVendorToStorage(v, existingId) {
  const list = loadVendorsFromStorage()
  if (existingId) {
    const next = list.map(x => String(x.id) === String(existingId) ? {
      ...x,
      name: v.name || x.name,
      legal_name: v.legal_name != null ? v.legal_name : (x.legal_name || ''),
      location: v.location != null ? v.location : (x.location || ''),
      brands: v.brands != null ? v.brands : (x.brands || ''),
    } : x)
    localStorage.setItem('hexagon_vendors', JSON.stringify(next))
    return next
  }
  if (list.some(x => String(x.name).toLowerCase() === String(v.name).toLowerCase())) return list
  const next = [...list, {
    id: 'v_' + Date.now().toString(36),
    name: v.name,
    legal_name: v.legal_name || '',
    location: v.location || '',
    brands: v.brands || '',
  }]
  localStorage.setItem('hexagon_vendors', JSON.stringify(next))
  return next
}

export function VendorSelect({ value, onChange, vendors = [], onVendorsChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [editVendor, setEditVendor] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', legal_name: '', location: '', brands: '' })
  const list = vendors.length ? vendors : loadVendorsFromStorage()
  const term = (q || value || '').trim().toLowerCase()
  const filtered = !term
    ? list.slice(0, 40)
    : list.filter(v =>
        [v.name, v.legal_name, v.location, v.brands].filter(Boolean).join(' ').toLowerCase().includes(term)
      ).slice(0, 40)
  const exact = list.find(v => String(v.name).toLowerCase() === term)
  const showAdd = !exact && (q || value || '').trim()
  const optionCount = filtered.length + (showAdd ? 1 : 0)

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
  function openEdit(v, e) {
    e.preventDefault()
    e.stopPropagation()
    setEditVendor(v)
    setEditForm({
      name: v.name || '',
      legal_name: v.legal_name || '',
      location: v.location || '',
      brands: v.brands || '',
    })
    setOpen(false)
  }
  function saveEdit() {
    if (!editVendor || !(editForm.name || '').trim()) return
    const next = saveVendorToStorage(editForm, editVendor.id)
    onVendorsChange && onVendorsChange(next)
    if (value === editVendor.name && editForm.name !== editVendor.name) {
      onChange(editForm.name)
    }
    setEditVendor(null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        value={open ? q : (value || '')}
        placeholder="Search vendor or type new…"
        onFocus={() => { setOpen(true); setQ(value || ''); setHi(0) }}
        onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); onChange(e.target.value) }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onKeyDown={e => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHi(i => Math.min(i + 1, Math.max(0, optionCount - 1)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi(i => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (hi < filtered.length && filtered[hi]) pick(filtered[hi].name)
            else if (showAdd) addNew()
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', maxHeight: 240, overflow: 'auto',
        }}>
          {filtered.map((v, idx) => (
            <div key={v.id || v.name} style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #f1f5f9', background: idx === hi ? '#dbeafe' : 'transparent' }}
              onMouseEnter={() => setHi(idx)}>
              <button type="button"
                style={{ flex: 1, textAlign: 'left', padding: '8px 10px', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13 }}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(v.name)}>
                <strong>{v.name}</strong>
                <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>
                  {[v.location, v.brands].filter(Boolean).join(' · ')}
                </span>
              </button>
              <button type="button"
                title="Edit vendor / products"
                style={{ border: 0, background: 'transparent', color: '#2563eb', fontSize: 11, fontWeight: 600, padding: '0 10px', cursor: 'pointer' }}
                onMouseDown={e => e.preventDefault()}
                onClick={e => openEdit(v, e)}>
                Edit
              </button>
            </div>
          ))}
          {showAdd && (
            <button type="button"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, borderTop: '1px solid #f1f5f9', background: hi === filtered.length ? '#dbeafe' : '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setHi(filtered.length)}
              onClick={addNew}>
              + Add vendor "{(q || value || '').trim()}"
            </button>
          )}
          {filtered.length === 0 && !(q || value || '').trim() && (
            <div style={{ padding: 10, fontSize: 12, color: '#94a3b8' }}>No vendors yet — type a name to add</div>
          )}
        </div>
      )}

      {editVendor && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 90,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setEditVendor(null)}>
          <div className="card" style={{ width: 'min(420px, 100%)', padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Edit vendor</div>
            <label className="label">Name</label>
            <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ marginBottom: 8 }} />
            <label className="label">Legal name</label>
            <input className="input" value={editForm.legal_name} onChange={e => setEditForm(f => ({ ...f, legal_name: e.target.value }))} style={{ marginBottom: 8 }} />
            <label className="label">Location</label>
            <input className="input" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} style={{ marginBottom: 8 }} />
            <label className="label">Brands / products carried</label>
            <textarea className="input" rows={3} value={editForm.brands} onChange={e => setEditForm(f => ({ ...f, brands: e.target.value }))} placeholder="e.g. Cisco, Fortinet, Dell servers…" style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditVendor(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={saveEdit}>Save vendor</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { loadVendorsFromStorage }
