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
      const msg = error.message || String(error)
      if (/stage|opportunities_stage_check/i.test(msg)) {
        alert('Could not create opportunity (stage constraint).\n\nRun sql/007_fix_opportunity_stage.sql in Supabase, then try again.\n\n(' + msg + ')')
      } else if (/state|opportunities_state_check/i.test(msg)) {
        alert('Could not create opportunity (state constraint).\n\nRun sql/006_opportunity_state_deleted.sql in Supabase, then try again.\n\n(' + msg + ')')
      } else {
        alert('Could not create opportunity: ' + msg)
      }
      return
    }
    setShowOpp(false)
    setOForm({ ...EMPTY_OPP_FORM })
    setTab('opps')
    showFlash('Opportunity created. Open it to add a quotation when ready (optional).')
    await load()
    if (data?.id) {
      const { data: full } = await supabase
        .from('opportunities')
        .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id')
        .eq('id', data.id)
        .single()
      if (full) setSelectedOpp(full)
    }
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
              <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }} value={company.lifecycle_status || 'prospect_no_contact'} onChange={e => {}}>
                {LIFECYCLE.map(s => <option key={s} value={s}>{lifecycleLabel(s)}</option>)}
              </select>
              {company.city && <span style={{ color: '#64748b', fontSize: 13 }}>{company.city}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => setShowEdit(true)}>Edit</button>
            <button type="button" className="btn primary" onClick={() => { setOForm({ ...EMPTY_OPP_FORM }); setShowOpp(true) }}>+ Opportunity</button>
          </div>
        </div>
      </div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        {tabs.map(t => (
          <button key={t.id} type="button" className="btn" onClick={() => setTab(t.id)} style={{ background: tab === t.id ? '#2563eb' : '#fff', color: tab === t.id ? '#fff' : '#0f172a' }}>{t.label}</button>
        ))}
      </div>
      {tab === 'opps' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          {selectedOpp ? (
            <OpportunityDetail opportunity={selectedOpp} contacts={activeContacts} onClose={() => setSelectedOpp(null)} onSaved={() => load()} />
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
                {opps.length === 0 && <tr><td colSpan={3} style={{ padding: 16, color: '#64748b' }}>No opportunities</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab !== 'opps' && (
        <div className="card"><div style={{ color: '#64748b', fontSize: 13 }}>Use the tabs above for Overview, Contacts, Tasks, Meetings. Opportunities tab is fixed for open/create.</div></div>
      )}
      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={720}>
          <form onSubmit={addOpp}>
            <OpportunityCreateFields form={oForm} setForm={setOForm} contacts={activeContacts} />
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create" />
          </form>
        </Modal>
      )}
    </div>
  )
}
