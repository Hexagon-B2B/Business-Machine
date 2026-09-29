import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Companies({ go }) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', website: '', industry: '', city: '', country: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = supabase.from('companies').select('id, name, website, industry, city, country, lifecycle_status, research_status, created_at').order('name').limit(100)
    if (search.trim()) q = q.ilike('name', `%${search.trim()}%`)
    const { data } = await q
    setCompanies(data || [])
    setLoading(false)
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
    } else {
      alert(error?.message || 'Failed to create')
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Companies</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Your account base</p>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>+ New Company</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <button className="btn" onClick={load}>Search</button>
      </div>

      {loading ? (
        <div className="loading">Loading companies...</div>
      ) : companies.length === 0 ? (
        <div className="empty">No companies found. Create your first one.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Industry</th>
                <th>City</th>
                <th>Status</th>
                <th>Research</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => go('company', c.id)}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.industry || '—'}</td>
                  <td>{c.city || '—'}</td>
                  <td><span className="badge blue">{c.lifecycle_status}</span></td>
                  <td><span className="badge gray">{c.research_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
        }}>
          <div className="card" style={{ width: 440, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>New Company</h2>
            <form onSubmit={createCompany}>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Company Name *</label>
                <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Website</label>
                <input className="input" value={form.website} onChange={e => setForm({...form, website: e.target.value})} placeholder="https://" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="label">Industry</label>
                  <input className="input" value={form.industry} onChange={e => setForm({...form, industry: e.target.value})} />
                </div>
                <div>
                  <label className="label">City</label>
                  <input className="input" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Country</label>
                <input className="input" value={form.country} onChange={e => setForm({...form, country: e.target.value})} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label className="label">Notes</label>
                <textarea className="input" rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Create Company'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}