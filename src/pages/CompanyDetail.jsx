import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, ROLES, OPP_STAGES, isTaskOpen, lifecycleLabel, oppStageLabel, NOT_QUALIFIED_REASONS, notQualifiedReasonLabel } from '../constants'
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
  const [cForm, setCForm] = useState({ full_name: '', job_title: '', role: '', email: '', phone: '' })
  const [tForm, setTForm] = useState({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' })
  const [mForm, setMForm] = useState({ type: 'call', subject: '', description: '', outcome: '', next_action: '', scheduled_at: '', status: 'open', contact_id: '' })
  const [oForm, setOForm] = useState({ ...EMPTY_OPP_FORM })
  const [selectedOpp, setSelectedOpp] = useState(null)
  const [eForm, setEForm] = useState({})
  const [nqReason, setNqReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedOpp(null)
    setShowOpp(false)
    setShowNotQualified(false)
    setTab('overview')
    setLoadError('')
    if (id) load()
    else { setCompany(null); setLoading(false) }
  }, [id])

  async function load() {
    if (!id) return
    setLoading(true)
    setLoadError('')
    try {
      const [c, ct, t, m, o] = await Promise.all([
        supabase.from('companies').select('*').eq('id', id).single(),
        supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
        supabase.from('tasks').select('*').eq('company_id', id).neq('state', 'deleted').order('due_at', { ascending: true }),
        supabase.from('meetings_calls').select('*').eq('company_id', id).neq('state', 'deleted').order('scheduled_at', { ascending: false }).limit(20),
        supabase.from('opportunities').select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id').eq('company_id', id).neq('state', 'deleted').order('created_at', { ascending: false }),
      ])
      if (c.error) { setLoadError(c.error.message || 'Could not load company'); setCompany(null) }
      else setCompany(c.data)
      setContacts(ct.data || [])
      setTasks(t.data || [])
      setMeetings(m.data || [])
      setOpps(o.data || [])
    } catch (ex) {
      setLoadError(ex.message || 'Unexpected error')
      setCompany(null)
    }
    setLoading(false)
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
      name: company.name || '', legal_name: company.legal_name || '', address: company.address || '',
      city: company.city || '', pincode: company.pincode || '', hq_location: company.hq_location || '',
      country: company.country || '', employee_count: company.employee_count || '', board_no: company.board_no || '',
      website: company.website || '', email: company.email || '', gst_no: company.gst_no || '',
      industry: company.industry || '', notes: company.notes || '',
    })
    setShowEdit(true)
  }

  async function saveCompany(e) {
    e.preventDefault()
    if (!eForm.name?.trim()) return
    setSaving(true)
    const payload = {
      name: eForm.name.trim(), legal_name: (eForm.legal_name || '').trim() || null,
      address: (eForm.address || '').trim() || null, city: (eForm.city || '').trim() || null,
      pincode: (eForm.pincode || '').trim() || null, hq_location: (eForm.hq_location || '').trim() || null,
      country: (eForm.country || '').trim() || null,
      employee_count: eForm.employee_count !== '' && eForm.employee_count != null ? Number(eForm.employee_count) : null,
      board_no: (eForm.board_no || '').trim() || null, website: (eForm.website || '').trim() || null,
      email: (eForm.email || '').trim() || null, gst_no: (eForm.gst_no || '').trim() || null,
      industry: (eForm.industry || '').trim() || null, notes: (eForm.notes || '').trim() || null,
    }
    let { error } = await supabase.from('companies').update(payload).eq('id', id)
    if (error && /pincode|column/i.test(error.message)) {
      delete payload.pincode
      ;({ error } = await supabase.from('companies').update(payload).eq('id', id))
    }
    setSaving(false)
    if (!error) { setShowEdit(false); setCompany({ ...company, ...payload }) }
    else alert(error.message)
  }

  async function saveContact(e) {
    e.preventDefault()
    if (!cForm.full_name.trim()) return
    setSaving(true)
    const payload = {
      full_name: cForm.full_name.trim(), job_title: (cForm.job_title || '').trim() || null,
      role: cForm.role || null, email: (cForm.email || '').trim() || null, phone: (cForm.phone || '').trim() || null,
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
    setSaving(true)
    const { error } = await supabase.from('meetings_calls').insert({
      company_id: id, contact_id: mForm.contact_id || null, type: mForm.type || 'call',
      subject: (mForm.subject || '').trim() || null, description: (mForm.description || '').trim() || null,
      outcome: (mForm.outcome || '').trim() || null, next_action: (mForm.next_action || '').trim() || null,
      scheduled_at: mForm.scheduled_at || null, status: mForm.status || 'open', state: 'active',
    })
    setSaving(false)
    if (!error) { setShowMeeting(false); load() }
    else alert(error.message)
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
              {company.industry && <Badge>{company.industry}</Badge>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={openEdit}>Edit Company</button>
            <button type="button" className="btn" onClick={() => { setEditingContactId(null); setCForm({ full_name: '', job_title: '', role: '', email: '', phone: '' }); setShowContact(true) }}>+ Contact</button>
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
          <div style={{ fontSize: 13, color: '#64748b' }}>Notes</div>
          <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{company.notes || '—'}</div>
          <div style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>Open the Opportunities tab to view deals. Clicking a company always opens this company page (Overview), not an opportunity.</div>
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
                  <td>{ct.phone || '—'}</td>
                  <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => { setEditingContactId(ct.id); setCForm({ full_name: ct.full_name || '', job_title: ct.job_title || '', role: ct.role || '', email: ct.email || '', phone: ct.phone || '' }); setShowContact(true) }}>Edit</button></td>
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
            <thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.title}</td>
                  <td>{t.priority}</td>
                  <td>{t.status}</td>
                  <td>{t.due_at ? String(t.due_at).slice(0, 10) : '—'}</td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td colSpan={4} style={{ padding: 16, color: '#64748b' }}>No tasks</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Type</th><th>Subject</th><th>When</th><th>Status</th></tr></thead>
            <tbody>
              {meetings.map(m => (
                <tr key={m.id}>
                  <td>{m.type}</td>
                  <td style={{ fontWeight: 600 }}>{m.subject || '—'}</td>
                  <td>{m.scheduled_at ? String(m.scheduled_at).slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td>{m.status}</td>
                </tr>
              ))}
              {meetings.length === 0 && <tr><td colSpan={4} style={{ padding: 16, color: '#64748b' }}>No meetings/calls</td></tr>}
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
        <Modal title={editingContactId ? 'Edit contact' : 'Add contact'} onClose={() => setShowContact(false)} width={480}>
          <form onSubmit={saveContact}>
            <Field label="Full name *"><input className="input" required value={cForm.full_name} onChange={e => setCForm({ ...cForm, full_name: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={cForm.role || ''} onChange={e => setCForm({ ...cForm, role: e.target.value })}><option value="">—</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></Field>
            <Field label="Email"><input className="input" type="email" value={cForm.email} onChange={e => setCForm({ ...cForm, email: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" value={cForm.phone} onChange={e => setCForm({ ...cForm, phone: e.target.value })} /></Field>
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
        <Modal title="Log call / meeting" onClose={() => setShowMeeting(false)} width={520}>
          <form onSubmit={addMeeting}>
            <Field label="Type"><select className="input" value={mForm.type} onChange={e => setMForm({ ...mForm, type: e.target.value })}><option value="call">Call</option><option value="meeting">Meeting</option><option value="visit">Visit</option><option value="message">Message</option></select></Field>
            <Field label="Subject"><input className="input" value={mForm.subject} onChange={e => setMForm({ ...mForm, subject: e.target.value })} /></Field>
            <Field label="When"><input className="input" type="datetime-local" value={mForm.scheduled_at} onChange={e => setMForm({ ...mForm, scheduled_at: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={mForm.description} onChange={e => setMForm({ ...mForm, description: e.target.value })} /></Field>
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
        <Modal title="Edit company" onClose={() => setShowEdit(false)} width={640}>
          <form onSubmit={saveCompany}>
            <Field label="Name *"><input className="input" required value={eForm.name || ''} onChange={e => setEForm({ ...eForm, name: e.target.value })} /></Field>
            <Field label="Legal name"><input className="input" value={eForm.legal_name || ''} onChange={e => setEForm({ ...eForm, legal_name: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="City"><input className="input" value={eForm.city || ''} onChange={e => setEForm({ ...eForm, city: e.target.value })} /></Field>
              <Field label="Pincode"><input className="input" value={eForm.pincode || ''} onChange={e => setEForm({ ...eForm, pincode: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Website"><input className="input" value={eForm.website || ''} onChange={e => setEForm({ ...eForm, website: e.target.value })} /></Field>
              <Field label="Email"><input className="input" type="email" value={eForm.email || ''} onChange={e => setEForm({ ...eForm, email: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="GST No"><input className="input" value={eForm.gst_no || ''} onChange={e => setEForm({ ...eForm, gst_no: e.target.value })} /></Field>
              <Field label="Board Tele No"><input className="input" value={eForm.board_no || ''} onChange={e => setEForm({ ...eForm, board_no: e.target.value })} /></Field>
            </div>
            <Field label="Industry"><input className="input" value={eForm.industry || ''} onChange={e => setEForm({ ...eForm, industry: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={eForm.notes || ''} onChange={e => setEForm({ ...eForm, notes: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowEdit(false)} label="Save company" />
          </form>
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
