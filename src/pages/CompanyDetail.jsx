import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, ROLES, OPP_STAGES, MISSING_COMPANY_FIELDS, isTaskOpen, isTaskClosed, lifecycleLabel, oppStageLabel, NOT_QUALIFIED_REASONS, notQualifiedReasonLabel, SIGNAL_TYPES } from '../constants'
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('overview')
  const [showContact, setShowContact] = useState(false)
  const [editingContactId, setEditingContactId] = useState(null)
  const [showTask, setShowTask] = useState(false)
  const [showMeeting, setShowMeeting] = useState(false)
  const [showOpp, setShowOpp] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showNotQualified, setShowNotQualified] = useState(false)
  const [showResearch, setShowResearch] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [editMeeting, setEditMeeting] = useState(null)
  const [signals, setSignals] = useState([])
  const [cForm, setCForm] = useState({ full_name: '', job_title: '', role: '', email: '', phone: '', phone_mobile_2: '', phone_landline: '', phone_extension: '' })
  const [tForm, setTForm] = useState({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' })
  const [mForm, setMForm] = useState({ type: 'call', subject: '', description: '', outcome: '', next_action: '', scheduled_at: '', status: 'open', contact_id: '' })
  const [sigForm, setSigForm] = useState({ signal_type: 'news', observation: '', source: '' })
  const [researchBusy, setResearchBusy] = useState(false)
  const [researchMsg, setResearchMsg] = useState('')
  const [oForm, setOForm] = useState({ ...EMPTY_OPP_FORM })
  const [selectedOpp, setSelectedOpp] = useState(null)
  const [eForm, setEForm] = useState({})
  const [nqReason, setNqReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedOpp(null)
    setShowOpp(false)
    setShowNotQualified(false)
    setShowResearch(false)
    setEditTask(null)
    setEditMeeting(null)
    setTab('overview')
    setLoadError('')
    setResearchMsg('')
    if (id) load()
    else { setCompany(null); setLoading(false) }
  }, [id])

  async function load() {
    if (!id) return
    setLoading(true)
    setLoadError('')
    try {
      const [c, ct, t, m, o, s] = await Promise.all([
        supabase.from('companies').select('*').eq('id', id).single(),
        supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
        supabase.from('tasks').select('*').eq('company_id', id).neq('state', 'deleted').order('due_at', { ascending: true }),
        supabase.from('meetings_calls').select('*').eq('company_id', id).neq('state', 'deleted').order('scheduled_at', { ascending: false }).limit(20),
        supabase.from('opportunities').select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id').eq('company_id', id).neq('state', 'deleted').order('created_at', { ascending: false }),
        supabase.from('signals').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
      ])
      if (c.error) { setLoadError(c.error.message || 'Could not load company'); setCompany(null) }
      else setCompany(c.data)
      setContacts(ct.data || [])
      setTasks(t.data || [])
      setMeetings(m.data || [])
      setOpps(o.data || [])
      setSignals(s.data || [])
    } catch (ex) {
      setLoadError(ex.message || 'Unexpected error')
      setCompany(null)
    }
    setLoading(false)
  }

  function missingFields() {
    if (!company) return []
    return MISSING_COMPANY_FIELDS.filter(([k]) => !company[k] && !company['enrichment_' + k])
  }

  function searchLinks() {
    const q = encodeURIComponent(company?.name || '')
    return [
      ['Google news', `https://www.google.com/search?q=${q}+news&tbm=nws`],
      ['Google company', `https://www.google.com/search?q=${q}`],
      ['LinkedIn search', `https://www.linkedin.com/search/results/companies/?keywords=${q}`],
    ]
  }

  async function initiateResearch() {
    setResearchBusy(true)
    setResearchMsg('')
    const miss = missingFields().map(([, label]) => label)
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
      metadata: { focus: ['missing_fields', 'news', 'hiring'], initiated_by: 'user' },
    })
    if (qErr) errors.push('Queue: ' + qErr.message)
    await supabase.from('companies').update({ research_status: 'IN_PROGRESS' }).eq('id', id)
    for (const t of toCreate) {
      const { error } = await supabase.from('tasks').insert({
        company_id: id, title: t.title, description: t.description, priority: t.priority,
        status: 'open', state: 'active', source: 'research', metadata: { kind: 'research' },
      })
      if (error) errors.push(t.title + ': ' + error.message)
    }
    setResearchBusy(false)
    if (errors.length) setResearchMsg(errors.join('\n'))
    else setResearchMsg('Research started. Work items prepared (duplicates skipped). Use search links, then log signals below.')
    load()
  }

  async function logSignal(e) {
    e.preventDefault()
    if (!sigForm.observation.trim()) return
    setSaving(true)
    const payload = {
      company_id: id,
      signal_type: sigForm.signal_type || 'news',
      observation: sigForm.observation.trim(),
      source: (sigForm.source || '').trim() || null,
      review_status: 'pending',
      observed_at: new Date().toISOString(),
    }
    let { error } = await supabase.from('signals').insert(payload)
    setSaving(false)
    if (error) alert(error.message)
    else {
      setSigForm({ signal_type: 'news', observation: '', source: '' })
      load()
    }
  }

  async function saveEditTask(e) {
    e.preventDefault()
    if (!editTask?.id) return
    setSaving(true)
    const priority = ['low', 'medium', 'high'].includes(editTask.priority) ? editTask.priority : 'medium'
    const { error } = await supabase.from('tasks').update({
      title: (editTask.title || '').trim(),
      description: (editTask.description || '').trim() || null,
      priority,
      status: editTask.status || 'open',
      due_at: editTask.due_at || null,
    }).eq('id', editTask.id)
    setSaving(false)
    if (!error) { setEditTask(null); load() }
    else alert(error.message)
  }

  async function saveEditMeeting(e) {
    e.preventDefault()
    if (!editMeeting?.id) return
    if (!(editMeeting.subject || '').trim()) { alert('Subject is required.'); return }
    setSaving(true)
    const payload = {
      type: editMeeting.type || 'call',
      subject: editMeeting.subject.trim(),
      description: (editMeeting.description || '').trim() || null,
      outcome: (editMeeting.outcome || '').trim() || null,
      next_action: (editMeeting.next_action || '').trim() || null,
      scheduled_at: editMeeting.scheduled_at ? new Date(editMeeting.scheduled_at).toISOString() : null,
      status: editMeeting.status || 'open',
    }
    const { error } = await supabase.from('meetings_calls').update(payload).eq('id', editMeeting.id)
    setSaving(false)
    if (!error) { setEditMeeting(null); load() }
    else alert('Update failed: ' + error.message)
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
      if (!notQualifiedReason) { alert('Select a reason for Not Qualified.'); return }
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
      alert('Could not change lifecycle: ' + error.message + ' — Run sql/011_not_qualified_lifecycle.sql in Supabase if needed.')
      return
    }
    setCompany({
      ...company,
      lifecycle_status: val,
      not_qualified_reason: val === 'not_qualified' ? notQualifiedReason : null,
      metadata: payload.metadata || company.metadata,
    })
    setShowNotQualified(false)
    setNqReason('')
  }

  async function saveNotQualified(e) {
    e.preventDefault()
    if (!nqReason) { alert('Select a reason.'); return }
    await updateLifecycle('not_qualified', nqReason)
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
      notes: company.notes || '',
      locations: Array.isArray(company.metadata?.locations)
        ? company.metadata.locations.map(l => ({
            label: l.label || '',
            address: l.address || '',
            city: l.city || '',
            pincode: l.pincode || '',
          }))
        : [],
    })
    setShowEdit(true)
  }

  async function saveCompany(e) {
    e.preventDefault()
    if (!eForm.name?.trim()) return
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
      employee_count: eForm.employee_count !== '' && eForm.employee_count != null ? Number(eForm.employee_count) : null,
      board_no: (eForm.board_no || '').trim() || null,
      website: (eForm.website || '').trim() || null,
      email: (eForm.email || '').trim() || null,
      gst_no: gst || null,
      industry: (eForm.industry || '').trim() || null,
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

  async function saveContact(e) {
    e.preventDefault()
    if (!cForm.full_name.trim()) return
    setSaving(true)
    const payload = {
      full_name: cForm.full_name.trim(),
      job_title: (cForm.job_title || '').trim() || null,
      role: cForm.role || null,
      email: (cForm.email || '').trim() || null,
      phone: (cForm.phone || '').trim() || null,
      phone_mobile_2: (cForm.phone_mobile_2 || '').trim() || null,
      phone_landline: (cForm.phone_landline || '').trim() || null,
      phone_extension: (cForm.phone_extension || '').trim() || null,
    }
    let error
    if (editingContactId) ({ error } = await supabase.from('contacts').update(payload).eq('id', editingContactId))
    else ({ error } = await supabase.from('contacts').insert({ company_id: id, ...payload, contact_status: 'active', state: 'active', consent_status: 'unknown', source: 'manual' }))
    if (error && /phone_mobile_2|phone_landline|phone_extension|column/i.test(error.message)) {
      delete payload.phone_mobile_2
      delete payload.phone_landline
      delete payload.phone_extension
      if (editingContactId) ({ error } = await supabase.from('contacts').update(payload).eq('id', editingContactId))
      else ({ error } = await supabase.from('contacts').insert({ company_id: id, ...payload, contact_status: 'active', state: 'active', consent_status: 'unknown', source: 'manual' }))
    }
    setSaving(false)
    if (!error) { setShowContact(false); load() }
    else alert(error.message)
  }

  async function addTask(e) {
    e.preventDefault()
    if (!tForm.title.trim()) return
    setSaving(true)
    const priority = ['low', 'medium', 'high'].includes(tForm.priority) ? tForm.priority : 'medium'
    const { error } = await supabase.from('tasks').insert({
      company_id: id, contact_id: tForm.contact_id || null, title: tForm.title.trim(),
      description: (tForm.description || '').trim() || null, priority, status: 'open',
      due_at: tForm.due_at || null, source: 'user', state: 'active',
    })
    setSaving(false)
    if (!error) { setShowTask(false); setTForm({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' }); load() }
    else alert(error.message)
  }

  async function addMeeting(e) {
    e.preventDefault()
    if (!(mForm.subject || '').trim()) { alert('Subject is required.'); return }
    setSaving(true)
    const payload = {
      company_id: id,
      contact_id: mForm.contact_id || null,
      type: mForm.type || 'call',
      subject: mForm.subject.trim(),
      description: (mForm.description || '').trim() || null,
      outcome: (mForm.outcome || '').trim() || null,
      next_action: (mForm.next_action || '').trim() || null,
      scheduled_at: mForm.scheduled_at ? new Date(mForm.scheduled_at).toISOString() : new Date().toISOString(),
      status: mForm.status || 'open',
      state: 'active',
    }
    let { error } = await supabase.from('meetings_calls').insert(payload)
    setSaving(false)
    if (!error) {
      setShowMeeting(false)
      setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', scheduled_at: '', status: 'open', contact_id: '' })
      load()
    } else alert('Save failed: ' + error.message)
  }

  async function addOpp(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const { data, error } = await createOppWithOptionalTask(oForm, id)
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowOpp(false)
    setOForm({ ...EMPTY_OPP_FORM })
    await load()
  }

  if (loading) return <div className="loading" style={{ padding: 40 }}>Loading company…</div>
  if (!id || loadError || !company) {
    return (
      <div className="empty" style={{ padding: 40 }}>
        {loadError || (!id ? 'No company selected.' : 'Company not found')}
        <div style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => go('companies')}>← Companies</button></div>
      </div>
    )
  }

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
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="input"
                style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}
                value={company.lifecycle_status || 'prospect_no_contact'}
                onChange={e => onLifecycleChange(e.target.value)}
              >
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
            <button type="button" className="btn" onClick={openEdit}>Edit Company</button>
            <button type="button" className="btn primary" onClick={() => { setResearchMsg(''); setShowResearch(true) }}>Initiate Research</button>
            <button type="button" className="btn" onClick={() => { setEditingContactId(null); setCForm({ full_name: '', job_title: '', role: '', email: '', phone: '', phone_mobile_2: '', phone_landline: '', phone_extension: '' }); setShowContact(true) }}>+ Contact</button>
            <button type="button" className="btn" onClick={() => setShowTask(true)}>+ Task</button>
            <button type="button" className="btn" onClick={() => { setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', scheduled_at: new Date().toISOString().slice(0, 16), status: 'open', contact_id: '' }); setShowMeeting(true) }}>+ Call / Meeting</button>
            <button type="button" className="btn primary" onClick={() => { setOForm({ ...EMPTY_OPP_FORM }); setShowOpp(true) }}>+ New opportunity</button>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, fontSize: 13 }}>
          <div><strong>City:</strong> {company.city || '—'}</div>
          <div><strong>Website:</strong> {company.website || '—'}</div>
          <div><strong>Email:</strong> {company.email || '—'}</div>
          <div><strong>GST:</strong> {company.gst_no || '—'}</div>
          <div><strong>Board Tele No:</strong> {company.board_no || '—'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} type="button" className={tab === t.id ? 'btn primary' : 'btn'} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card" style={{ padding: 14 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Primary address</h2>
          <p style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap' }}>{company.address || '—'}</p>
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
          <div style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>Notes</div>
          <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{company.notes || '—'}</div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th></th></tr></thead>
            <tbody>
              {contacts.map(ct => (
                <tr key={ct.id}>
                  <td style={{ fontWeight: 600 }}>{ct.full_name}</td>
                  <td>{ct.role || '—'}</td>
                  <td>{ct.email || '—'}</td>
                  <td>{[ct.phone, ct.phone_mobile_2, ct.phone_landline].filter(Boolean).join(' / ') || '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => { setEditingContactId(ct.id); setCForm({ full_name: ct.full_name || '', job_title: ct.job_title || '', role: ct.role || '', email: ct.email || '', phone: ct.phone || '', phone_mobile_2: ct.phone_mobile_2 || '', phone_landline: ct.phone_landline || '', phone_extension: ct.phone_extension || '' }); setShowContact(true) }}>Edit</button></td>
                </tr>
              ))}
              {contacts.length === 0 && <tr><td colSpan={5} style={{ padding: 16, color: '#64748b' }}>No contacts</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.title}</td>
                  <td>{t.priority}</td>
                  <td>{t.status}</td>
                  <td>{t.due_at ? String(t.due_at).slice(0, 10) : '—'}</td>
                  <td>
                    <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setEditTask({
                      id: t.id, title: t.title || '', description: t.description || '', priority: t.priority || 'medium',
                      status: t.status || 'open', due_at: t.due_at ? String(t.due_at).slice(0, 10) : '',
                    })}>Edit</button>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td colSpan={5} style={{ padding: 16, color: '#64748b' }}>No tasks</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Type</th><th>Subject</th><th>Outcome</th><th>Next action</th><th>When</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {meetings.map(m => (
                <tr key={m.id}>
                  <td>{m.type}</td>
                  <td style={{ fontWeight: 600 }}>{m.subject || '—'}</td>
                  <td>{m.outcome || '—'}</td>
                  <td>{m.next_action || '—'}</td>
                  <td>{m.scheduled_at ? String(m.scheduled_at).slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td>{m.status}</td>
                  <td>
                    <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setEditMeeting({
                      id: m.id, type: m.type || 'call', subject: m.subject || '', description: m.description || '',
                      outcome: m.outcome || '', next_action: m.next_action || '',
                      scheduled_at: m.scheduled_at ? String(m.scheduled_at).slice(0, 16) : '',
                      status: m.status || 'open',
                    })}>Edit</button>
                  </td>
                </tr>
              ))}
              {meetings.length === 0 && <tr><td colSpan={7} style={{ padding: 16, color: '#64748b' }}>No meetings/calls</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'opps' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Opportunity</th><th>Stage</th><th>Deal size</th></tr></thead>
            <tbody>
              {opps.map(o => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOpp(o)}>
                  <td style={{ fontWeight: 600 }}>{o.name || '—'}</td>
                  <td>{oppStageLabel(o.stage)}</td>
                  <td>₹{Number(o.deal_size || 0).toLocaleString('en-IN')}</td>
                </tr>
              ))}
              {opps.length === 0 && <tr><td colSpan={3} style={{ padding: 16, color: '#64748b' }}>No opportunities</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showContact && (
        <Modal title={editingContactId ? 'Edit contact' : 'Add contact'} onClose={() => setShowContact(false)} width={520}>
          <form onSubmit={saveContact}>
            <Field label="Full name *"><input className="input" required value={cForm.full_name} onChange={e => setCForm({ ...cForm, full_name: e.target.value })} /></Field>
            <Field label="Job title"><input className="input" value={cForm.job_title || ''} onChange={e => setCForm({ ...cForm, job_title: e.target.value })} /></Field>
            <Field label="Role">
              <select className="input" value={cForm.role || ''} onChange={e => setCForm({ ...cForm, role: e.target.value })}>
                <option value="">—</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Email"><input className="input" type="email" value={cForm.email || ''} onChange={e => setCForm({ ...cForm, email: e.target.value })} /></Field>
            <Field label="Mobile"><input className="input" value={cForm.phone || ''} onChange={e => setCForm({ ...cForm, phone: e.target.value })} /></Field>
            <Field label="Mobile 2"><input className="input" value={cForm.phone_mobile_2 || ''} onChange={e => setCForm({ ...cForm, phone_mobile_2: e.target.value })} /></Field>
            <Field label="Landline"><input className="input" value={cForm.phone_landline || ''} onChange={e => setCForm({ ...cForm, phone_landline: e.target.value })} /></Field>
            <Field label="Extension"><input className="input" value={cForm.phone_extension || ''} onChange={e => setCForm({ ...cForm, phone_extension: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowContact(false)} label="Save contact" />
          </form>
        </Modal>
      )}

      {showTask && (
        <Modal title="New task" onClose={() => setShowTask(false)} width={480}>
          <form onSubmit={addTask}>
            <Field label="Title *"><input className="input" required value={tForm.title} onChange={e => setTForm({ ...tForm, title: e.target.value })} /></Field>
            <Field label="Priority"><select className="input" value={tForm.priority} onChange={e => setTForm({ ...tForm, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
            <Field label="Due"><input className="input" type="date" value={tForm.due_at} onChange={e => setTForm({ ...tForm, due_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowTask(false)} label="Create task" />
          </form>
        </Modal>
      )}

      {showMeeting && (
        <Modal title="Log call / meeting" onClose={() => setShowMeeting(false)} width={560}>
          <form onSubmit={addMeeting}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type">
                <select className="input" value={mForm.type} onChange={e => setMForm({ ...mForm, type: e.target.value })}>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="visit">Visit</option>
                  <option value="message">Message</option>
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={mForm.status || 'open'} onChange={e => setMForm({ ...mForm, status: e.target.value })}>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
            </div>
            <Field label="Subject *"><input className="input" required value={mForm.subject} onChange={e => setMForm({ ...mForm, subject: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={mForm.description} onChange={e => setMForm({ ...mForm, description: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={mForm.outcome || ''} onChange={e => setMForm({ ...mForm, outcome: e.target.value })} /></Field>
            <Field label="Next action"><input className="input" value={mForm.next_action || ''} onChange={e => setMForm({ ...mForm, next_action: e.target.value })} /></Field>
            <Field label="When"><input className="input" type="datetime-local" value={mForm.scheduled_at} onChange={e => setMForm({ ...mForm, scheduled_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowMeeting(false)} label="Save" />
          </form>
        </Modal>
      )}

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={1200}>
          <form onSubmit={addOpp}>
            <OpportunityCreateFields form={oForm} setForm={setOForm} contacts={contacts} />
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {selectedOpp && (
        <Modal title={selectedOpp.name || 'Opportunity'} onClose={() => setSelectedOpp(null)} width={1200}>
          <OpportunityDetail
            opportunity={{ ...selectedOpp, companies: { name: company?.name } }}
            contacts={contacts}
            onClose={() => setSelectedOpp(null)}
            onSaved={() => load()}
            goCompany={() => setSelectedOpp(null)}
          />
        </Modal>
      )}

      {showEdit && (
        <Modal title="Edit Company" onClose={() => setShowEdit(false)} width={720}>
          <form onSubmit={saveCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Short name *">
                <input className="input" required value={eForm.name || ''} onChange={e => setEForm({ ...eForm, name: e.target.value })} />
              </Field>
              <Field label="Full / legal name">
                <input className="input" value={eForm.legal_name || ''} onChange={e => setEForm({ ...eForm, legal_name: e.target.value })} />
              </Field>
            </div>
            <Field label="Primary address">
              <textarea className="input" rows={2} value={eForm.address || ''} onChange={e => setEForm({ ...eForm, address: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="City">
                <input className="input" value={eForm.city || ''} onChange={e => setEForm({ ...eForm, city: e.target.value })} />
              </Field>
              <Field label="Pincode">
                <input className="input" value={eForm.pincode || ''} onChange={e => setEForm({ ...eForm, pincode: e.target.value })} placeholder="e.g. 560001" />
              </Field>
              <Field label="Country">
                <input className="input" value={eForm.country || ''} onChange={e => setEForm({ ...eForm, country: e.target.value })} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="HQ">
                <input className="input" value={eForm.hq_location || ''} onChange={e => setEForm({ ...eForm, hq_location: e.target.value })} />
              </Field>
              <Field label="Board Tele No">
                <input className="input" value={eForm.board_no || ''} onChange={e => setEForm({ ...eForm, board_no: e.target.value })} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Employees">
                <input className="input" type="number" value={eForm.employee_count || ''} onChange={e => setEForm({ ...eForm, employee_count: e.target.value })} />
              </Field>
              <Field label="GST">
                <input className="input" value={eForm.gst_no || ''} onChange={e => setEForm({ ...eForm, gst_no: e.target.value })} placeholder="15-char GSTIN" />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Website">
                <input className="input" value={eForm.website || ''} onChange={e => setEForm({ ...eForm, website: e.target.value })} placeholder="https://" />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={eForm.email || ''} onChange={e => setEForm({ ...eForm, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Industry">
              <input className="input" value={eForm.industry || ''} onChange={e => setEForm({ ...eForm, industry: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className="input" rows={2} value={eForm.notes || ''} onChange={e => setEForm({ ...eForm, notes: e.target.value })} />
            </Field>
            <div style={{ margin: '8px 0', padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Additional locations (service area)</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Sites beyond the primary address.</div>
              {(eForm.locations || []).map((loc, idx) => (
                <div key={idx} style={{ marginBottom: 12, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#334155' }}>Location {idx + 1}</div>
                    <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setEForm({ ...eForm, locations: (eForm.locations || []).filter((_, i) => i !== idx) })}>Remove</button>
                  </div>
                  <Field label="Site / label (optional)">
                    <input className="input" value={loc.label || ''} placeholder="e.g. Plant 2" onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], label: e.target.value }; setEForm({ ...eForm, locations }) }} />
                  </Field>
                  <Field label="Address">
                    <textarea className="input" rows={2} value={loc.address || ''} onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], address: e.target.value }; setEForm({ ...eForm, locations }) }} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="City">
                      <input className="input" value={loc.city || ''} onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], city: e.target.value }; setEForm({ ...eForm, locations }) }} />
                    </Field>
                    <Field label="Pincode">
                      <input className="input" value={loc.pincode || ''} onChange={e => { const locations = [...(eForm.locations || [])]; locations[idx] = { ...locations[idx], pincode: e.target.value }; setEForm({ ...eForm, locations }) }} />
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

      {editTask && (
        <Modal title="Edit task" onClose={() => setEditTask(null)} width={480}>
          <form onSubmit={saveEditTask}>
            <Field label="Title *"><input className="input" required value={editTask.title || ''} onChange={e => setEditTask({ ...editTask, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={2} value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Priority">
                <select className="input" value={editTask.priority || 'medium'} onChange={e => setEditTask({ ...editTask, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={editTask.status || 'open'} onChange={e => setEditTask({ ...editTask, status: e.target.value })}>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
            </div>
            <Field label="Due"><input className="input" type="date" value={editTask.due_at || ''} onChange={e => setEditTask({ ...editTask, due_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setEditTask(null)} label="Save task" />
          </form>
        </Modal>
      )}

      {editMeeting && (
        <Modal title="Edit call / meeting" onClose={() => setEditMeeting(null)} width={560}>
          <form onSubmit={saveEditMeeting}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type">
                <select className="input" value={editMeeting.type || 'call'} onChange={e => setEditMeeting({ ...editMeeting, type: e.target.value })}>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="visit">Visit</option>
                  <option value="message">Message</option>
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={editMeeting.status || 'open'} onChange={e => setEditMeeting({ ...editMeeting, status: e.target.value })}>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
            </div>
            <Field label="Subject *"><input className="input" required value={editMeeting.subject || ''} onChange={e => setEditMeeting({ ...editMeeting, subject: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={editMeeting.description || ''} onChange={e => setEditMeeting({ ...editMeeting, description: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={editMeeting.outcome || ''} onChange={e => setEditMeeting({ ...editMeeting, outcome: e.target.value })} /></Field>
            <Field label="Next action"><input className="input" value={editMeeting.next_action || ''} onChange={e => setEditMeeting({ ...editMeeting, next_action: e.target.value })} /></Field>
            <Field label="When"><input className="input" type="datetime-local" value={editMeeting.scheduled_at || ''} onChange={e => setEditMeeting({ ...editMeeting, scheduled_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setEditMeeting(null)} label="Save changes" />
          </form>
        </Modal>
      )}

      {showResearch && (
        <Modal title="Initiate Research" onClose={() => setShowResearch(false)} width={560}>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
            Creates research queue entry and tasks. Use free search links, then log buying signals.
          </p>
          {researchMsg && <div className="notice" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{researchMsg}</div>}
          <div style={{ marginBottom: 12 }}>
            {searchLinks().map(([label, url]) => (
              <div key={label} style={{ marginBottom: 6 }}>
                <a href={url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: 13 }}>{label}</a>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button type="button" className="btn primary" disabled={researchBusy} onClick={initiateResearch}>{researchBusy ? 'Working…' : 'Start research'}</button>
            <button type="button" className="btn" onClick={() => setShowResearch(false)}>Close</button>
          </div>
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Log a signal</div>
            <form onSubmit={logSignal}>
              <Field label="Type">
                <select className="input" value={sigForm.signal_type} onChange={e => setSigForm({ ...sigForm, signal_type: e.target.value })}>
                  {(SIGNAL_TYPES || ['news', 'hiring', 'funding', 'expansion', 'tender', 'leadership', 'other']).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Observation *"><textarea className="input" required rows={2} value={sigForm.observation} onChange={e => setSigForm({ ...sigForm, observation: e.target.value })} /></Field>
              <Field label="Source"><input className="input" value={sigForm.source} onChange={e => setSigForm({ ...sigForm, source: e.target.value })} /></Field>
              <Actions saving={saving} onCancel={() => setShowResearch(false)} label="Save signal" />
            </form>
          </div>
          {signals.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
              Recent signals: {signals.slice(0, 5).map(s => s.observation).filter(Boolean).join(' · ') || '—'}
            </div>
          )}
        </Modal>
      )}

      {showNotQualified && (
        <Modal title="Not Qualified — reason" onClose={() => { setShowNotQualified(false); setNqReason('') }} width={420}>
          <form onSubmit={saveNotQualified}>
            <Field label="Reason *">
              <select className="input" required value={nqReason} onChange={e => setNqReason(e.target.value)}>
                <option value="">Select…</option>
                {NOT_QUALIFIED_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Actions saving={false} onCancel={() => { setShowNotQualified(false); setNqReason('') }} label="Confirm" />
          </form>
        </Modal>
      )}
    </div>
  )
}
