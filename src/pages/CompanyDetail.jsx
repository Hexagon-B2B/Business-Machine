import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CompanyDetail({ id, go }) {
  const [company, setCompany] = useState(null)
  const [contacts, setContacts] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    async function load() {
      const [c, ct, t] = await Promise.all([
        supabase.from('companies').select('*').eq('id', id).single(),
        supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
        supabase.from('tasks').select('*').eq('company_id', id).order('due_at', { ascending: true }).limit(10)
      ])
      setCompany(c.data)
      setContacts(ct.data || [])
      setTasks(t.data || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="loading">Loading company...</div>
  if (!company) return <div className="empty">Company not found. <button className="btn" onClick={() => go('companies')}>Back</button></div>

  return (
    <div style={{ padding: 28 }}>
      <button className="btn" style={{ marginBottom: 16 }} onClick={() => go('companies')}>← Back to Companies</button>

      <div className="card" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>{company.name}</h1>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <span className="badge blue">{company.lifecycle_status}</span>
          <span className="badge gray">{company.research_status}</span>
          {company.industry && <span className="badge gray">{company.industry}</span>}
        </div>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
          <div><strong>Website:</strong> {company.website ? <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : '—'}</div>
          <div><strong>City:</strong> {company.city || '—'} {company.country ? `, ${company.country}` : ''}</div>
          <div><strong>Employees:</strong> {company.employee_count || '—'}</div>
          <div><strong>Founded:</strong> {company.founded_year || '—'}</div>
        </div>
        {company.notes && <p style={{ marginTop: 12, fontSize: 13, color: '#475569' }}>{company.notes}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Contacts ({contacts.length})</h2>
          {contacts.length === 0 ? <div className="empty" style={{ padding: 20 }}>No contacts yet</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contacts.map(c => (
                <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontWeight: 600 }}>{c.full_name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{c.job_title || ''} {c.email ? `· ${c.email}` : ''} {c.phone ? `· ${c.phone}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Tasks ({tasks.length})</h2>
          {tasks.length === 0 ? <div className="empty" style={{ padding: 20 }}>No tasks</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map(t => (
                <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    <span className={`badge ${t.priority === 'high' ? 'red' : 'gray'}`}>{t.priority}</span>
                    {' '}{t.status} {t.due_at ? `· Due ${new Date(t.due_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}