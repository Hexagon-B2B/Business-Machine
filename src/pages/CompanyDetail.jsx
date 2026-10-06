import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, RESEARCH_STATUS, ROLES, OPP_STAGES, MISSING_COMPANY_FIELDS, isTaskOpen, isTaskClosed, lifecycleLabel, oppStageLabel } from '../constants'
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
  const [editingContactId, setEditingContactId] = useState(null)
  const [showTask, setShowTask] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [editMeeting, setEditMeeting] = useState(null)
  const [showMeeting, setShowMeeting] = useState(false)
  const [showOpp, setShowOpp] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showResearch, setShowResearch] = useState(false)
  const [cForm, setCForm] = useState({ full_name: '', job_title: '', role: '', email: '', phone: '', phone_mobile_2: '', phone_landline: '', phone_extension: '' })
  const [tForm, setTForm] = useState({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' })
  const [mForm, setMForm] = useState({ type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_due_at: '', contact_id: '' })
  const [oForm, setOForm] = useState({ name: '', stage: 'requirement', deal_size: '', requirement_description: '', solution: '', expected_close_date: '', next_action: '', next_action_due: '', primary_contact_id: '' })
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
      supabase.from('tasks').select('*').eq('company_id', id).neq('state', 'deleted').order('due_at', { ascending: true }),
      supabase.from('meetings_calls').select('*').eq('company_id', id).neq('state', 'deleted').order('scheduled_at', { ascending: false }).limit(20),
      supabase.from('opportunities').select('*').eq('company_id', id).neq('state', 'deleted').order('created_at', { ascending: false }),
      supabase.from('signals').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20)
    ])
    setCompany(c.data); setContacts(ct.data || []); setTasks(t.data || []); setMeetings(m.data || []); setOpps(o.data || []); setSignals(s.data || []); setLoading(false)
  }

  function openEdit() {
    setEForm({ name: company.name || '', legal_name: company.legal_name || '', address: company.address || '', city: company.city || '', pincode: company.pincode || '', hq_location: company.hq_location || '', country: company.country || '', employee_count: company.employee_count || company.enrichment_employee_count || '', board_no: company.board_no || '', website: company.website || '', email: company.email || '', gst_no: company.gst_no || '', industry: company.industry || '', lifecycle_status: company.lifecycle_status || 'prospect_no_contact', research_status: company.research_status || 'NOT_RESEARCHED', last_billed_at: (company.last_billed_at || '').toString().slice(0, 10), notes: company.notes || '', locations: Array.isArray(company.metadata?.locations) ? company.metadata.locations.map(l => ({ ...l })) : [] })
    setShowEdit(true)
  }

  async function saveCompany(e) {
    e.preventDefault()
    if (!eForm.name.trim()) return
    const gst = (eForm.gst_no || '').trim().toUpperCase()
    if (gst && !/^[0-9A-Z]{15}$/.test(gst)) { alert('GST No should be 15 characters. Leave blank if unknown.'); return }
    setSaving(true)
    const payload = { name: eForm.name.trim(), legal_name: (eForm.legal_name || '').trim() || null, address: (eForm.address || '').trim() || null, city: (eForm.city || '').trim() || null, pincode: (eForm.pincode || '').trim() || null, hq_location: (eForm.hq_location || '').trim() || null, country: (eForm.country || '').trim() || null, employee_count: eForm.employee_count ? Number(eForm.employee_count) : null, board_no: (eForm.board_no || '').trim() || null, website: (eForm.website || '').trim() || null, email: (eForm.email || '').trim() || null, gst_no: gst || null, industry: (eForm.industry || '').trim() || null, lifecycle_status: eForm.lifecycle_status, research_status: eForm.research_status, last_billed_at: eForm.last_billed_at || null, notes: (eForm.notes || '').trim() || null, metadata: { ...(company.metadata || {}), locations: (eForm.locations || []).filter(l => (l.city || l.label || '').trim()) } }
    let { error } = await supabase.from('companies').update(payload).eq('id', id)
    if (error && /pincode|column/i.test(error.message)) { delete payload.pincode; ({ error } = await supabase.from('companies').update(payload).eq('id', id)) }
    setSaving(false)
    if (!error) { setShowEdit(false); setCompany({ ...company, ...payload }) }
    else alert(error.message)
  }

  async function updateLifecycle(val) {
    await supabase.from('companies').update({ lifecycle_status: val }).eq('id', id)
    setCompany({ ...company, lifecycle_status: val })
  }

  function openAddContact() {
    setEditingContactId(null)
    setCForm({ full_name: '', job_title: '', role: '', email: '', phone: '', phone_mobile_2: '', phone_landline: '', phone_extension: '' })
    setShowContact(true)
  }

  function openEditContact(ct) {
    setEditingContactId(ct.id)
    setCForm({ full_name: ct.full_name || '', job_title: ct.job_title || '', role: ct.role || '', email: ct.email || '', phone: ct.phone || '', phone_mobile_2: ct.phone_mobile_2 || '', phone_landline: ct.phone_landline || '', phone_extension: ct.phone_extension || '' })
    setShowContact(true)
  }

  async function saveContact(e) {
    e.preventDefault()
    if (!cForm.full_name.trim()) return
    setSaving(true)
    const payload = { full_name: cForm.full_name.trim(), job_title: cForm.job_title || null, role: cForm.role || null, email: cForm.email || null, phone: cForm.phone || null, phone_mobile_2: cForm.phone_mobile_2 || null, phone_landline: cForm.phone_landline || null, phone_extension: cForm.phone_extension || null }
    let error
    if (editingContactId) ({ error } = await supabase.from('contacts').update(payload).eq('id', editingContactId))
    else ({ error } = await supabase.from('contacts').insert({ company_id: id, ...payload, contact_status: 'active', state: 'active', consent_status: 'unknown', metadata: {} }))
    setSaving(false)
    if (!error) { setShowContact(false); setEditingContactId(null); load() }
    else alert(error.message)
  }

  async function addTask(e) {
    e.preventDefault()
    if (!tForm.title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({ company_id: id, contact_id: tForm.contact_id || null, title: tForm.title.trim(), description: tForm.description || null, priority: (tForm.priority || 'medium').toLowerCase(), status: 'open', due_at: tForm.due_at || null, state: 'active', metadata: {} })
    setSaving(false)
    if (!error) { setShowTask(false); setTForm({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' }); load() }
    else alert(error.message)
  }

  async function addMeeting(e) {
    e.preventDefault()
    if (!mForm.subject.trim()) return
    setSaving(true)
    const { error } = await supabase.from('meetings_calls').insert({ company_id: id, contact_id: mForm.contact_id || null, type: mForm.type, subject: mForm.subject.trim(), description: mForm.description || null, scheduled_at: new Date().toISOString(), status: 'open', outcome: mForm.outcome || null, next_action: mForm.next_action || null, next_action_due_at: mForm.next_action_due_at || null, state: 'active', metadata: {} })
    setSaving(false)
    if (!error) { setShowMeeting(false); setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_due_at: '', contact_id: '' }); load() }
    else alert(error.message)
  }

  async function addOpp(e) {
    e.preventDefault()
    if (!oForm.name.trim()) { alert('Opportunity name is required.'); return }
    if (!(oForm.requirement_description || '').trim()) { alert('Capture the requirement.'); return }
    setSaving(true)
    const meta = { next_action: oForm.next_action || null, next_action_due: oForm.next_action_due || null, solution: oForm.solution || null }
    const payload = { company_id: id, primary_contact_id: oForm.primary_contact_id || null, name: oForm.name.trim(), stage: oForm.stage || 'requirement', deal_size: oForm.deal_size ? Number(oForm.deal_size) : null, currency: 'INR', requirement_description: oForm.requirement_description.trim(), pain_points: oForm.solution || null, expected_close_date: oForm.expected_close_date || null, opportunity_code: 'OPP-' + Date.now().toString(36).toUpperCase(), state: 'active', metadata: meta }
    let { data: created, error } = await supabase.from('opportunities').insert(payload).select('id').single()
    if (error && /primary_contact|column/i.test(error.message)) { delete payload.primary_contact_id; ({ data: created, error } = await supabase.from('opportunities').insert(payload).select('id').single()) }
    if (!error && created?.id && oForm.next_action && oForm.next_action_due) {
      await supabase.from('tasks').insert({ company_id: id, title: ('Opp next action: ' + oForm.next_action).slice(0, 200), description: 'From opportunity: ' + oForm.name.trim(), priority: oForm.stage === 'quotation' || oForm.stage === 'negotiation' ? 'high' : 'medium', status: 'open', due_at: oForm.next_action_due, state: 'active', source: 'user', metadata: { origin: 'opportunity', opportunity_id: created.id } })
    }
    setSaving(false)
    if (!error) { setShowOpp(false); setOForm({ name: '', stage: 'requirement', deal_size: '', requirement_description: '', solution: '', expected_close_date: '', next_action: '', next_action_due: '', primary_contact_id: '' }); load() }
    else alert(error.message)
  }

  async function markTaskDone(tid) {
    const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', tid)
    if (error) alert(error.message)
    else load()
  }

  if (loading) return <div className="loading">Loading company...</div>
  if (!company) return <div className="empty">Company not found. <button className="btn" onClick={() => go('companies')}>Back</button></div>

  const openTasks = tasks.filter(t => isTaskOpen(t.status))
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
            <div className="eyebrow">Company</div>
            <h1 style={{ fontSize: 22 }}>{company.name}</h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }} value={company.lifecycle_status || 'prospect_no_contact'} onChange={e => updateLifecycle(e.target.value)}>
                {LIFECYCLE.map(s => <option key={s} value={s}>{lifecycleLabel(s)}</option>)}
              </select>
              <Badge>{company.research_status || 'NOT_RESEARCHED'}</Badge>
              {company.industry && <Badge>{company.industry}</Badge>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={openEdit}>Edit Company</button>
            <button className="btn primary" onClick={() => setShowResearch(true)}>Initiate Research</button>
            <button className="btn" onClick={openAddContact}>+ Contact</button>
            <button className="btn" onClick={() => setShowTask(true)}>+ Task</button>
            <button className="btn" onClick={() => setShowMeeting(true)}>+ Call / Meeting</button>
            <button className="btn" onClick={() => setShowOpp(true)}>+ New opportunity</button>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, fontSize: 13 }}>
          <div><strong>Full name:</strong> {company.legal_name || '—'}</div>
          <div><strong>GST:</strong> {company.gst_no || '—'}</div>
          <div><strong>Board / CIN:</strong> {company.board_no || '—'}</div>
          <div><strong>Pincode:</strong> {company.pincode || '—'}</div>
          <div><strong>Employees:</strong> {company.employee_count || company.enrichment_employee_count || '—'}</div>
          <div><strong>Website:</strong> {company.website ? <a href={company.website.startsWith('http') ? company.website : 'https://' + company.website} target="_blank" rel="noreferrer">{company.website}</a> : '—'}</div>
          <div><strong>Email:</strong> {company.email || '—'}</div>
          <div><strong>City:</strong> {company.city || '—'}</div>
          <div><strong>HQ:</strong> {company.hq_location || '—'}</div>
          <div style={{ gridColumn: '1 / -1' }}><strong>Address:</strong> {company.address || '—'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {['overview', 'contacts', 'tasks', 'meetings', 'opportunities', 'signals'].map(t => (
          <button key={t} className="btn" style={{ background: tab === t ? '#2563eb' : '#fff', color: tab === t ? '#fff' : '#0f172a', textTransform: 'capitalize' }} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'tasks' && (
        <div className="card">
          {tasks.length === 0 ? <div className="empty">No tasks.</div> : (
            <table className="table"><thead><tr><th>Title</th><th>Status</th><th>Due</th><th>Priority</th><th></th></tr></thead>
              <tbody>{tasks.map(t => (
                <tr key={t.id}>
                  <td>{t.title}</td><td>{t.status === 'completed' ? 'done' : t.status}</td><td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}</td><td>{t.priority}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setEditTask({ ...t, due_at: (t.due_at || '').toString().slice(0, 10) })}>Edit</button>
                    {isTaskOpen(t.status) && <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => markTaskDone(t.id)}>Done</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card">
          {meetings.length === 0 ? <div className="empty">No meetings/calls logged.</div> : (
            <table className="table"><thead><tr><th>Type</th><th>Subject</th><th>Status</th><th>Outcome</th><th>Next</th><th></th></tr></thead>
              <tbody>{meetings.map(m => (
                <tr key={m.id}>
                  <td>{m.type}</td><td>{m.subject}</td><td>{m.status === 'completed' ? 'done' : (m.status || 'open')}</td><td>{m.outcome || '—'}</td><td>{m.next_action || '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setEditMeeting({ ...m, scheduled_at: m.scheduled_at ? new Date(m.scheduled_at).toISOString().slice(0, 16) : '', status: m.status || 'open' })}>Edit</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card">
          {contacts.length === 0 ? <div className="empty">No contacts.</div> : (
            <table className="table"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th></th></tr></thead>
              <tbody>{contacts.map(ct => (
                <tr key={ct.id}>
                  <td>{ct.full_name}</td><td>{ct.role || ct.job_title || '—'}</td><td>{ct.phone || '—'}</td><td>{ct.email || '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => openEditContact(ct)}>Edit</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'opportunities' && (
        <div className="card">
          {opps.length === 0 ? <div className="empty">No opportunities.</div> : (
            <table className="table"><thead><tr><th>Name</th><th>Stage</th><th>Value</th></tr></thead>
              <tbody>{opps.map(o => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => go('opportunities')}>
                  <td>{o.name}</td><td><Badge>{o.stage}</Badge></td><td>{o.deal_size ? '₹' + Number(o.deal_size).toLocaleString() : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'overview' && (
        <div className="card">
          <p style={{ fontSize: 13, color: '#64748b' }}>Use the header actions for Task, Call/Meeting, Opportunity, Contact, or Research. Open other tabs for lists and Edit.</p>
          {nextActions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Next actions</h3>
              {nextActions.map((a, i) => (
                <div key={i} style={{ fontSize: 13, padding: '4px 0', display: 'flex', gap: 10 }}>
                  <Badge tone="blue">{a.type}</Badge>
                  <span style={{ flex: 1 }}>{a.text}</span>
                  <span style={{ color: '#64748b' }}>{a.when ? new Date(a.when).toLocaleDateString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showEdit && (
        <Modal title="Edit Company" onClose={() => setShowEdit(false)} width={620}>
          <form onSubmit={saveCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Short name *"><input className="input" required value={eForm.name || ''} onChange={e => setEForm({ ...eForm, name: e.target.value })} /></Field>
              <Field label="Full / legal name"><input className="input" value={eForm.legal_name || ''} onChange={e => setEForm({ ...eForm, legal_name: e.target.value })} /></Field>
            </div>
            <Field label="Primary address"><textarea className="input" rows={2} value={eForm.address || ''} onChange={e => setEForm({ ...eForm, address: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="City"><input className="input" value={eForm.city || ''} onChange={e => setEForm({ ...eForm, city: e.target.value })} /></Field>
              <Field label="Pincode"><input className="input" value={eForm.pincode || ''} onChange={e => setEForm({ ...eForm, pincode: e.target.value })} placeholder="e.g. 560001" /></Field>
              <Field label="Country"><input className="input" value={eForm.country || ''} onChange={e => setEForm({ ...eForm, country: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="HQ"><input className="input" value={eForm.hq_location || ''} onChange={e => setEForm({ ...eForm, hq_location: e.target.value })} /></Field>
              <Field label="Board / CIN"><input className="input" value={eForm.board_no || ''} onChange={e => setEForm({ ...eForm, board_no: e.target.value })} placeholder="CIN / Board reg. no." /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Employees"><input className="input" type="number" value={eForm.employee_count || ''} onChange={e => setEForm({ ...eForm, employee_count: e.target.value })} /></Field>
              <Field label="GST"><input className="input" value={eForm.gst_no || ''} onChange={e => setEForm({ ...eForm, gst_no: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Website"><input className="input" value={eForm.website || ''} onChange={e => setEForm({ ...eForm, website: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={eForm.email || ''} onChange={e => setEForm({ ...eForm, email: e.target.value })} /></Field>
            </div>
            <Field label="Industry"><input className="input" value={eForm.industry || ''} onChange={e => setEForm({ ...eForm, industry: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={eForm.notes || ''} onChange={e => setEForm({ ...eForm, notes: e.target.value })} /></Field>
            <div style={{ margin: '8px 0', padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Other locations (service area)</div>
              {(eForm.locations || []).map((loc, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr auto', gap: 6, marginBottom: 6 }}>
                  <input className="input" placeholder="Label" value={loc.label || ''} onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], label: e.target.value }; setEForm({ ...eForm, locations }) }} />
                  <input className="input" placeholder="City" value={loc.city || ''} onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], city: e.target.value }; setEForm({ ...eForm, locations }) }} />
                  <input className="input" placeholder="Pincode" value={loc.pincode || ''} onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], pincode: e.target.value }; setEForm({ ...eForm, locations }) }} />
                  <button type="button" className="btn" style={{ padding: '4px 8px' }} onClick={() => setEForm({ ...eForm, locations: (eForm.locations || []).filter((_, i) => i !== idx) })}>×</button>
                </div>
              ))}
              <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setEForm({ ...eForm, locations: [...(eForm.locations || []), { label: '', city: '', pincode: '' }] })}>+ Add location</button>
            </div>
            <Actions saving={saving} onCancel={() => setShowEdit(false)} label="Save company" />
          </form>
        </Modal>
      )}

      {showTask && (
        <Modal title="Add task" onClose={() => setShowTask(false)}>
          <form onSubmit={addTask}>
            <Field label="Title *"><input className="input" required value={tForm.title} onChange={e => setTForm({ ...tForm, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={2} value={tForm.description} onChange={e => setTForm({ ...tForm, description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Priority"><select className="input" value={tForm.priority} onChange={e => setTForm({ ...tForm, priority: e.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></Field>
              <Field label="Due"><input className="input" type="date" value={tForm.due_at} onChange={e => setTForm({ ...tForm, due_at: e.target.value })} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowTask(false)} label="Add task" />
          </form>
        </Modal>
      )}

      {showMeeting && (
        <Modal title="Log call / meeting" onClose={() => setShowMeeting(false)}>
          <form onSubmit={addMeeting}>
            <Field label="Type"><select className="input" value={mForm.type} onChange={e => setMForm({ ...mForm, type: e.target.value })}><option value="call">call</option><option value="meeting">meeting</option><option value="visit">visit</option><option value="message">message</option></select></Field>
            <Field label="Subject *"><input className="input" required value={mForm.subject} onChange={e => setMForm({ ...mForm, subject: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={mForm.outcome} onChange={e => setMForm({ ...mForm, outcome: e.target.value })} /></Field>
            <Field label="Next action"><input className="input" value={mForm.next_action} onChange={e => setMForm({ ...mForm, next_action: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowMeeting(false)} label="Save" />
          </form>
        </Modal>
      )}

      {showContact && (
        <Modal title={editingContactId ? 'Edit contact' : 'Add contact'} onClose={() => setShowContact(false)}>
          <form onSubmit={saveContact}>
            <Field label="Full name *"><input className="input" required value={cForm.full_name} onChange={e => setCForm({ ...cForm, full_name: e.target.value })} /></Field>
            <Field label="Role"><input className="input" value={cForm.role} onChange={e => setCForm({ ...cForm, role: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={cForm.email} onChange={e => setCForm({ ...cForm, email: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" value={cForm.phone} onChange={e => setCForm({ ...cForm, phone: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowContact(false)} label="Save contact" />
          </form>
        </Modal>
      )}

      {editTask && (
        <Modal title="Edit task" onClose={() => setEditTask(null)} width={480}>
          <form onSubmit={async e => {
            e.preventDefault()
            if (!editTask.title?.trim()) return
            setSaving(true)
            let status = editTask.status || 'open'
            if (status === 'done') status = 'completed'
            const { error } = await supabase.from('tasks').update({ title: editTask.title.trim(), description: editTask.description || null, priority: (editTask.priority || 'medium').toLowerCase(), status, due_at: editTask.due_at || null }).eq('id', editTask.id)
            setSaving(false)
            if (error) alert(error.message)
            else { setEditTask(null); load() }
          }}>
            <Field label="Title *"><input className="input" required value={editTask.title || ''} onChange={e => setEditTask({ ...editTask, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={2} value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Priority"><select className="input" value={editTask.priority || 'medium'} onChange={e => setEditTask({ ...editTask, priority: e.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></Field>
              <Field label="Status"><select className="input" value={editTask.status === 'done' ? 'completed' : (editTask.status || 'open')} onChange={e => setEditTask({ ...editTask, status: e.target.value })}><option value="open">open</option><option value="in_progress">in progress</option><option value="completed">done</option><option value="cancelled">cancelled</option></select></Field>
              <Field label="Due"><input className="input" type="date" value={editTask.due_at || ''} onChange={e => setEditTask({ ...editTask, due_at: e.target.value })} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setEditTask(null)} label="Save task" />
          </form>
        </Modal>
      )}

      {editMeeting && (
        <Modal title="Edit call/meeting" onClose={() => setEditMeeting(null)} width={520}>
          <form onSubmit={async e => {
            e.preventDefault()
            if (!editMeeting.subject?.trim()) return
            setSaving(true)
            const { error } = await supabase.from('meetings_calls').update({ type: editMeeting.type || 'call', subject: editMeeting.subject.trim(), description: editMeeting.description || null, outcome: editMeeting.outcome || null, next_action: editMeeting.next_action || null, scheduled_at: editMeeting.scheduled_at ? new Date(editMeeting.scheduled_at).toISOString() : null, status: editMeeting.status || 'open' }).eq('id', editMeeting.id)
            setSaving(false)
            if (error) alert(error.message)
            else { setEditMeeting(null); load() }
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type"><select className="input" value={editMeeting.type || 'call'} onChange={e => setEditMeeting({ ...editMeeting, type: e.target.value })}><option value="call">call</option><option value="meeting">meeting</option><option value="visit">visit</option><option value="message">message</option></select></Field>
              <Field label="Status"><select className="input" value={editMeeting.status || 'open'} onChange={e => setEditMeeting({ ...editMeeting, status: e.target.value })}><option value="open">open</option><option value="in_progress">in progress</option><option value="completed">done</option><option value="cancelled">cancelled</option></select></Field>
            </div>
            <Field label="Subject *"><input className="input" required value={editMeeting.subject || ''} onChange={e => setEditMeeting({ ...editMeeting, subject: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={editMeeting.outcome || ''} onChange={e => setEditMeeting({ ...editMeeting, outcome: e.target.value })} /></Field>
            <Field label="Next action"><input className="input" value={editMeeting.next_action || ''} onChange={e => setEditMeeting({ ...editMeeting, next_action: e.target.value })} /></Field>
            <Field label="When"><input className="input" type="datetime-local" value={editMeeting.scheduled_at || ''} onChange={e => setEditMeeting({ ...editMeeting, scheduled_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setEditMeeting(null)} label="Save" />
          </form>
        </Modal>
      )}

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={560}>
          <form onSubmit={addOpp}>
            <Field label="Name *"><input className="input" required value={oForm.name} onChange={e => setOForm({ ...oForm, name: e.target.value })} /></Field>
            <Field label="Requirement *"><textarea className="input" rows={2} required value={oForm.requirement_description} onChange={e => setOForm({ ...oForm, requirement_description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Stage"><select className="input" value={oForm.stage} onChange={e => setOForm({ ...oForm, stage: e.target.value })}>{OPP_STAGES.filter(s => s !== 'won' && s !== 'lost').map(s => <option key={s} value={s}>{oppStageLabel(s)}</option>)}</select></Field>
              <Field label="Estimate (₹)"><input className="input" type="number" value={oForm.deal_size} onChange={e => setOForm({ ...oForm, deal_size: e.target.value })} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {showResearch && (
        <Modal title="Research" onClose={() => setShowResearch(false)}>
          <p style={{ fontSize: 13, color: '#475569' }}>Open company page actions and Tasks tab for research work items.</p>
          <button type="button" className="btn" onClick={() => setShowResearch(false)}>Close</button>
        </Modal>
      )}
    </div>
  )
}
