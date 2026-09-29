import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Opportunities() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', stage: 'qualification', deal_size: '', requirement_description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('opportunities').select('id, name, stage, deal_size, currency, expected_close_date, requirement_description, company_id').order('created_at', { ascending: false }).limit(50)
    setItems(data || [])
    setLoading(false)
  }

  async function createItem(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    // Note: company_id is required. For V1 we allow null if schema permits, otherwise user must link later.
    const payload = {
      name: form.name.trim(),
      stage: form.stage,
      deal_size: form.deal_size ? Number(form.deal_size) : null,
      currency: 'INR',
      requirement_description: form.requirement_description || null,
      state: 'active',
      opportunity_code: 'OPP-' + Date.now().toString(36).toUpperCase()
    }
    // company_id is required in schema - we need a company. For now show message.
    const { error } = await supabase.from('opportunities').insert(payload)
    setSaving(false)
    if (!error) {
      setShowNew(false)
      setForm({ name: '', stage: 'qualification', deal_size: '', requirement_description: '' })
      load()
    } else {
      alert(error.message + '\n\nNote: Opportunities currently require a linked Company. Create from a Company detail page in next update.')
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Opportunities</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Sales pipeline</p>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>+ New Opportunity</button>
      </div>

      {loading ? <div className="loading">Loading...</div> : items.length === 0 ? (
        <div className="empty">No opportunities yet. Create one from a Company for best results.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Stage</th>
                <th>Value</th>
                <th>Expected Close</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td><span className="badge blue">{i.stage}</span></td>
                  <td>{i.deal_size ? `${i.currency || 'INR'} ${Number(i.deal_size).toLocaleString()}` : '—'}</td>
                  <td>{i.expected_close_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ width: 440 }}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>New Opportunity</h2>
            <form onSubmit={createItem}>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Opportunity Name *</label>
                <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="label">Stage</label>
                  <select className="input" value={form.stage} onChange={e => setForm({...form, stage: e.target.value})}>
                    <option value="qualification">Qualification</option>
                    <option value="discovery">Discovery</option>
                    <option value="proposal">Proposal</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="label">Deal Size (INR)</label>
                  <input className="input" type="number" value={form.deal_size} onChange={e => setForm({...form, deal_size: e.target.value})} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label className="label">Requirement</label>
                <textarea className="input" rows={3} value={form.requirement_description} onChange={e => setForm({...form, requirement_description: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}