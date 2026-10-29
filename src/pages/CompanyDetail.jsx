import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, RESEARCH_STATUS, ROLES, OPP_STAGES, MISSING_COMPANY_FIELDS, isTaskOpen, isTaskClosed, lifecycleLabel, oppStageLabel, NOT_QUALIFIED_REASONS, notQualifiedReasonLabel } from '../constants'
import { Modal, Field, Actions, Badge } from '../ui'
import {
  EMPTY_OPP_FORM,
  OpportunityCreateFields,
  OpportunityDetail,
  createOppWithOptionalTask,
} from '../components/OpportunityShared'

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
  const [mForm, setMForm] = useState({ type: 'call', subject: '', description: '', outcome: '', next_action: '', scheduled_at: '', status: 'open', contact_id: '' })
  const [oForm, setOForm] = useState({ ...EMPTY_OPP_FORM })
  const [selectedOpp, setSelectedOpp] = useState(null)
  const [eForm, setEForm] = useState({})
  const [sigForm, setSigForm] = useState({ signal_type: 'news', observation: '', source: '' })
  const [researchBusy, setResearchBusy] = useState(false)
  const [researchMsg, setResearchMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNotQualified, setShowNotQualified] = useState(false)
  const [nqReason, setNqReason] = useState('')

  useEffect(() => { if (id) load() }, [id])

  async function load() {
    setLoading(true)
    const [c, ct, t, m, o, s] = await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
      supabase.from('tasks').select('*').eq('company_id', id).neq('state', 'deleted').order('due_at', { ascending: true }),
      supabase.from('meetings_calls').select('*').eq('company_id', id).neq('state', 'deleted').order('scheduled_at', { ascending: false }).limit(20),
      supabase.from('opportunities').select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id').eq('company_id', id).neq('state', 'deleted').order('created_at', { ascending: false }),
      supabase.from('signals').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20)
    ])
    setCompany(c.data); setContacts(ct.data || []); setTasks(t.data || []); setMeetings(m.data || []); setOpps(o.data || []); setSignals(s.data || []); setLoading(false)
  }

  function openEdit() {
    setEForm({
      name: company.name || '',
      legal_name: company.legal_name || '',
      address: company.address || '',
      city: company.city || '',
      pincode: company.pincode || '',
      hq_location: company.hq_location || '',
      country: company.country || '',
      employee_count: company.employee_count || company.enrichment_employee_count || '',
      board_no: company.board_no || '',
      website: company.website || '',
      email: company.email || '',
      gst_no: company.gst_no || '',
      industry: company.industry || '',
      lifecycle_status: company.lifecycle_status || 'prospect_no_contact',
      research_status: company.research_status || 'NOT_RESEARCHED',
      last_billed_at: (company.last_billed_at || '').toString().slice(0, 10),
      notes: company.notes || '',
      locations: Array.isArray(company.metadata?.locations)
        ? company.metadata.locations.map(l => ({ label: l.label || '', address: l.address || '', city: l.city || '', pincode: l.pincode || '' }))
        : [],
    })
    setShowEdit(true)
  }

  async function saveCompany(e) {
    e.preventDefault()
    if (!eForm.name.trim()) return
    const gst = (eForm.gst_no || '').trim().toUpperCase()
    if (gst && !/^[0-9A-Z]{15}$/.test(gst)) {
      alert('GST No should be 15 characters. Leave blank if unknown.')
      return
    }
    setSaving(true)
    const payload = {
      name: eForm.name.trim(),
      legal_name: (eForm.legal_name || '').trim() || null,
      address: (eForm.address || '').trim() || null,
      city: (eForm.city || '').trim() || null,
      pincode: (eForm.pincode || '').trim() || null,
      hq_location: (eForm.hq_location || '').trim() || null,
      country: (eForm.country || '').trim() || null,
      employee_count: eForm.employee_count ? Number(eForm.employee_count) : null,
      board_no: (eForm.board_no || '').trim() || null,
      website: (eForm.website || '').trim() || null,
      email: (eForm.email || '').trim() || null,
      gst_no: gst || null,
      industry: (eForm.industry || '').trim() || null,
      lifecycle_status: eForm.lifecycle_status,
      research_status: eForm.research_status,
      last_billed_at: eForm.last_billed_at || null,
      notes: (eForm.notes || '').trim() || null,
      metadata: {
        ...(company.metadata || {}),
        locations: (eForm.locations || [])
          .filter(l => (l.city || l.label || l.address || l.pincode || '').trim())
          .map(l => ({
            label: (l.label || '').trim(),
            address: (l.address || '').trim(),
            city: (l.city || '').trim(),
            pincode: (l.pincode || '').trim(),
          })),
      },
    }
    let { error } = await supabase.from('companies').update(payload).eq('id', id)
    if (error && /pincode|column/i.test(error.message)) {
      delete payload.pincode
      ;({ error } = await supabase.from('companies').update(payload).eq('id', id))
    }
    setSaving(false)
    if (!error) {
      setShowEdit(false)
      setCompany({ ...company, ...payload })
    } else alert(error.message)
  }

  function onLifecycleChange(val) {
    if (val === 'not_qualified') {
      setNqReason(company.not_qualified_reason || company.metadata?.not_qualified_reason || '')
      setShowNotQualified(true)
      return
    }
    updateLifecycle(val, null)
  }

  async function updateLifecycle(val, notQualifiedReason) {
    const payload = { lifecycle_status: val }
    if (val === 'not_qualified') {
      if (!notQualifiedReason) {
        alert('Select a reason for Not Qualified.')
        return
      }
      payload.not_qualified_reason = notQualifiedReason
      payload.metadata = { ...(company.metadata || {}), not_qualified_reason: notQualifiedReason }
    } else {
      payload.not_qualified_reason = null
    }
    let { error } = await supabase.from('companies').update(payload).eq('id', id)
    if (error && /not_qualified_reason|column/i.test(error.message)) {
      delete payload.not_qualified_reason
      ;({ error } = await supabase.from('companies').update(payload).eq('id', id))
    }
    if (error) {
      alert('Could not change lifecycle: ' + error.message + ' — Run sql/011_not_qualified_lifecycle.sql in Supabase if Not Qualified is missing.')
      return
    }
    setCompany({
      ...company,
      lifecycle_status: val,
      not_qualified_reason: val === 'not_qualified' ? notQualifiedReason : null,
      metadata: payload.metadata || company.metadata,
    })
    setShowNotQualified(false)
  }

  async function saveNotQualified(e) {
    e.preventDefault()
    if (!nqReason) { alert('Select a reason.'); return }
    await updateLifecycle('not_qualified', nqReason)
  }

  function openAddContact() {
    setEditingContactId(null)
    setCForm({ full_name: '', job_title: '', role: '', email: '', phone: '', phone_mobile_2: '', phone_landline: '', phone_extension: '' })
    setShowContact(true)
  }

  function openEditContact(ct) {
    setEditingContactId(ct.id)
    setCForm({
      full_name: ct.full_name || '', job_title: ct.job_title || '', role: ct.role || '',
      email: ct.email || '', phone: ct.phone || '', phone_mobile_2: ct.phone_mobile_2 || '',
      phone_landline: ct.phone_landline || '', phone_extension: ct.phone_extension || '',
    })
    setShowContact(true)
  }

  async function saveContact(e) {
    e.preventDefault()
    if (!cForm.full_name.trim()) return
    setSaving(true)
    const payload = {
      full_name: cForm.full_name.trim(), job_title: cForm.job_title.trim() || null, role: cForm.role || null,
      email: cForm.email.trim() || null, phone: cForm.phone.trim() || null,
      phone_mobile_2: cForm.phone_mobile_2.trim() || null, phone_landline: cForm.phone_landline.trim() || null,
      phone_extension: cForm.phone_extension.trim() || null,
    }
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
    if (!mForm.subject.trim()) { alert('Subject is required.'); return }
    setSaving(true)
    const payload = {
      company_id: id, contact_id: mForm.contact_id || null, type: mForm.type || 'call',
      subject: mForm.subject.trim(), description: (mForm.description || '').trim() || null,
      outcome: (mForm.outcome || '').trim() || null, next_action: (mForm.next_action || '').trim() || null,
      scheduled_at: mForm.scheduled_at ? new Date(mForm.scheduled_at).toISOString() : new Date().toISOString(),
      status: mForm.status || 'open', state: 'active', metadata: {},
    }
    let { error } = await supabase.from('meetings_calls').insert(payload)
    if (error && /metadata|column/i.test(error.message)) {
      const { metadata, ...rest } = payload
      ;({ error } = await supabase.from('meetings_calls').insert(rest))
    }
    setSaving(false)
    if (!error) {
      setShowMeeting(false)
      setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', scheduled_at: '', status: 'open', contact_id: '' })
      load()
    } else alert('Save failed: ' + error.message)
  }

  async function addOpp(e) {
    e.preventDefault()
    if (!oForm.requirement_description.trim()) return
    setSaving(true)
    const { error } = await createOppWithOptionalTask(oForm, id)
    setSaving(false)
    if (!error) {
      setShowOpp(false)
      setOForm({ ...EMPTY_OPP_FORM })
      load()
    } else alert(error.message)
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
    if (!editMeeting.subject?.trim()) { alert('Subject is required.'); return }
    setSaving(true)
    const payload = {
      type: editMeeting.type || 'call', subject: editMeeting.subject.trim(),
      description: (editMeeting.description || '').trim() || null, outcome: (editMeeting.outcome || '').trim() || null,
      next_action: (editMeeting.next_action || '').trim() || null,
      scheduled_at: editMeeting.scheduled_at ? new Date(editMeeting.scheduled_at).toISOString() : null,
      status: editMeeting.status || 'open',
    }
    const { error } = await supabase.from('meetings_calls').update(payload).eq('id', editMeeting.id)
    setSaving(false)
    if (!error) { setEditMeeting(null); load() }
    else alert('Update failed: ' + error.message)
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
              <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }} value={company.lifecycle_status || 'prospect_no_contact'} onChange={e => onLifecycleChange(e.target.value)}>
                {LIFECYCLE.map(s => <option key={s} value={s}>{lifecycleLabel(s)}</option>)}
              </select>
              {company.lifecycle_status === 'not_qualified' && (
                <Badge tone="gray">{notQualifiedReasonLabel(company.not_qualified_reason || company.metadata?.not_qualified_reason)}</Badge>
              )}
              <Badge>{company.research_status || 'NOT_RESEARCHED'}</Badge>
              {company.industry && <Badge>{company.industry}</Badge>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={openEdit}>Edit Company</button>
            <button className="btn primary" onClick={() => setShowResearch(true)}>Initiate Research</button>
            <button className="btn" onClick={openAddContact}>+ Contact</button>
            <button className="btn" onClick={() => setShowTask(true)}>+ Task</button>
            <button className="btn" onClick={() => { setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', scheduled_at: new Date().toISOString().slice(0, 16), status: 'open', contact_id: '' }); setShowMeeting(true) }}>+ Call / Meeting</button>
            <button className="btn" onClick={() => { setOForm({ ...EMPTY_OPP_FORM }); setShowOpp(true) }}>+ New opportunity</button>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, fontSize: 13 }}>
          <div><strong>Full name:</strong> {company.legal_name || '—'}</div>
          <div><strong>GST:</strong> {company.gst_no || '—'}</div>
          <div><strong>Board Tele No:</strong> {company.board_no || '—'}</div>
          <div><strong>Pincode:</strong> {company.pincode || '—'}</div>
          <div><strong>Employees:</strong> {company.employee_count || company.enrichment_employee_count || '—'}</div>
          <div><strong>Website:</strong> {company.website ? <a href={company.website.startsWith('http') ? company.website : 'https://' + company.website} target="_blank" rel="noreferrer">{company.website}</a> : '—'}</div>
          <div><strong>Email:</strong> {company.email || '—'}</div>
          <div><strong>City:</strong> {company.city || '—'}</div>
          <div><strong>HQ:</strong> {company.hq_location || '—'}</div>
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
              <h2 style={{ fontSize: 15, margin: '16px 0 8px' }}>Other locations</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {company.metadata.locations.map((l, i) => (
                  <li key={i}>{[l.label, l.address, l.city, l.pincode].filter(Boolean).join(' · ') || '—'}</li>
                ))}
              </ul>
            </>
          )}
          {company.notes && (
            <>
              <h2 style={{ fontSize: 15, margin: '16px 0 8px' }}>Notes</h2>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{company.notes}</p>
            </>
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th></th></tr></thead>
            <tbody>
              {contacts.length === 0 ? <tr><td colSpan={5} className="empty">No contacts</td></tr> : contacts.map(ct => (
                <tr key={ct.id}>
                  <td style={{ fontWeight: 600 }}>{ct.full_name}</td>
                  <td>{ct.role || ct.job_title || '—'}</td>
                  <td>{ct.email || '—'}</td>
                  <td>{ct.phone || '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => openEditContact(ct)}>Edit</button></td>
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
                  <td><button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setEditTask({ ...t, due_at: (t.due_at || '').toString().slice(0, 10) })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Type</th><th>Subject</th><th>Outcome</th><th>When</th><th></th></tr></thead>
            <tbody>
              {meetings.length === 0 ? <tr><td colSpan={5} className="empty">No meetings</td></tr> : meetings.map(m => (
                <tr key={m.id}>
                  <td><Badge tone="blue">{m.type}</Badge></td>
                  <td style={{ fontWeight: 600 }}>{m.subject}</td>
                  <td>{m.outcome || '—'}</td>
                  <td>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setEditMeeting({ ...m, scheduled_at: m.scheduled_at ? new Date(m.scheduled_at).toISOString().slice(0, 16) : '' })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'opps' && (
        <div className="card">
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
            Click a row to open the same opportunity form as the Opportunities tab (edit, stages, quotations with items / sub-items).
          </p>
          <table className="table">
            <thead><tr><th>Name</th><th>Stage</th><th>Value</th></tr></thead>
            <tbody>
              {opps.length === 0 ? <tr><td colSpan={3} className="empty">No opportunities</td></tr> : opps.map(o => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOpp(o)}>
                  <td style={{ fontWeight: 600, color: '#2563eb' }}>{o.name || '—'}</td>
                  <td><Badge>{oppStageLabel(o.stage)}</Badge></td>
                  <td>{o.deal_size != null ? '₹' + Number(o.deal_size).toLocaleString('en-IN') : '—'}</td>
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
              <Field label="Pincode"><input className="input" value={eForm.pincode || ''} onChange={e => setEForm({ ...eForm, pincode: e.target.value })} /></Field>
              <Field label="Country"><input className="input" value={eForm.country || ''} onChange={e => setEForm({ ...eForm, country: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="HQ location"><input className="input" value={eForm.hq_location || ''} onChange={e => setEForm({ ...eForm, hq_location: e.target.value })} /></Field>
              <Field label="Employees"><input className="input" type="number" value={eForm.employee_count || ''} onChange={e => setEForm({ ...eForm, employee_count: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Board Tele No"><input className="input" value={eForm.board_no || ''} onChange={e => setEForm({ ...eForm, board_no: e.target.value })} /></Field>
              <Field label="GST No"><input className="input" value={eForm.gst_no || ''} onChange={e => setEForm({ ...eForm, gst_no: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Website"><input className="input" value={eForm.website || ''} onChange={e => setEForm({ ...eForm, website: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={eForm.email || ''} onChange={e => setEForm({ ...eForm, email: e.target.value })} /></Field>
            </div>
            <Field label="Industry"><input className="input" value={eForm.industry || ''} onChange={e => setEForm({ ...eForm, industry: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={eForm.notes || ''} onChange={e => setEForm({ ...eForm, notes: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowEdit(false)} label="Save company" />
          </form>
        </Modal>
      )}

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={560}>
          <form onSubmit={addOpp}>
            <OpportunityCreateFields form={oForm} setForm={setOForm} contacts={contacts} />
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {selectedOpp && (
        <Modal title={selectedOpp.name || 'Opportunity'} onClose={() => setSelectedOpp(null)} width={640}>
          <OpportunityDetail
            opportunity={{ ...selectedOpp, companies: { name: company?.name } }}
            contacts={contacts}
            onClose={() => setSelectedOpp(null)}
            onSaved={() => { setSelectedOpp(null); load() }}
          />
        </Modal>
      )}

      {showContact && (
        <Modal title={editingContactId ? 'Edit contact' : 'Add contact'} onClose={() => setShowContact(false)}>
          <form onSubmit={saveContact}>
            <Field label="Full name *"><input className="input" required value={cForm.full_name} onChange={e => setCForm({ ...cForm, full_name: e.target.value })} /></Field>
            <Field label="Job title"><input className="input" value={cForm.job_title} onChange={e => setCForm({ ...cForm, job_title: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={cForm.role} onChange={e => setCForm({ ...cForm, role: e.target.value })}><option value="">—</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></Field>
            <Field label="Email"><input className="input" value={cForm.email} onChange={e => setCForm({ ...cForm, email: e.target.value })} /></Field>
            <Field label="Mobile"><input className="input" value={cForm.phone} onChange={e => setCForm({ ...cForm, phone: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowContact(false)} label="Save contact" />
          </form>
        </Modal>
      )}

      {showTask && (
        <Modal title="New task" onClose={() => setShowTask(false)}>
          <form onSubmit={addTask}>
            <Field label="Title *"><input className="input" required value={tForm.title} onChange={e => setTForm({ ...tForm, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={2} value={tForm.description} onChange={e => setTForm({ ...tForm, description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Priority"><select className="input" value={tForm.priority} onChange={e => setTForm({ ...tForm, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
              <Field label="Due"><input className="input" type="date" value={tForm.due_at} onChange={e => setTForm({ ...tForm, due_at: e.target.value })} /></Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowTask(false)} label="Create task" />
          </form>
        </Modal>
      )}

      {showMeeting && (
        <Modal title="Log call / meeting" onClose={() => setShowMeeting(false)} width={560}>
          <form onSubmit={addMeeting}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type"><select className="input" value={mForm.type} onChange={e => setMForm({ ...mForm, type: e.target.value })}><option value="call">Call</option><option value="meeting">Meeting</option><option value="visit">Visit</option><option value="message">Message</option></select></Field>
              <Field label="Status"><select className="input" value={mForm.status} onChange={e => setMForm({ ...mForm, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="done">Done</option></select></Field>
            </div>
            <Field label="Subject *"><input className="input" required value={mForm.subject} onChange={e => setMForm({ ...mForm, subject: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={mForm.description} onChange={e => setMForm({ ...mForm, description: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={mForm.outcome} onChange={e => setMForm({ ...mForm, outcome: e.target.value })} /></Field>
            <Field label="Next action"><input className="input" value={mForm.next_action} onChange={e => setMForm({ ...mForm, next_action: e.target.value })} /></Field>
            <Field label="When"><input className="input" type="datetime-local" value={mForm.scheduled_at} onChange={e => setMForm({ ...mForm, scheduled_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowMeeting(false)} label="Save" />
          </form>
        </Modal>
      )}

      {editTask && (
        <Modal title="Edit task" onClose={() => setEditTask(null)}>
          <form onSubmit={saveEditTask}>
            <Field label="Title"><input className="input" value={editTask.title || ''} onChange={e => setEditTask({ ...editTask, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={2} value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Priority"><select className="input" value={editTask.priority || 'medium'} onChange={e => setEditTask({ ...editTask, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
              <Field label="Status"><select className="input" value={editTask.status || 'open'} onChange={e => setEditTask({ ...editTask, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="done">Done</option></select></Field>
            </div>
            <Field label="Due"><input className="input" type="date" value={editTask.due_at || ''} onChange={e => setEditTask({ ...editTask, due_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setEditTask(null)} label="Save" />
          </form>
        </Modal>
      )}

      {editMeeting && (
        <Modal title="Edit call / meeting" onClose={() => setEditMeeting(null)} width={560}>
          <form onSubmit={saveEditMeeting}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type"><select className="input" value={editMeeting.type || 'call'} onChange={e => setEditMeeting({ ...editMeeting, type: e.target.value })}><option value="call">Call</option><option value="meeting">Meeting</option><option value="visit">Visit</option><option value="message">Message</option></select></Field>
              <Field label="Status"><select className="input" value={editMeeting.status || 'open'} onChange={e => setEditMeeting({ ...editMeeting, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="done">Done</option></select></Field>
            </div>
            <Field label="Subject *"><input className="input" required value={editMeeting.subject || ''} onChange={e => setEditMeeting({ ...editMeeting, subject: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={editMeeting.description || ''} onChange={e => setEditMeeting({ ...editMeeting, description: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={editMeeting.outcome || ''} onChange={e => setEditMeeting({ ...editMeeting, outcome: e.target.value })} /></Field>
            <Field label="Next action"><input className="input" value={editMeeting.next_action || ''} onChange={e => setEditMeeting({ ...editMeeting, next_action: e.target.value })} /></Field>
            <Field label="When"><input className="input" type="datetime-local" value={editMeeting.scheduled_at || ''} onChange={e => setEditMeeting({ ...editMeeting, scheduled_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setEditMeeting(null)} label="Save" />
          </form>
        </Modal>
      )}

      {showNotQualified && (
        <Modal title="Not Qualified — reason" onClose={() => setShowNotQualified(false)}>
          <form onSubmit={saveNotQualified}>
            <Field label="Reason *">
              <select className="input" required value={nqReason} onChange={e => setNqReason(e.target.value)}>
                <option value="">Select…</option>
                {NOT_QUALIFIED_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Actions saving={saving} onCancel={() => setShowNotQualified(false)} label="Save" />
          </form>
        </Modal>
      )}

      {showResearch && (
        <Modal title="Research" onClose={() => setShowResearch(false)}>
          <p style={{ fontSize: 13, color: '#64748b' }}>Queue research for this company from Research & Signals, or log a signal below.</p>
          <form onSubmit={async e => {
            e.preventDefault()
            setResearchBusy(true)
            const { error } = await supabase.from('signals').insert({
              company_id: id, signal_type: sigForm.signal_type, observation: sigForm.observation, source: sigForm.source || null, state: 'active',
            })
            setResearchBusy(false)
            if (!error) { setShowResearch(false); setSigForm({ signal_type: 'news', observation: '', source: '' }); load() }
            else alert(error.message)
          }}>
            <Field label="Signal type"><select className="input" value={sigForm.signal_type} onChange={e => setSigForm({ ...sigForm, signal_type: e.target.value })}><option value="news">News</option><option value="hiring">Hiring</option><option value="funding">Funding</option><option value="other">Other</option></select></Field>
            <Field label="Observation *"><textarea className="input" required rows={3} value={sigForm.observation} onChange={e => setSigForm({ ...sigForm, observation: e.target.value })} /></Field>
            <Field label="Source"><input className="input" value={sigForm.source} onChange={e => setSigForm({ ...sigForm, source: e.target.value })} /></Field>
            <Actions saving={researchBusy} onCancel={() => setShowResearch(false)} label="Save signal" />
          </form>
        </Modal>
      )}
    </div>
  )
}
