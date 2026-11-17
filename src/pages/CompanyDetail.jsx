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
import { canCreateActivity, isOwner } from '../access'

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

export default function CompanyDetail({ id, go, access }) {
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
  const [tForm, setTForm] = useState({ title: '', description: '', due_date: '', priority: 'medium', status: 'open' })
  const [mForm, setMForm] = useState({ type: 'call', status: 'open', subject: '', notes: '', outcome: '', next_action: '', scheduled_at: '' })
  const [oppForm, setOppForm] = useState({ ...EMPTY_OPP_FORM })
  const [eForm, setEForm] = useState({})
  const [nqReason, setNqReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [openOppId, setOpenOppId] = useState(null)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferTo, setTransferTo] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [teamProfiles, setTeamProfiles] = useState([])
  const [ownerProfile, setOwnerProfile] = useState(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const { data: co, error: coErr } = await supabase.from('companies').select('*').eq('id', id).maybeSingle()
        if (coErr) throw coErr
        if (!co) {
          if (!cancelled) { setCompany(null); setLoadError('Company not found'); setLoading(false) }
          return
        }
        const [ct, tk, mt, op, sg] = await Promise.all([
          supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
          supabase.from('tasks').select('*').eq('company_id', id).order('due_date', { ascending: true }),
          supabase.from('meetings_calls').select('*').eq('company_id', id).order('scheduled_at', { ascending: false }),
          supabase.from('opportunities').select('*').eq('company_id', id).not('state', 'eq', 'deleted').order('updated_at', { ascending: false }),
          supabase.from('research_signals').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
        ])
        if (cancelled) return
        setCompany(co)
        setContacts(ct.data || [])
        setTasks(tk.data || [])
        setMeetings(mt.data || [])
        setOpps(op.data || [])
        setSignals(sg.data || [])
        if (co.owner_id) {
          const { data: opProfile } = await supabase.from('profiles').select('id, full_name, email, role').eq('id', co.owner_id).maybeSingle()
          if (!cancelled) setOwnerProfile(opProfile)
        } else if (!cancelled) setOwnerProfile(null)
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Failed to load company')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    setTab('overview')
    setOpenOppId(null)
    setShowContact(false)
    setShowTask(false)
    setShowMeeting(false)
    setShowOpp(false)
    setShowEdit(false)
  }, [id])

  async function reloadContacts() {
    const { data } = await supabase.from('contacts').select('*').eq('company_id', id).order('full_name')
    setContacts(data || [])
  }
  async function reloadTasks() {
    const { data } = await supabase.from('tasks').select('*').eq('company_id', id).order('due_date', { ascending: true })
    setTasks(data || [])
  }
  async function reloadMeetings() {
    const { data } = await supabase.from('meetings_calls').select('*').eq('company_id', id).order('scheduled_at', { ascending: false })
    setMeetings(data || [])
  }
  async function reloadOpps() {
    const { data } = await supabase.from('opportunities').select('*').eq('company_id', id).not('state', 'eq', 'deleted').order('updated_at', { ascending: false })
    setOpps(data || [])
  }

  if (loading) return <div style={{ padding: 28 }}>Loading company…</div>
  if (loadError) return <div style={{ padding: 28 }}><button type="button" className="btn" onClick={() => go('companies')}>← Companies</button><div className="notice" style={{ marginTop: 16, color: '#b91c1c' }}>{loadError}</div></div>
  if (!company) return <div style={{ padding: 28 }}><button type="button" className="btn" onClick={() => go('companies')}>← Companies</button><div className="notice" style={{ marginTop: 16 }}>Company not found.</div></div>

  const activeContacts = contacts.filter(c => !isLeft(c))
  const leftContacts = contacts.filter(c => isLeft(c))
  const canAct = canCreateActivity(access, company)
  const owner = isOwner(access, company)

  return (
    <div style={{ padding: 28 }}>
      <button type="button" className="btn" onClick={() => go('companies')}>← Companies</button>
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{company.name}</h1>
        {company.legal_name && <div style={{ color: '#64748b', fontSize: 13 }}>{company.legal_name}</div>}
        <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
          {[company.city, company.pincode, company.hq ? 'HQ: ' + company.hq : null, company.employees ? company.employees + ' emp' : null].filter(Boolean).join(' · ')}
        </div>
        {ownerProfile && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Owner: {ownerProfile.full_name || ownerProfile.email}</div>}
      </div>
      <div className="notice" style={{ marginTop: 12 }}>
        Company header is live. Full tabs (contacts, tasks, meetings, opportunities, edit) are being restored in the next deploy — no Quoted Items changes.
      </div>
    </div>
  )
}
