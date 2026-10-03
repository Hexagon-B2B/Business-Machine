import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, RESEARCH_STATUS, ROLES, OPP_STAGES, MISSING_COMPANY_FIELDS, isTaskOpen, isTaskClosed } from '../constants'
import { Modal, Field, Actions, Badge } from '../ui'

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
  const [showResearch, setShowResearch] = useState(false)
  const [cForm, setCForm] = useState({ full_name: '', job_title: '', role: '', email: '', phone: '' })
  const [tForm, setTForm] = useState({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' })
  const [mForm, setMForm] = useState({ type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_due_at: '', contact_id: '' })
  const [oForm, setOForm] = useState({ name: '', stage: 'requirement', deal_size: '', requirement_description: '', solution: '', expected_close_date: '', next_action: '', primary_contact_id: '' })
  const [eForm, setEForm] = useState({})
  const [sigForm, setSigForm] = useState({ signal_type: 'news', observation: '', source: '' })
  const [researchBusy, setResearchBusy] = useState(false)
  const [researchMsg, setResearchMsg] = useState('')
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
      supabase.from('signals').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20)
    ])
    setCompany(c.data)
    setContacts(ct.data || [])
    setTasks(t.data || [])
    setMeetings(m.data || [])
    setOpps(o.data || [])
    setSignals(s.data || [])
    setLoading(false)
  }

  function missingFields() {
    if (!company) return []
    const miss = MISSING_COMPANY_FIELDS.filter(([k]) => !company[k] && !company['enrichment_' + k])
    if (contacts.length === 0) miss.push(['contacts', 'At least one contact'])
    return miss
  }

  function searchLinks() {
    const q = encodeURIComponent(company.name)
    return [
      ['Company website / profile', company.website ? (company.website.startsWith('http') ? company.website : 'https://' + company.website) : `https://www.google.com/search?q=${q}`],
      ['Google — company', `https://www.google.com/search?q=${q}`],
      ['Google News', `https://www.google.com/search?tbm=nws&q=${q}`],
      ['LinkedIn company search', `https://www.linkedin.com/search/results/companies/?keywords=${q}`],
      ['Hiring / jobs mentions', `https://www.google.com/search?q=${encodeURIComponent(company.name + ' hiring OR jobs OR careers site:linkedin.com')}`],
    ]
  }

  async function initiateResearch() {
    setResearchBusy(true)
    setResearchMsg('')
    const miss = missingFields().map(([k, label]) => label)
    const titles = [
      { title: `Fill missing profile fields for ${company.name}`, description: 'Missing: ' + (miss.join(', ') || 'review remaining firmographics'), priority: 'high' },
      { title: `Check news mentions for ${company.name}`, description: 'Look for buying signals, expansions, leadership changes, tenders.', priority: 'medium' },
      { title: `Check LinkedIn hiring signals for ${company.name}`, description: 'Hiring in IT, infrastructure, security or facilities may indicate a requirement.', priority: 'medium' },
    ]
    const openTitles = new Set(tasks.filter(t => isTaskOpen(t.status)).map(t => t.title))
    const toCreate = titles.filter(t => !openTitles.has(t.title))
    const errors = []
    const { error: qErr } = await supabase.from('research_queue').insert({
      company_id: id,
      research_tier: 1,
      status: 'queued',
      next_research_at: new Date().toISOString(),
      approval_status: 'not_required',
      metadata: { focus: ['missing_fields', 'news', 'hiring'], initiated_by: 'user' }
    })
    if (qErr) errors.push('Queue: ' + qErr.message)
    await supabase.from('companies').update({ research_status: 'IN_PROGRESS' }).eq('id', id)
    for (const t of toCreate) {
      const { error } = await supabase.from('tasks').insert({
        company_id: id, title: t.title, description: t.description, priority: t.priority,
        status: 'open', state: 'active', source: 'research', metadata: { kind: 'research' }
      })
      if (error) errors.push(t.title + ': ' + error.message)
    }
    setResearchBusy(false)
    if (errors.length) setResearchMsg(errors.join('\n'))
    else setResearchMsg('Research started. Three work items prepared (duplicates skipped). Open the search links, then log findings as signals.')
    load()
  }

  async function logSignal(e) {
    e.preventDefault()
    if (!sigForm.observation.trim()) return
    setSaving(true)
    const { error } = await supabase.from('signals').insert({
      company_id: id,
      signal_type: sigForm.signal_type,
      observation: sigForm.observation.trim(),
      source: sigForm.source || null,
      evidence: { captured_from: 'company_research', source: sigForm.source || null },
      review_status: 'pending',
      observed_at: new Date().toISOString()
    })
    setSaving(false)
    if (error) alert(error.message)
    else {
      setSigForm({ signal_type: 'news', observation: '', source: '' })
      load()
    }
  }

  function openEdit() {
    setEForm({
      name: company.name || '', legal_name: company.legal_name || '', website: company.website || '',
      industry: company.industry || '', city: company.city || '', country: company.country || '',
      lifecycle_status: company.lifecycle_status || 'prospect',
      research_status: company.research_status || 'NOT_RESEARCHED',
      notes: company.notes || '', employee_count: company.employee_count || company.enrichment_employee_count || ''
    })
    setShowEdit(true)
  }

  async function saveCompany(e) {
    e.preventDefault()
    if (!eForm.name.trim()) return
    setSaving(true)
    const payload = {
      name: eForm.name.trim(), legal_name: eForm.legal_name || null, website: eForm.website || null,
      industry: eForm.industry || null, city: eForm.city || null, country: eForm.country || null,
      lifecycle_status: eForm.lifecycle_status, research_status: eForm.research_status,
      notes: eForm.notes || null, employee_count: eForm.employee_count ? Number(eForm.employee_count) : null
    }
    const { error } = await supabase.from('companies').update(payload).eq('id', id)
    setSaving(false)
    if (!error) { setShowEdit(false); setCompany({ ...company, ...payload }) }
    else alert(error.message)
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
      company_id: id, full_name: cForm.full_name.trim(), job_title: cForm.job_title || null,
      role: cForm.role || null, email: cForm.email || null, phone: cForm.phone || null,
      contact_status: 'active', state: 'active', consent_status: 'unknown', metadata: {}
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
      company_id: id, contact_id: tForm.contact_id || null, title: tForm.title.trim(),
      description: tForm.description || null, priority: tForm.priority, status: 'open',
      due_at: tForm.due_at || null, state: 'active', metadata: {}
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
      company_id: id, contact_id: mForm.contact_id || null, type: mForm.type,
      subject: mForm.subject.trim(), description: mForm.description || null,
      scheduled_at: new Date().toISOString(), status: 'completed',
      outcome: mForm.outcome || null, next_action: mForm.next_action || null,
      next_action_due_at: mForm.next_action_due_at || null, state: 'active', metadata: {}
    })
    setSaving(false)
    if (!error) { setShowMeeting(false); setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_due_at: '', contact_id: '' }); load() }
    else alert(error.message)
  }

  async function addOpp(e) {
    e.preventDefault()
    if (!oForm.name.trim()) { alert('Opportunity name is required.'); return }
    if (!(oForm.requirement_description || '').trim()) { alert('Capture the requirement — that is what makes this a real opportunity.'); return }
    setSaving(true)
    const meta = { next_action: oForm.next_action || null, solution: oForm.solution || null }
    const { error } = await supabase.from('opportunities').insert({
      company_id: id, primary_contact_id: oForm.primary_contact_id || null,
      name: oForm.name.trim(), stage: oForm.stage || 'requirement',
      deal_size: oForm.deal_size ? Number(oForm.deal_size) : null, currency: 'INR',
      requirement_description: oForm.requirement_description.trim(),
      pain_points: oForm.solution || null,
      expected_close_date: oForm.expected_close_date || null,
      opportunity_code: 'OPP-' + Date.now().toString(36).toUpperCase(),
      state: 'active', metadata: meta
    })
    setSaving(false)
    if (!error) {
      setShowOpp(false)
      setOForm({ name: '', stage: 'requirement', deal_size: '', requirement_description: '', solution: '', expected_close_date: '', next_action: '', primary_contact_id: '' })
      load()
    } else alert(error.message)
  }

  async function markTaskDone(tid) {
    const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', tid)
    if (error) alert('Could not mark done: ' + error.message)
    else {
      setTasks(prev => prev.map(x => x.id === tid ? { ...x, status: 'completed' } : x))
      load()
    }
  }

  async function markTaskCancelled(tid) {
    if (!confirm('Cancel this task?')) return
    const { error } = await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', tid)
    if (error) alert('Could not cancel: ' + error.message)
    else {
      setTasks(prev => prev.map(x => x.id === tid ? { ...x, status: 'cancelled' } : x))
      load()
    }
  }

  if (loading) return <div className="loading">Loading company...</div>
  if (!company) return <div className="empty">Company not found. <button className="btn" onClick={() => go('companies')}>Back</button></div>

  const openTasks = tasks.filter(t => isTaskOpen(t.status))
  const nextActions = [
    ...openTasks.filter(t => t.due_at).map(t => ({ type: 'Task', text: t.title, when: t.due_at })),
    ...meetings.filter(m => m.next_action).map(m => ({ type: 'Meeting', text: m.next_action, when: m.next_action_due_at })),
  ].sort((a, b) => (a.when || '9999').localeCompare(b.when || '9999')).slice(0, 5)
  const miss = missingFields()

  return (
    <div style={{ padding: 28 }}>
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => go('companies')}>← All Companies</button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="eyebrow">Company</div>
            <h1 style={{ fontSize: 22 }}>{company.name}</h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}
                value={company.lifecycle_status || 'prospect'} onChange={e => updateLifecycle(e.target.value)}>
                {LIFECYCLE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <Badge>{company.research_status || 'NOT_RESEARCHED'}</Badge>
              {company.industry && <Badge>{company.industry}</Badge>}
              {miss.length > 0 && <Badge tone="yellow">{miss.length} missing fields</Badge>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={openEdit}>Edit Company</button>
            <button className="btn primary" onClick={() => setShowResearch(true)}>Initiate Research</button>
            <button className="btn" onClick={() => setShowContact(true)}>+ Contact</button>
            <button className="btn" onClick={() => setShowTask(true)}>+ Task</button>
            <button className="btn" onClick={() => setShowMeeting(true)}>+ Call / Meeting</button>
            <button className="btn" onClick={() => setShowOpp(true)}>+ New opportunity</button>
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
              <Badge tone="blue">{a.type}</Badge>
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
            {t === 'signals' && ` (${signals.length})`}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Open Tasks ({openTasks.length})</h3>
            {openTasks.length === 0 ? <div className="empty" style={{ padding: 16 }}>No open tasks</div> :
              openTasks.slice(0, 6).map(t => (
                <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ color: '#64748b' }}><Badge tone={t.priority === 'high' ? 'red' : 'gray'}>{t.priority}</Badge>{t.due_at && ` · Due ${new Date(t.due_at).toLocaleDateString()}`}</div>
                </div>
              ))}
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Recent Meetings / Calls</h3>
            {meetings.length === 0 ? <div className="empty" style={{ padding: 16 }}>None yet</div> :
              meetings.slice(0, 5).map(m => (
                <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{m.subject} <Badge tone="blue">{m.type}</Badge></div>
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
                  <td><Badge tone={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}>{t.priority}</Badge></td>
                  <td><Badge tone={t.status === 'completed' || t.status === 'done' ? 'green' : t.status === 'cancelled' ? 'gray' : 'blue'}>{t.status === 'completed' ? 'done' : t.status}</Badge></td>
                  <td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}</td>
                  <td>
                    {isTaskOpen(t.status) && <button className="btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => markTaskDone(t.id)}>Done</button>}
                    {isTaskOpen(t.status) && <button className="btn" style={{ fontSize: 11, padding: '2px 6px', marginLeft: 4 }} onClick={() => markTaskCancelled(t.id)}>Cancel</button>}
                  </td>
                </tr>
              ))}</tbody></table>}
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card" style={{ padding: 0 }}>
          {meetings.length === 0 ? <div className="empty">No meetings yet</div> :
            <table className="table"><thead><tr><th>Type</th><th>Subject</th><th>Outcome</th><th>Next Action</th><th>When</th></tr></thead>
              <tbody>{meetings.map(m => (
                <tr key={m.id}>
                  <td><Badge tone="blue">{m.type}</Badge></td>
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
          {opps.length === 0 ? <div className="empty">No opportunities. Use + New opportunity.</div> :
            <table className="table"><thead><tr><th>Name</th><th>Stage</th><th>Value</th><th>Close</th></tr></thead>
              <tbody>{opps.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.name}</td>
                  <td><Badge tone="blue">{o.stage}</Badge></td>
                  <td>{o.deal_size ? `₹${Number(o.deal_size).toLocaleString()}` : '—'}</td>
                  <td>{o.expected_close_date || '—'}</td>
                </tr>
              ))}</tbody></table>}
        </div>
      )}

      {tab === 'signals' && (
        <div className="card" style={{ padding: 0 }}>
          {signals.length === 0 ? <div className="empty">No signals logged</div> :
            <table className="table"><thead><tr><th>Type</th><th>Observation</th><th>Status</th></tr></thead>
              <tbody>{signals.map(s => (
                <tr key={s.id}>
                  <td><Badge tone="blue">{s.signal_type}</Badge></td>
                  <td>{s.observation}</td>
                  <td><Badge>{s.review_status}</Badge></td>
                </tr>
              ))}</tbody></table>}
          <form onSubmit={logSignal} style={{ padding: 16, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Log signal</div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto', gap: 8 }}>
              <select className="input" value={sigForm.signal_type} onChange={e => setSigForm({ ...sigForm, signal_type: e.target.value })}>
                {['news', 'hiring', 'funding', 'expansion', 'tender', 'leadership', 'other'].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <input className="input" placeholder="Observation *" value={sigForm.observation} onChange={e => setSigForm({ ...sigForm, observation: e.target.value })} required />
              <input className="input" placeholder="Source" value={sigForm.source} onChange={e => setSigForm({ ...sigForm, source: e.target.value })} />
              <button type="submit" className="btn primary" disabled={saving}>Log</button>
            </div>
          </form>
        </div>
      )}

      {showContact && (
        <Modal title="Add Contact" onClose={() => setShowContact(false)}>
          <form onSubmit={addContact}>
            <Field label="Full name *"><input className="input" value={cForm.full_name} onChange={e => setCForm({ ...cForm, full_name: e.target.value })} required /></Field>
            <Field label="Role"><select className="input" value={cForm.role} onChange={e => setCForm({ ...cForm, role: e.target.value })}><option value="">—</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></Field>
            <Field label="Job title"><input className="input" value={cForm.job_title} onChange={e => setCForm({ ...cForm, job_title: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={cForm.email} onChange={e => setCForm({ ...cForm, email: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" value={cForm.phone} onChange={e => setCForm({ ...cForm, phone: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowContact(false)} label="Add contact" />
          </form>
        </Modal>
      )}

      {showTask && (
        <Modal title="Add Task" onClose={() => setShowTask(false)}>
          <form onSubmit={addTask}>
            <Field label="Title *"><input className="input" value={tForm.title} onChange={e => setTForm({ ...tForm, title: e.target.value })} required /></Field>
            <Field label="Description"><textarea className="input" rows={3} value={tForm.description} onChange={e => setTForm({ ...tForm, description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Priority"><select className="input" value={tForm.priority} onChange={e => setTForm({ ...tForm, priority: e.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></Field>
              <Field label="Due"><input className="input" type="date" value={tForm.due_at} onChange={e => setTForm({ ...tForm, due_at: e.target.value })} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowTask(false)} label="Add task" />
          </form>
        </Modal>
      )}

      {showMeeting && (
        <Modal title="Log Call / Meeting" onClose={() => setShowMeeting(false)}>
          <form onSubmit={addMeeting}>
            <Field label="Type"><select className="input" value={mForm.type} onChange={e => setMForm({ ...mForm, type: e.target.value })}><option value="call">call</option><option value="meeting">meeting</option><option value="visit">visit</option><option value="message">message</option></select></Field>
            <Field label="Subject *"><input className="input" value={mForm.subject} onChange={e => setMForm({ ...mForm, subject: e.target.value })} required /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={mForm.description} onChange={e => setMForm({ ...mForm, description: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={mForm.outcome} onChange={e => setMForm({ ...mForm, outcome: e.target.value })} /></Field>
            <Field label="Next action"><input className="input" value={mForm.next_action} onChange={e => setMForm({ ...mForm, next_action: e.target.value })} /></Field>
            <Field label="Next action due"><input className="input" type="date" value={mForm.next_action_due_at} onChange={e => setMForm({ ...mForm, next_action_due_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowMeeting(false)} label="Log meeting" />
          </form>
        </Modal>
      )}

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={560}>
          <form onSubmit={addOpp}>
            <Field label="Company">
              <div style={{ fontWeight: 600, fontSize: 14 }}>{company.name}</div>
            </Field>
            <Field label="Opportunity name *">
              <input className="input" required value={oForm.name} onChange={e => setOForm({ ...oForm, name: e.target.value })} placeholder="e.g. Workspace fit-out · Phase 1" />
            </Field>
            <Field label="Requirement *">
              <textarea className="input" rows={3} required value={oForm.requirement_description} onChange={e => setOForm({ ...oForm, requirement_description: e.target.value })} placeholder="What does the buyer need?" />
            </Field>
            <Field label="Proposed solution / Hexagon fit">
              <textarea className="input" rows={2} value={oForm.solution} onChange={e => setOForm({ ...oForm, solution: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Stage">
                <select className="input" value={oForm.stage} onChange={e => setOForm({ ...oForm, stage: e.target.value })}>
                  {OPP_STAGES.filter(s => s !== 'won' && s !== 'lost').map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Est. value (INR)">
                <input className="input" type="number" value={oForm.deal_size} onChange={e => setOForm({ ...oForm, deal_size: e.target.value })} />
              </Field>
              <Field label="Expected close">
                <input className="input" type="date" value={oForm.expected_close_date} onChange={e => setOForm({ ...oForm, expected_close_date: e.target.value })} />
              </Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {showEdit && (
        <Modal title="Edit Company" onClose={() => setShowEdit(false)}>
          <form onSubmit={saveCompany}>
            <Field label="Name *"><input className="input" value={eForm.name || ''} onChange={e => setEForm({ ...eForm, name: e.target.value })} required /></Field>
            <Field label="Legal name"><input className="input" value={eForm.legal_name || ''} onChange={e => setEForm({ ...eForm, legal_name: e.target.value })} /></Field>
            <Field label="Website"><input className="input" value={eForm.website || ''} onChange={e => setEForm({ ...eForm, website: e.target.value })} /></Field>
            <Field label="Industry"><input className="input" value={eForm.industry || ''} onChange={e => setEForm({ ...eForm, industry: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="City"><input className="input" value={eForm.city || ''} onChange={e => setEForm({ ...eForm, city: e.target.value })} /></Field>
              <Field label="Country"><input className="input" value={eForm.country || ''} onChange={e => setEForm({ ...eForm, country: e.target.value })} /></Field>
            </div>
            <Field label="Employee count"><input className="input" type="number" value={eForm.employee_count || ''} onChange={e => setEForm({ ...eForm, employee_count: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Lifecycle"><select className="input" value={eForm.lifecycle_status} onChange={e => setEForm({ ...eForm, lifecycle_status: e.target.value })}>{LIFECYCLE.map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
              <Field label="Research"><select className="input" value={eForm.research_status} onChange={e => setEForm({ ...eForm, research_status: e.target.value })}>{RESEARCH_STATUS.map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
            </div>
            <Field label="Notes"><textarea className="input" rows={3} value={eForm.notes || ''} onChange={e => setEForm({ ...eForm, notes: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowEdit(false)} label="Save" />
          </form>
        </Modal>
      )}

      {showResearch && (
        <Modal title="Initiate Research" onClose={() => setShowResearch(false)} width={560}>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>Creates research tasks and queue entry. Opens search links for free investigation.</p>
          {researchMsg && <div className="notice" style={{ marginBottom: 12 }}>{researchMsg}</div>}
          <div style={{ marginBottom: 12 }}>
            {searchLinks().map(([label, url]) => (
              <div key={label} style={{ marginBottom: 6 }}>
                <a href={url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: 13 }}>{label}</a>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary" disabled={researchBusy} onClick={initiateResearch}>{researchBusy ? 'Working…' : 'Start research'}</button>
            <button type="button" className="btn" onClick={() => setShowResearch(false)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
