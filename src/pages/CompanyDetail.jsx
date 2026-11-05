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

  // TEMP_STUB_CONTINUE - will replace with full file
  if (loading) return <div className="loading" style={{ padding: 40 }}>Loading company…</div>
  if (!id || loadError || !company) {
    return (
      <div className="empty" style={{ padding: 40 }}>
        {loadError || (!id ? 'No company selected.' : 'Company not found')}
        <div style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => go('companies')}>← Companies</button></div>
      </div>
    )
  }

  return (
    <div style={{ padding: 28 }}>
      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={() => go('companies')}>← Companies</button>
      <div className="card">
        <div className="eyebrow">Company</div>
        <h1 style={{ fontSize: 22 }}>{company.name}</h1>
        <p style={{ color: '#64748b', marginTop: 8 }}>Company detail is restoring. Open from Companies list if tabs are incomplete — full UI will be back on next deploy.</p>
        <p style={{ marginTop: 12 }}><strong>City:</strong> {company.city || '—'} · <strong>Lifecycle:</strong> {lifecycleLabel(company.lifecycle_status)}</p>
      </div>
    </div>
  )
}
