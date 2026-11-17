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
import CompanyQuotedItems from '../components/CompanyQuotedItems'

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
  // ... FULL FILE CONTINUES - THIS IS INCOMPLETE STUB AGAIN - DO NOT USE
  return <div style={{ padding: 28 }}><button type="button" className="btn" onClick={() => go('companies')}>← Companies</button><div className="notice" style={{ marginTop: 16 }}>Company detail is restoring. Please hard-refresh in 1–2 minutes.</div></div>
}
