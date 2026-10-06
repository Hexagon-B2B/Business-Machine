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
    setEForm({ name: company.name || '', legal_name: company.legal_name || '', address: company.address || '', city: company.city || '', pincode: company.pincode || '', hq_location: company.hq_location || '', country: company.country || '', employee_count: company.employee_count || company.enrichment_employee_count || '', board_no: company.board_no || '', website: company.website || '', email: company.email || '', gst_no: company.gst_no || '', industry: company.industry || '', lifecycle_status: company.lifecycle_status || 'prospect_no_contact', research_status: company.research_status || 'NOT_RESEARCHED', last_billed_at: (company.last_billed_at || '').toString().slice(0, 10), notes: company.notes || '', locations: Array.isArray(company.metadata?.locations) ? company.metadata.locations.map(l => ({ label: l.label || '', address: l.address || '', city: l.city || '', pincode: l.pincode || '' })) : [] })
    setShowEdit(true)
  }

  async function saveCompany(e) {
    e.preventDefault()
    if (!eForm.name.trim()) return
    const gst = (eForm.gst_no || '').trim().toUpperCase()
    if (gst && !/^[0-9A-Z]{15}$/.test(gst)) { alert('GST No should be 15 characters. Leave blank if unknown.'); return }
    setSaving(true)
    const payload = { name: eForm.name.trim(), legal_name: (eForm.legal_name || '').trim() || null, address: (eForm.address || '').trim() || null, city: (eForm.city || '').trim() || null, pincode: (eForm.pincode || '').trim() || null, hq_location: (eForm.hq_location || '').trim() || null, country: (eForm.country || '').trim() || null, employee_count: eForm.employee_count ? Number(eForm.employee_count) : null, board_no: (eForm.board_no || '').trim() || null, website: (eForm.website || '').trim() || null, email: (eForm.email || '').trim() || null, gst_no: gst || null, industry: (eForm.industry || '').trim() || null, lifecycle_status: eForm.lifecycle_status, research_status: eForm.research_status, last_billed_at: eForm.last_billed_at || null, notes: (eForm.notes || '').trim() || null, metadata: { ...(company.metadata || {}), locations: (eForm.locations || []).filter(l => (l.city || l.label || l.address || l.pincode || '').trim()).map(l => ({ label: (l.label || '').trim(), address: (l.address || '').trim(), city: (l.city || '').trim(), pincode: (l.pincode || '').trim() })) } }
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
    const payload = { full_name: cForm.full_name.trim(), job_title: cForm.job_title.trim() || null, role: cForm.role || null, email: cForm.email.trim() || null, phone: cForm.phone.trim() || null, phone_mobile_2: cForm.phone_mobile_2.trim() || null, phone_landline: cForm.phone_landline.trim() || null, phone_extension: cForm.phone_extension.trim() || null }
    let error
    if (editingContactId) ({ error } = await supabase.from('contacts').update(payload).eq('id', editingContactId))
    else ({ error } = await supabase.from('contacts').insert({ company_id: id, ...payload, contact_status: 'active', state: 'active', consent_status: 'unknown', source: 'manual' }))
    setSaving(false)
    if (!error) { setShowContact(false); load() }
    else alert(error.message)
  }

  async function addTask(e) {
    e.preventDefault()
    if (!tForm.title.trim()) return
    setSaving(true)
    const priority = ['low', 'medium', 'high'].includes(tForm.priority) ? tForm.priority : 'medium'
    const { error } = await supabase.from('tasks').insert({ company_id: id, contact_id: tForm.contact_id || null, title: tForm.title.trim(), description: tForm.description.trim() || null, priority, status: 'open', due_at: tForm.due_at || null, source: 'user', state: 'active' })
    setSaving(false)
    if (!error) { setShowTask(false); setTForm({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' }); load() }
    else alert(error.message)
  }

  async function addMeeting(e) {
    e.preventDefault()
    if (!mForm.subject.trim()) return
    setSaving(true)
    const { error } = await supabase.from('meetings_calls').insert({ company_id: id, contact_id: mForm.contact_id || null, type: mForm.type, subject: mForm.subject.trim(), description: mForm.description.trim() || null, outcome: mForm.outcome.trim() || null, next_action: mForm.next_action.trim() || null, next_action_due_at: mForm.next_action_due_at || null, status: 'open', state: 'active', scheduled_at: new Date().toISOString() })
    setSaving(false)
    if (!error) { setShowMeeting(false); setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_due_at: '', contact_id: '' }); load() }
    else alert(error.message)
  }

  async function addOpp(e) {
    e.preventDefault()
    if (!oForm.requirement_description.trim()) return
    setSaving(true)
    const payload = { company_id: id, primary_contact_id: oForm.primary_contact_id || null, name: oForm.name.trim() || (oForm.requirement_description.trim().slice(0, 80)), stage: oForm.stage || 'requirement', deal_size: oForm.deal_size ? Number(oForm.deal_size) : null, requirement_description: oForm.requirement_description.trim(), solution: oForm.solution.trim() || null, expected_close_date: oForm.expected_close_date || null, next_action: oForm.next_action.trim() || null, next_action_due: oForm.next_action_due || null, state: 'active', metadata: {} }
    const { data, error } = await supabase.from('opportunities').insert(payload).select('id').single()
    if (!error && oForm.next_action.trim() && oForm.next_action_due) {
      await supabase.from('tasks').insert({ company_id: id, title: ('Opp next action: ' + oForm.next_action).slice(0, 200), description: 'From opportunity: ' + (payload.name || ''), due_at: oForm.next_action_due, priority: 'medium', status: 'open', source: 'user', state: 'active' })
    }
    setSaving(false)
    if (!error) { setShowOpp(false); load() }
    else alert(error.message)
  }

  async function saveEditTask(e) {
    e.preventDefault()
    if (!editTask?.id) return
    setSaving(true)
    const priority = ['low', 'medium', 'high'].includes(editTask.priority) ? editTask.priority : 'medium'
    const { error } = await supabase.from('tasks').update({ title: editTask.title, description: editTask.description || null, priority, status: editTask.status, due_at: editTask.due_at || null }).eq('id', editTask.id)
    setSaving(false)
    if (!error) { setEditTask(null); load() }
    else alert(error.message)
  }

  async function saveEditMeeting(e) {
    e.preventDefault()
    if (!editMeeting?.id) return
    setSaving(true)
    const { error } = await supabase.from('meetings_calls').update({ type: editMeeting.type, subject: editMeeting.subject, description: editMeeting.description || null, outcome: editMeeting.outcome || null, next_action: editMeeting.next_action || null, status: editMeeting.status }).eq('id', editMeeting.id)
    setSaving(false)
    if (!error) { setEditMeeting(null); load() }
    else alert(error.message)
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!company) return <div className="empty">Company not found.</div>

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: `Contacts (${contacts.length})` },
    { id: 'tasks', label: `Tasks (${tasks.filter(t => isTaskOpen(t.status)).length})` },
    { id: 'meetings', label: `Meetings (${meetings.length})` },
    { id: 'opps', label: `Opportunities (${opps.length})` },
  ]

  return (
    <div style={{ padding: 28 }}>
      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={() => go('companies')}>← Companies</button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
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
          <div><strong>Locations:</strong> {(Array.isArray(company.metadata?.locations) ? company.metadata.locations.filter(l => (l.city || l.address || l.label || l.pincode || '').trim()).length : 0) + ((company.address || company.city || company.pincode) ? 1 : 0)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} type="button" className={'btn' + (tab === t.id ? ' primary' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card">
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Primary address</h2>
          <p style={{ fontSize: 13, color: '#334155' }}>{company.address || '—'}</p>
          {Array.isArray(company.metadata?.locations) && company.metadata.locations.length > 0 && (
            <>
              <h2 style={{ fontSize: 15, margin: '16px 0 8px' }}>Other locations (service area)</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {company.metadata.locations.map((l, i) => (
                  <li key={i}>
                    {[l.label, l.address, l.city, l.pincode].filter(Boolean).join(' · ') || '—'}
                  </li>
                ))}
              </ul>
            </>
          )}
          {company.notes && <p style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>{company.notes}</p>}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Title</th><th>Role</th><th>Email</th><th>Phone</th><th></th></tr></thead>
            <tbody>
              {contacts.length === 0 ? <tr><td colSpan={6} className="empty">No contacts</td></tr> : contacts.map(ct => (
                <tr key={ct.id}>
                  <td style={{ fontWeight: 600 }}>{ct.full_name}</td>
                  <td>{ct.job_title || '—'}</td>
                  <td>{ct.role || '—'}</td>
                  <td>{ct.email || '—'}</td>
                  <td>{[ct.phone, ct.phone_mobile_2, ct.phone_landline].filter(Boolean).join(' / ') || '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => openEditContact(ct)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {tasks.length === 0 ? <tr><td colSpan={5} className="empty">No tasks</td></tr> : tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.title}</td>
                  <td><Badge>{t.priority}</Badge></td>
                  <td>{t.status}</td>
                  <td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setEditTask({ ...t, due_at: (t.due_at || '').toString().slice(0, 10) })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Type</th><th>Subject</th><th>Status</th><th>When</th><th></th></tr></thead>
            <tbody>
              {meetings.length === 0 ? <tr><td colSpan={5} className="empty">No meetings / calls</td></tr> : meetings.map(m => (
                <tr key={m.id}>
                  <td><Badge tone="blue">{m.type}</Badge></td>
                  <td style={{ fontWeight: 600 }}>{m.subject}</td>
                  <td>{m.status || 'open'}</td>
                  <td>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString() : '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setEditMeeting({ ...m })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'opps' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Stage</th><th>Deal size</th><th>Next action</th></tr></thead>
            <tbody>
              {opps.length === 0 ? <tr><td colSpan={4} className="empty">No opportunities</td></tr> : opps.map(o => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => go('opportunities')}>
                  <td style={{ fontWeight: 600, color: '#2563eb' }}>{o.name}</td>
                  <td>{oppStageLabel(o.stage)}</td>
                  <td>{o.deal_size != null ? Number(o.deal_size).toLocaleString() : '—'}</td>
                  <td>{o.next_action || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <Field label="Board / CIN"><input className="input" value={eForm.board_no || ''} onChange={e => setEForm({ ...eForm, board_no: e.target.value })} /></Field>
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
            <div style={{ margin: '8px 0', padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Additional locations (service area)</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Sites beyond the primary address — address, city and pincode for each.</div>
              {(eForm.locations || []).map((loc, idx) => (
                <div key={idx} style={{ marginBottom: 12, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#334155' }}>Location {idx + 1}</div>
                    <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setEForm({ ...eForm, locations: (eForm.locations || []).filter((_, i) => i !== idx) })}>Remove</button>
                  </div>
                  <Field label="Site / label (optional)">
                    <input className="input" value={loc.label || ''} placeholder="e.g. Plant 2, Branch office" onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], label: e.target.value }; setEForm({ ...eForm, locations }) }} />
                  </Field>
                  <Field label="Address">
                    <textarea className="input" rows={2} value={loc.address || ''} placeholder="Street / area" onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], address: e.target.value }; setEForm({ ...eForm, locations }) }} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="City">
                      <input className="input" value={loc.city || ''} placeholder="City" onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], city: e.target.value }; setEForm({ ...eForm, locations }) }} />
                    </Field>
                    <Field label="Pincode">
                      <input className="input" value={loc.pincode || ''} placeholder="e.g. 560001" onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], pincode: e.target.value }; setEForm({ ...eForm, locations }) }} />
                    </Field>
                  </div>
                </div>
              ))}
              <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setEForm({ ...eForm, locations: [...(eForm.locations || []), { label: '', address: '', city: '', pincode: '' }] })}>+ Add location</button>
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

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={560}>
          <form onSubmit={addOpp}>
            <Field label="Name"><input className="input" value={oForm.name} onChange={e => setOForm({ ...oForm, name: e.target.value })} placeholder="Optional short name" /></Field>
            <Field label="Requirement *"><textarea className="input" required rows={3} value={oForm.requirement_description} onChange={e => setOForm({ ...oForm, requirement_description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Stage"><select className="input" value={oForm.stage} onChange={e => setOForm({ ...oForm, stage: e.target.value })}>{OPP_STAGES.filter(s => s !== 'won' && s !== 'lost').map(s => <option key={s} value={s}>{oppStageLabel(s)}</option>)}</select></Field>
              <Field label="Deal size (estimate)"><input className="input" type="number" value={oForm.deal_size} onChange={e => setOForm({ ...oForm, deal_size: e.target.value })} /></Field>
            </div>
            <Field label="Solution"><textarea className="input" rows={2} value={oForm.solution} onChange={e => setOForm({ ...oForm, solution: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Expected close"><input className="input" type="date" value={oForm.expected_close_date} onChange={e => setOForm({ ...oForm, expected_close_date: e.target.value })} /></Field>
              <Field label="Primary contact"><select className="input" value={oForm.primary_contact_id} onChange={e => setOForm({ ...oForm, primary_contact_id: e.target.value })}><option value="">—</option>{contacts.map(ct => <option key={ct.id} value={ct.id}>{ct.full_name}</option>)}</select></Field>
            </div>
            <Field label="Next action"><input className="input" value={oForm.next_action} onChange={e => setOForm({ ...oForm, next_action: e.target.value })} /></Field>
            <Field label="Next action due"><input className="input" type="date" value={oForm.next_action_due} onChange={e => setOForm({ ...oForm, next_action_due: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {showContact && (
        <Modal title={editingContactId ? 'Edit contact' : 'Add contact'} onClose={() => setShowContact(false)}>
          <form onSubmit={saveContact}>
            <Field label="Full name *"><input className="input" required value={cForm.full_name} onChange={e => setCForm({ ...cForm, full_name: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Job title"><input className="input" value={cForm.job_title} onChange={e => setCForm({ ...cForm, job_title: e.target.value })} /></Field>
              <Field label="Role"><select className="input" value={cForm.role} onChange={e => setCForm({ ...cForm, role: e.target.value })}><option value="">—</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></Field>
            </div>
            <Field label="Email"><input className="input" type="email" value={cForm.email} onChange={e => setCForm({ ...cForm, email: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Mobile"><input className="input" value={cForm.phone} onChange={e => setCForm({ ...cForm, phone: e.target.value })} /></Field>
              <Field label="Mobile 2"><input className="input" value={cForm.phone_mobile_2} onChange={e => setCForm({ ...cForm, phone_mobile_2: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Landline"><input className="input" value={cForm.phone_landline} onChange={e => setCForm({ ...cForm, phone_landline: e.target.value })} /></Field>
              <Field label="Extension"><input className="input" value={cForm.phone_extension} onChange={e => setCForm({ ...cForm, phone_extension: e.target.value })} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowContact(false)} label={editingContactId ? 'Save contact' : 'Add contact'} />
          </form>
        </Modal>
      )}

      {editTask && (
        <Modal title="Edit task" onClose={() => setEditTask(null)}>
          <form onSubmit={saveEditTask}>
            <Field label="Title *"><input className="input" required value={editTask.title || ''} onChange={e => setEditTask({ ...editTask, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={2} value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Priority"><select className="input" value={editTask.priority || 'medium'} onChange={e => setEditTask({ ...editTask, priority: e.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></Field>
              <Field label="Status"><select className="input" value={editTask.status || 'open'} onChange={e => setEditTask({ ...editTask, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Done</option><option value="cancelled">Cancelled</option></select></Field>
              <Field label="Due"><input className="input" type="date" value={editTask.due_at || ''} onChange={e => setEditTask({ ...editTask, due_at: e.target.value })} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setEditTask(null)} label="Save task" />
          </form>
        </Modal>
      )}

      {editMeeting && (
        <Modal title="Edit call / meeting" onClose={() => setEditMeeting(null)}>
          <form onSubmit={saveEditMeeting}>
            <Field label="Type"><select className="input" value={editMeeting.type || 'call'} onChange={e => setEditMeeting({ ...editMeeting, type: e.target.value })}><option value="call">call</option><option value="meeting">meeting</option><option value="visit">visit</option><option value="message">message</option></select></Field>
            <Field label="Subject *"><input className="input" required value={editMeeting.subject || ''} onChange={e => setEditMeeting({ ...editMeeting, subject: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={editMeeting.outcome || ''} onChange={e => setEditMeeting({ ...editMeeting, outcome: e.target.value })} /></Field>
            <Field label="Next action"><input className="input" value={editMeeting.next_action || ''} onChange={e => setEditMeeting({ ...editMeeting, next_action: e.target.value })} /></Field>
            <Field label="Status"><select className="input" value={editMeeting.status || 'open'} onChange={e => setEditMeeting({ ...editMeeting, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Done</option><option value="cancelled">Cancelled</option></select></Field>
            <Actions saving={saving} onCancel={() => setEditMeeting(null)} label="Save" />
          </form>
        </Modal>
      )}

      {showResearch && (
        <Modal title="Research" onClose={() => setShowResearch(false)}>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Use company actions and Tasks tab for research work items.</p>
          <button type="button" className="btn" onClick={() => setShowResearch(false)}>Close</button>
        </Modal>
      )}
    </div>
  )
}
