import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const LIFECYCLE = ['prospect', 'active', 'repeat', 'dormant', 'lost']
const RESEARCH = ['NOT_RESEARCHED', 'IN_PROGRESS', 'RESEARCHED', 'NEEDS_UPDATE']
const ROLES = ['Decision Maker', 'Procurement', 'IT', 'Finance', 'Technical Evaluator', 'Influencer', 'End User', 'Other']

export default function CompanyDetail({ id, go }) {
  const [company, setCompany] = useState(null)
  const [contacts, setContacts] = useState([])
  const [tasks, setTasks] = useState([])
  const [meetings, setMeetings] = useState([])
  const [opps, setOpps] = useState([])
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [showContact, setShowContact] = useState(false)
  const [showTask, setShowTask] = useState(false)
  const [showMeeting, setShowMeeting] = useState(false)
  const [showOpp, setShowOpp] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [cForm, setCForm] = useState({ full_name: '', job_title: '', role: '', email: '', phone: '' })
  const [tForm, setTForm] = useState({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' })
  const [mForm, setMForm] = useState({ type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_due_at: '', contact_id: '' })
  const [oForm, setOForm] = useState({ name: '', stage: 'qualification', deal_size: '', requirement_description: '', primary_contact_id: '' })
  const [eForm, setEForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (id) load() }, [id])

  async function load() {
    setLoading(true)
    const [c, ct, t, m, o, s] = await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
      supabase.from('tasks').select('*').eq('company_id', id).order('due_at', { ascending: true }),
      supabase.from('meetings_calls').select('*').eq('company_id', id).order('scheduled_at', { ascending: false }).limit(20),
      supabase.from('opportunities').select('*').eq('company_id', id).order('created_at', { ascending: false }),
      supabase.from('signals').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(15)
    ])
    setCompany(c.data)
    setContacts(ct.data || [])
    setTasks(t.data || [])
    setMeetings(m.data || [])
    setOpps(o.data || [])
    setSignals(s.data || [])
    setLoading(false)
  }

  function openEdit() {
    setEForm({
      name: company.name || '',
      legal_name: company.legal_name || '',
      website: company.website || '',
      industry: company.industry || '',
      city: company.city || '',
      country: company.country || '',
      lifecycle_status: company.lifecycle_status || 'prospect',
      research_status: company.research_status || 'NOT_RESEARCHED',
      notes: company.notes || '',
      employee_count: company.employee_count || company.enrichment_employee_count || ''
    })
    setShowEdit(true)
  }

  async function saveCompany(e) {
    e.preventDefault()
    if (!eForm.name.trim()) return
    setSaving(true)
    const payload = {
      name: eForm.name.trim(),
      legal_name: eForm.legal_name || null,
      website: eForm.website || null,
      industry: eForm.industry || null,
      city: eForm.city || null,
      country: eForm.country || null,
      lifecycle_status: eForm.lifecycle_status,
      research_status: eForm.research_status,
      notes: eForm.notes || null,
      employee_count: eForm.employee_count ? Number(eForm.employee_count) : null
    }
    const { error } = await supabase.from('companies').update(payload).eq('id', id)
    setSaving(false)
    if (!error) {
      setShowEdit(false)
      setCompany({ ...company, ...payload })
    } else alert(error.message)
  }

  async function updateLifecycle(val) {
    await supabase.from('companies').update({ lifecycle_status: val }).eq('id', id)
    setCompany({ ...company, lifecycle_status: val })
  }

  async function addContact(e) {
    e.preventDefault()
    if (!cForm.full_name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('contacts').insert({
      company_id: id,
      full_name: cForm.full_name.trim(),
      job_title: cForm.job_title || null,
      role: cForm.role || null,
      email: cForm.email || null,
      phone: cForm.phone || null,
      contact_status: 'active',
      state: 'active',
      consent_status: 'unknown',
      metadata: {}
    })
    setSaving(false)
    if (!error) { setShowContact(false); setCForm({ full_name: '', job_title: '', role: '', email: '', phone: '' }); load() }
    else alert(error.message)
  }

  async function addTask(e) {
    e.preventDefault()
    if (!tForm.title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      company_id: id,
      contact_id: tForm.contact_id || null,
      title: tForm.title.trim(),
      description: tForm.description || null,
      priority: tForm.priority,
      status: 'open',
      due_at: tForm.due_at || null,
      state: 'active',
      metadata: {}
    })
    setSaving(false)
    if (!error) { setShowTask(false); setTForm({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' }); load() }
    else alert(error.message)
  }

  async function addMeeting(e) {
    e.preventDefault()
    if (!mForm.subject.trim()) return
    setSaving(true)
    const { error } = await supabase.from('meetings_calls').insert({
      company_id: id,
      contact_id: mForm.contact_id || null,
      type: mForm.type,
      subject: mForm.subject.trim(),
      description: mForm.description || null,
      scheduled_at: new Date().toISOString(),
      status: 'completed',
      outcome: mForm.outcome || null,
      next_action: mForm.next_action || null,
      next_action_due_at: mForm.next_action_due_at || null,
      state: 'active',
      metadata: {}
    })
    setSaving(false)
    if (!error) { setShowMeeting(false); setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_due_at: '', contact_id: '' }); load() }
    else alert(error.message)
  }

  async function addOpp(e) {
    e.preventDefault()
    if (!oForm.name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('opportunities').insert({
      company_id: id,
      primary_contact_id: oForm.primary_contact_id || null,
      name: oForm.name.trim(),
      stage: oForm.stage,
      deal_size: oForm.deal_size ? Number(oForm.deal_size) : null,
      currency: 'INR',
      requirement_description: oForm.requirement_description || null,
      opportunity_code: 'OPP-' + Date.now().toString(36).toUpperCase(),
      state: 'active',
      metadata: {}
    })
    setSaving(false)
    if (!error) { setShowOpp(false); setOForm({ name: '', stage: 'qualification', deal_size: '', requirement_description: '', primary_contact_id: '' }); load() }
    else alert(error.message)
  }

  async function markTaskDone(tid) {
    await supabase.from('tasks').update({ status: 'done' }).eq('id', tid)
    load()
  }

  if (loading) return <div className="loading">Loading company...</div>
  if (!company) return <div className="empty">Company not found. <button className="btn" onClick={() => go('companies')}>Back</button></div>

  const openTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
  const nextActions = [
    ...openTasks.filter(t => t.due_at).map(t => ({ type: 'Task', text: t.title, when: t.due_at })),
    ...meetings.filter(m => m.next_action).map(m => ({ type: 'Meeting', text: m.next_action, when: m.next_action_due_at })),
  ].sort((a, b) => (a.when || '9999').localeCompare(b.when || '9999')).slice(0, 5)

  return (
    <div style={{ padding: 28 }}>
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => go('companies')}>← All Companies</button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>{company.name}</h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}
                value={company.lifecycle_status || 'prospect'} onChange={e => updateLifecycle(e.target.value)}>
                {LIFECYCLE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="badge gray">{company.research_status || 'NOT_RESEARCHED'}</span>
              {company.industry && <span className="badge gray">{company.industry}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={openEdit}>Edit Company</button>
            <button className="btn" onClick={() => setShowContact(true)}>+ Contact</button>
            <button className="btn" onClick={() => setShowTask(true)}>+ Task</button>
            <button className="btn" onClick={() => setShowMeeting(true)}>+ Call / Meeting</button>
            <button className="btn primary" onClick={() => setShowOpp(true)}>+ Opportunity</button>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, fontSize: 13 }}>
          <div><strong>Website:</strong> {company.website ? <a href={company.website.startsWith('http') ? company.website : 'https://' + company.website} target="_blank" rel="noreferrer">{company.website}</a> : '—'}</div>
          <div><strong>Location:</strong> {[company.city, company.country].filter(Boolean).join(', ') || '—'}</div>
          <div><strong>Employees:</strong> {company.employee_count || company.enrichment_employee_count || '—'}</div>
          <div><strong>Legal Name:</strong> {company.legal_name || '—'}</div>
        </div>
        {company.notes && <p style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>{company.notes}</p>}
      </div>

      {nextActions.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #2563eb' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#1e40af' }}>NEXT ACTIONS</h3>
          {nextActions.map((a, i) => (
            <div key={i} style={{ fontSize: 13, padding: '4px 0', display: 'flex', gap: 10 }}>
              <span className="badge blue">{a.type}</span>
              <span style={{ flex: 1 }}>{a.text}</span>
              <span style={{ color: '#64748b' }}>{a.when ? new Date(a.when).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {['overview', 'contacts', 'tasks', 'meetings', 'opportunities', 'signals'].map(t => (
          <button key={t} className="btn" onClick={() => setTab(t)}
            style={{ background: tab === t ? '#2563eb' : '#fff', color: tab === t ? '#fff' : '#0f172a', borderColor: tab === t ? '#2563eb' : '#cbd5e1' }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'contacts' && ` (${contacts.length})`}
            {t === 'tasks' && ` (${openTasks.length})`}
            {t === 'opportunities' && ` (${opps.length})`}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Open Tasks ({openTasks.length})</h3>
            {openTasks.length === 0 ? <div className="empty" style={{ padding: 16 }}>No open tasks</div> :
              openTasks.slice(0, 5).map(t => (
                <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ color: '#64748b' }}>
                    <span className={`badge ${t.priority === 'high' ? 'red' : 'gray'}`}>{t.priority}</span>
                    {t.due_at && ` · Due ${new Date(t.due_at).toLocaleDateString()}`}
                  </div>
                </div>
              ))}
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Recent Meetings / Calls</h3>
            {meetings.length === 0 ? <div className="empty" style={{ padding: 16 }}>None yet</div> :
              meetings.slice(0, 5).map(m => (
                <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{m.subject} <span className="badge blue">{m.type}</span></div>
                  {m.next_action && <div style={{ color: '#1e40af' }}>Next: {m.next_action}</div>}
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card" style={{ padding: 0 }}>
          {contacts.length === 0 ? <div className="empty">No contacts. Add one.</div> :
            <table className="table"><thead><tr><th>Name</th><th>Role</th><th>Title</th><th>Email</th><th>Phone</th></tr></thead>
              <tbody>{contacts.map(c => (
                <tr key={c.id}><td style={{ fontWeight: 600 }}>{c.full_name}</td><td>{c.role || '—'}</td><td>{c.job_title || '—'}</td><td>{c.email || '—'}</td><td>{c.phone || '—'}</td></tr>
              ))}</tbody></table>}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card" style={{ padding: 0 }}>
          {tasks.length === 0 ? <div className="empty">No tasks</div> :
            <table className="table"><thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Due</th><th></th></tr></thead>
              <tbody>{tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.title}</td>
                  <td><span className={`badge ${t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}`}>{t.priority}</span></td>
                  <td><span className="badge blue">{t.status}</span></td>
                  <td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}</td>
                  <td>{t.status !== 'done' && <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => markTaskDone(t.id)}>Done</button>}</td>
                </tr>
              ))}</tbody></table>}
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card" style={{ padding: 0 }}>
          {meetings.length === 0 ? <div className="empty">No meetings or calls logged</div> :
            <table className="table"><thead><tr><th>Type</th><th>Subject</th><th>Outcome</th><th>Next Action</th><th>When</th></tr></thead>
              <tbody>{meetings.map(m => (
                <tr key={m.id}>
                  <td><span className="badge blue">{m.type}</span></td>
                  <td style={{ fontWeight: 600 }}>{m.subject}</td>
                  <td>{m.outcome || '—'}</td>
                  <td style={{ color: m.next_action ? '#1e40af' : undefined }}>{m.next_action || '—'}</td>
                  <td>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}</tbody></table>}
        </div>
      )}

      {tab === 'opportunities' && (
        <div className="card" style={{ padding: 0 }}>
          {opps.length === 0 ? <div className="empty">No opportunities</div> :
            <table className="table"><thead><tr><th>Name</th><th>Stage</th><th>Value</th><th>Code</th></tr></thead>
              <tbody>{opps.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.name}</td>
                  <td><span className="badge blue">{o.stage}</span></td>
                  <td>{o.deal_size ? `INR ${Number(o.deal_size).toLocaleString()}` : '—'}</td>
                  <td>{o.opportunity_code}</td>
                </tr>
              ))}</tbody></table>}
        </div>
      )}

      {tab === 'signals' && (
        <div className="card" style={{ padding: 0 }}>
          {signals.length === 0 ? <div className="empty">No signals yet. Research will populate this.</div> :
            <table className="table"><thead><tr><th>Type</th><th>Observation</th><th>Relevance</th><th>Status</th></tr></thead>
              <tbody>{signals.map(s => (
                <tr key={s.id}>
                  <td><span className="badge blue">{s.signal_type}</span></td>
                  <td>{s.observation}</td>
                  <td>{s.relevance || '—'}</td>
                  <td><span className="badge gray">{s.review_status}</span></td>
                </tr>
              ))}</tbody></table>}
        </div>
      )}

      {showEdit && (
        <Modal title="Edit Company" onClose={() => setShowEdit(false)}>
          <form onSubmit={saveCompany}>
            <Field label="Company Name *"><input className="input" value={eForm.name} onChange={e => setEForm({...eForm, name: e.target.value})} required /></Field>
            <Field label="Legal Name"><input className="input" value={eForm.legal_name} onChange={e => setEForm({...eForm, legal_name: e.target.value})} /></Field>
            <Field label="Website"><input className="input" value={eForm.website} onChange={e => setEForm({...eForm, website: e.target.value})} placeholder="https://" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Industry"><input className="input" value={eForm.industry} onChange={e => setEForm({...eForm, industry: e.target.value})} /></Field>
              <Field label="Employees"><input className="input" type="number" value={eForm.employee_count} onChange={e => setEForm({...eForm, employee_count: e.target.value})} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="City"><input className="input" value={eForm.city} onChange={e => setEForm({...eForm, city: e.target.value})} /></Field>
              <Field label="Country"><input className="input" value={eForm.country} onChange={e => setEForm({...eForm, country: e.target.value})} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Lifecycle">
                <select className="input" value={eForm.lifecycle_status} onChange={e => setEForm({...eForm, lifecycle_status: e.target.value})}>
                  {LIFECYCLE.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Research Status">
                <select className="input" value={eForm.research_status} onChange={e => setEForm({...eForm, research_status: e.target.value})}>
                  {RESEARCH.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes"><textarea className="input" rows={3} value={eForm.notes} onChange={e => setEForm({...eForm, notes: e.target.value})} /></Field>
            <Actions saving={saving} onCancel={() => setShowEdit(false)} label="Save Changes" />
          </form>
        </Modal>
      )}

      {showContact && (
        <Modal title="Add Contact" onClose={() => setShowContact(false)}>
          <form onSubmit={addContact}>
            <Field label="Full Name *"><input className="input" value={cForm.full_name} onChange={e => setCForm({...cForm, full_name: e.target.value})} required /></Field>
            <Field label="Role">
              <select className="input" value={cForm.role} onChange={e => setCForm({...cForm, role: e.target.value})}>
                <option value="">— Select —</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Job Title"><input className="input" value={cForm.job_title} onChange={e => setCForm({...cForm, job_title: e.target.value})} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Email"><input className="input" type="email" value={cForm.email} onChange={e => setCForm({...cForm, email: e.target.value})} /></Field>
              <Field label="Phone"><input className="input" value={cForm.phone} onChange={e => setCForm({...cForm, phone: e.target.value})} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowContact(false)} label="Add Contact" />
          </form>
        </Modal>
      )}

      {showTask && (
        <Modal title="New Task" onClose={() => setShowTask(false)}>
          <form onSubmit={addTask}>
            <Field label="What needs to be done? *"><input className="input" value={tForm.title} onChange={e => setTForm({...tForm, title: e.target.value})} required /></Field>
            <Field label="Why / Context"><textarea className="input" rows={2} value={tForm.description} onChange={e => setTForm({...tForm, description: e.target.value})} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Priority">
                <select className="input" value={tForm.priority} onChange={e => setTForm({...tForm, priority: e.target.value})}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </Field>
              <Field label="Due Date"><input className="input" type="date" value={tForm.due_at} onChange={e => setTForm({...tForm, due_at: e.target.value})} /></Field>
            </div>
            <Field label="Related Contact">
              <select className="input" value={tForm.contact_id} onChange={e => setTForm({...tForm, contact_id: e.target.value})}>
                <option value="">— Optional —</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </Field>
            <Actions saving={saving} onCancel={() => setShowTask(false)} label="Create Task" />
          </form>
        </Modal>
      )}

      {showMeeting && (
        <Modal title="Log Call / Meeting" onClose={() => setShowMeeting(false)}>
          <form onSubmit={addMeeting}>
            <Field label="Type">
              <select className="input" value={mForm.type} onChange={e => setMForm({...mForm, type: e.target.value})}>
                <option value="call">Call</option><option value="meeting">Meeting</option>
              </select>
            </Field>
            <Field label="Subject / Purpose *"><input className="input" value={mForm.subject} onChange={e => setMForm({...mForm, subject: e.target.value})} required /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={mForm.description} onChange={e => setMForm({...mForm, description: e.target.value})} /></Field>
            <Field label="Outcome"><input className="input" value={mForm.outcome} onChange={e => setMForm({...mForm, outcome: e.target.value})} placeholder="e.g. Interested, Need follow-up" /></Field>
            <Field label="Next Action"><input className="input" value={mForm.next_action} onChange={e => setMForm({...mForm, next_action: e.target.value})} placeholder="What should happen next?" /></Field>
            <Field label="Next Action Due"><input className="input" type="date" value={mForm.next_action_due_at} onChange={e => setMForm({...mForm, next_action_due_at: e.target.value})} /></Field>
            <Field label="Contact">
              <select className="input" value={mForm.contact_id} onChange={e => setMForm({...mForm, contact_id: e.target.value})}>
                <option value="">— Optional —</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </Field>
            <Actions saving={saving} onCancel={() => setShowMeeting(false)} label="Save" />
          </form>
        </Modal>
      )}

      {showOpp && (
        <Modal title="New Opportunity" onClose={() => setShowOpp(false)}>
          <form onSubmit={addOpp}>
            <Field label="Opportunity Name *"><input className="input" value={oForm.name} onChange={e => setOForm({...oForm, name: e.target.value})} required /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Stage">
                <select className="input" value={oForm.stage} onChange={e => setOForm({...oForm, stage: e.target.value})}>
                  {['qualification','discovery','solution','quotation','negotiation','won','lost'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Deal Size (INR)"><input className="input" type="number" value={oForm.deal_size} onChange={e => setOForm({...oForm, deal_size: e.target.value})} /></Field>
            </div>
            <Field label="Requirement"><textarea className="input" rows={2} value={oForm.requirement_description} onChange={e => setOForm({...oForm, requirement_description: e.target.value})} /></Field>
            <Field label="Primary Contact">
              <select className="input" value={oForm.primary_contact_id} onChange={e => setOForm({...oForm, primary_contact_id: e.target.value})}>
                <option value="">— Optional —</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </Field>
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create Opportunity" />
          </form>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="card" style={{ width: 480, maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ fontSize: 17, marginBottom: 16 }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><label className="label">{label}</label>{children}</div>
}
function Actions({ saving, onCancel, label }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
      <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : label}</button>
    </div>
  )
}
