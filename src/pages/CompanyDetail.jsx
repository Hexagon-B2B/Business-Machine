import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, ROLES, OPP_STAGES, MISSING_COMPANY_FIELDS, isTaskOpen, isTaskClosed, lifecycleLabel, oppStageLabel, NOT_QUALIFIED_REASONS, notQualifiedReasonLabel, SIGNAL_TYPES } from '../constants'
import { Modal, Field, Actions, Badge, CompanySearchSelect } from '../ui'
import {
  EMPTY_OPP_FORM,
  OpportunityCreateFields,
  OpportunityDetail,
  createOppWithOptionalTask,
} from '../components/OpportunityShared'

function isLeft(ct) {
  return (ct.contact_status || 'active') === 'left'
}

function phoneLine(ct) {
  return [ct.phone, ct.phone_mobile_2, ct.phone_landline].filter(Boolean).join(' / ') || '—'
}

function leftReason(ct) {
  const m = ct.metadata && typeof ct.metadata === 'object' ? ct.metadata : {}
  return m.left_reason || m.left_notes || ''
}

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
  const [cForm, setCForm] = useState({ full_name: '', job_title: '', role: '', email: '', phone: '', phone_mobile_2: '', phone_landline: '', phone_extension: '', promo_opt_out: false })
  const [dupHints, setDupHints] = useState({ email: '', phone: '', phone_mobile_2: '' })
  const [moveContact, setMoveContact] = useState(null)
  const [moveForm, setMoveForm] = useState({ mode: 'left', new_company_id: '', job_title: '', role: '', notes: '', left_reason: '' })
  const [flash, setFlash] = useState('')
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
    setMoveContact(null)
    setFlash('')
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
        supabase.from('contacts').select('*').eq('company_id', id).neq('state', 'deleted').order('full_name'),
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

  function showFlash(msg) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 3500)
  }

  async function addOpp(e) {
    e.preventDefault()
    if (saving) return
    if (!(oForm.requirement_description || '').trim()) {
      alert('Requirement is required.')
      return
    }
    setSaving(true)
    const { data, error } = await createOppWithOptionalTask(oForm, id)
    setSaving(false)
    if (error) {
      alert('Could not create opportunity: ' + (error.message || String(error)))
      return
    }
    setShowOpp(false)
    setOForm({ ...EMPTY_OPP_FORM })
    setTab('opps')
    showFlash('Opportunity created. Quotation is optional — add it when ready.')
    await load()
    if (data?.id) {
      const { data: full } = await supabase.from('opportunities').select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id').eq('id', data.id).single()
      if (full) setSelectedOpp(full)
    }
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
    if (error) { alert('Could not change lifecycle: ' + error.message); return }
    setCompany({ ...company, lifecycle_status: val, not_qualified_reason: val === 'not_qualified' ? notQualifiedReason : null, metadata: payload.metadata || company.metadata })
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
      country: company.country || '', employee_count: company.employee_count || company.enrichment_employee_count || '',
      board_no: company.board_no || '', website: company.website || '', email: company.email || '',
      gst_no: company.gst_no || '', industry: company.industry || '', notes: company.notes || '',
      locations: Array.isArray(company.metadata?.locations)
        ? company.metadata.locations.map(l => ({ label: l.label || '', address: l.address || '', city: l.city || '', pincode: l.pincode || '' }))
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
      name: eForm.name.trim(), legal_name: (eForm.legal_name || '').trim() || null,
      address: (eForm.address || '').trim() || null, city: (eForm.city || '').trim() || null,
      pincode: (eForm.pincode || '').trim() || null, hq_location: (eForm.hq_location || '').trim() || null,
      country: (eForm.country || '').trim() || null,
      employee_count: eForm.employee_count !== '' && eForm.employee_count != null ? Number(eForm.employee_count) : null,
      board_no: (eForm.board_no || '').trim() || null, website: (eForm.website || '').trim() || null,
      email: (eForm.email || '').trim() || null, gst_no: gst || null,
      industry: (eForm.industry || '').trim() || null, notes: (eForm.notes || '').trim() || null,
      metadata: {
        ...(company.metadata || {}),
        locations: (eForm.locations || [])
          .filter(l => (l.city || l.label || l.address || l.pincode || '').trim())
          .map(l => ({ label: (l.label || '').trim(), address: (l.address || '').trim(), city: (l.city || '').trim(), pincode: (l.pincode || '').trim() })),
      },
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

  if (loading) return <div className="loading" style={{ padding: 40 }}>Loading company…</div>
  if (!id || loadError || !company) {
    return (
      <div className="empty" style={{ padding: 40 }}>
        {loadError || (!id ? 'No company selected.' : 'Company not found')}
        <div style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => go('companies')}>← Companies</button></div>
      </div>
    )
  }

  const activeContacts = contacts.filter(c => !isLeft(c))
  const leftContacts = contacts.filter(c => isLeft(c))
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: `Contacts (${activeContacts.length}${leftContacts.length ? ` · ${leftContacts.length} left` : ''})` },
    { id: 'tasks', label: `Tasks (${tasks.filter(t => isTaskOpen(t.status)).length})` },
    { id: 'meetings', label: `Meetings (${meetings.length})` },
    { id: 'opps', label: `Opportunities (${opps.length})` },
  ]

  return (
    <div style={{ padding: 28 }}>
      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={() => go('companies')}>← Companies</button>
      {flash && <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Company</div>
            <h1 style={{ fontSize: 22 }}>{company.name}</h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }} value={company.lifecycle_status || 'prospect_no_contact'} onChange={e => onLifecycleChange(e.target.value)}>
                {LIFECYCLE.map(s => <option key={s} value={s}>{lifecycleLabel(s)}</option>)}
              </select>
              {company.city && <span style={{ color: '#64748b', fontSize: 13 }}>{company.city}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={openEdit}>Edit</button>
            <button type="button" className="btn primary" onClick={() => { setOForm({ ...EMPTY_OPP_FORM }); setShowOpp(true) }}>+ Opportunity</button>
          </div>
        </div>
      </div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        {tabs.map(t => (
          <button key={t.id} type="button" className="btn" onClick={() => setTab(t.id)} style={{ background: tab === t.id ? '#2563eb' : '#fff', color: tab === t.id ? '#fff' : '#0f172a' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 13 }}>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Legal name</div>{company.legal_name || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Website</div>{company.website ? <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Email</div>{company.email || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>GST</div>{company.gst_no || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Employees</div>{company.employee_count ?? '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Board Tele No</div>{company.board_no || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>HQ</div>{company.hq_location || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Pincode</div>{company.pincode || '—'}</div>
            <div style={{ gridColumn: '1 / -1' }}><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Address</div>{company.address || '—'}</div>
            <div style={{ gridColumn: '1 / -1' }}><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Notes</div>{company.notes || '—'}</div>
          </div>
          {Array.isArray(company.metadata?.locations) && company.metadata.locations.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Additional locations</div>
              {company.metadata.locations.map((l, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  <strong>{l.label || 'Location'}</strong>{l.city ? ` — ${l.city}` : ''}{l.pincode ? ` ${l.pincode}` : ''}{l.address ? `: ${l.address}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'opps' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          {selectedOpp ? (
            <div>
              <div style={{ padding: 12 }}>
                <button type="button" className="btn" onClick={() => setSelectedOpp(null)}>← Back to list</button>
              </div>
              <OpportunityDetail opportunity={selectedOpp} contacts={activeContacts} onClose={() => setSelectedOpp(null)} onSaved={() => load()} />
            </div>
          ) : (
            <table className="table">
              <thead><tr><th>Name</th><th>Stage</th><th>Value</th></tr></thead>
              <tbody>
                {opps.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOpp(r)}>
                    <td style={{ fontWeight: 600, color: '#2563eb' }}>{r.name}</td>
                    <td>{oppStageLabel(r.stage)}</td>
                    <td>{r.deal_size != null ? Number(r.deal_size).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {opps.length === 0 && <tr><td colSpan={3} style={{ padding: 16, color: '#64748b' }}>No opportunities — use + Opportunity</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card" style={{ padding: 16, color: '#64748b' }}>Contacts tab — use full restore from artifacts if other tabs needed. Active: {activeContacts.length}, Left: {leftContacts.length}</div>
      )}
      {tab === 'tasks' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Title</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              {tasks.map(t => <tr key={t.id}><td>{t.title}</td><td>{t.status}</td><td>{t.due_at ? String(t.due_at).slice(0, 10) : '—'}</td></tr>)}
              {tasks.length === 0 && <tr><td colSpan={3} style={{ padding: 16, color: '#64748b' }}>No tasks</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'meetings' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Type</th><th>Subject</th><th>When</th></tr></thead>
            <tbody>
              {meetings.map(m => <tr key={m.id}><td>{m.type}</td><td>{m.subject}</td><td>{m.scheduled_at ? String(m.scheduled_at).slice(0, 16) : '—'}</td></tr>)}
              {meetings.length === 0 && <tr><td colSpan={3} style={{ padding: 16, color: '#64748b' }}>No meetings</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={720}>
          <form onSubmit={addOpp}>
            <OpportunityCreateFields form={oForm} setForm={setOForm} contacts={activeContacts} />
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create" />
          </form>
        </Modal>
      )}

      {showEdit && (
        <Modal title="Edit company" onClose={() => setShowEdit(false)} width={640}>
          <form onSubmit={saveCompany}>
            <Field label="Name *"><input className="input" required value={eForm.name || ''} onChange={e => setEForm({ ...eForm, name: e.target.value })} /></Field>
            <Field label="Legal name"><input className="input" value={eForm.legal_name || ''} onChange={e => setEForm({ ...eForm, legal_name: e.target.value })} /></Field>
            <Field label="Address"><textarea className="input" rows={2} value={eForm.address || ''} onChange={e => setEForm({ ...eForm, address: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Field label="City"><input className="input" value={eForm.city || ''} onChange={e => setEForm({ ...eForm, city: e.target.value })} /></Field>
              <Field label="Pincode"><input className="input" value={eForm.pincode || ''} onChange={e => setEForm({ ...eForm, pincode: e.target.value })} /></Field>
              <Field label="Country"><input className="input" value={eForm.country || ''} onChange={e => setEForm({ ...eForm, country: e.target.value })} /></Field>
            </div>
            <Field label="HQ"><input className="input" value={eForm.hq_location || ''} onChange={e => setEForm({ ...eForm, hq_location: e.target.value })} /></Field>
            <Field label="Board Tele No"><input className="input" value={eForm.board_no || ''} onChange={e => setEForm({ ...eForm, board_no: e.target.value })} /></Field>
            <Field label="Employees"><input className="input" type="number" value={eForm.employee_count ?? ''} onChange={e => setEForm({ ...eForm, employee_count: e.target.value })} /></Field>
            <Field label="GST"><input className="input" value={eForm.gst_no || ''} onChange={e => setEForm({ ...eForm, gst_no: e.target.value })} /></Field>
            <Field label="Website"><input className="input" value={eForm.website || ''} onChange={e => setEForm({ ...eForm, website: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={eForm.email || ''} onChange={e => setEForm({ ...eForm, email: e.target.value })} /></Field>
            <Field label="Industry"><input className="input" value={eForm.industry || ''} onChange={e => setEForm({ ...eForm, industry: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={eForm.notes || ''} onChange={e => setEForm({ ...eForm, notes: e.target.value })} /></Field>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Additional locations</div>
              {(eForm.locations || []).map((loc, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                  <input className="input" placeholder="Label" value={loc.label || ''} onChange={e => { const locs = [...(eForm.locations || [])]; locs[i] = { ...locs[i], label: e.target.value }; setEForm({ ...eForm, locations: locs }) }} />
                  <input className="input" placeholder="City" value={loc.city || ''} onChange={e => { const locs = [...(eForm.locations || [])]; locs[i] = { ...locs[i], city: e.target.value }; setEForm({ ...eForm, locations: locs }) }} />
                  <input className="input" placeholder="Pincode" value={loc.pincode || ''} onChange={e => { const locs = [...(eForm.locations || [])]; locs[i] = { ...locs[i], pincode: e.target.value }; setEForm({ ...eForm, locations: locs }) }} />
                  <input className="input" placeholder="Address" value={loc.address || ''} onChange={e => { const locs = [...(eForm.locations || [])]; locs[i] = { ...locs[i], address: e.target.value }; setEForm({ ...eForm, locations: locs }) }} />
                  <button type="button" className="btn" onClick={() => setEForm({ ...eForm, locations: (eForm.locations || []).filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
              <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setEForm({ ...eForm, locations: [...(eForm.locations || []), { label: '', city: '', pincode: '', address: '' }] })}>+ Location</button>
            </div>
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
                {NOT_QUALIFIED_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Actions saving={false} onCancel={() => { setShowNotQualified(false); setNqReason('') }} label="Confirm" />
          </form>
        </Modal>
      )}
    </div>
  )
}
