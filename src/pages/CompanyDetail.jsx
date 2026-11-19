import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, isTaskOpen, isTaskClosed, lifecycleLabel } from '../constants'
import { EMPTY_OPP_FORM, createOppWithOptionalTask } from '../components/OpportunityShared'
import { canCreateActivity, isOwner } from '../access'
import { isLeft, phoneLine, leftReason } from './companyDetailHelpers'
import CompanyDetailBody from './CompanyDetailBody'
import CompanyDetailModals from './CompanyDetailModals'

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
  const [oForm, setOForm] = useState({ ...EMPTY_OPP_FORM })
  const [eForm, setEForm] = useState({})
  const [nqReason, setNqReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedOpp, setSelectedOpp] = useState(null)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferTo, setTransferTo] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [teamProfiles, setTeamProfiles] = useState([])
  const [ownerProfile, setOwnerProfile] = useState(null)

  async function load() {
    if (!id) return
    setLoading(true)
    setLoadError('')
    try {
      const { data: co, error: coErr } = await supabase.from('companies').select('*').eq('id', id).maybeSingle()
      if (coErr) throw coErr
      if (!co) { setCompany(null); setLoadError('Company not found'); setLoading(false); return }
      const [ct, tk, mt, op, sg] = await Promise.all([
        supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
        supabase.from('tasks').select('*').eq('company_id', id).order('due_date', { ascending: true }),
        supabase.from('meetings_calls').select('*').eq('company_id', id).order('scheduled_at', { ascending: false }),
        supabase.from('opportunities').select('*').eq('company_id', id).not('state', 'eq', 'deleted').order('updated_at', { ascending: false }),
        supabase.from('research_signals').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
      ])
      setCompany(co)
      setContacts(ct.data || [])
      setTasks(tk.data || [])
      setMeetings(mt.data || [])
      setOpps(op.data || [])
      setSignals(sg.data || [])
      if (co.owner_id) {
        const { data: opProfile } = await supabase.from('profiles').select('id, full_name, email, role').eq('id', co.owner_id).maybeSingle()
        setOwnerProfile(opProfile)
      } else setOwnerProfile(null)
    } catch (e) {
      setLoadError(e.message || 'Failed to load company')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => {
    setTab('overview'); setSelectedOpp(null); setShowContact(false); setShowTask(false)
    setShowMeeting(false); setShowOpp(false); setShowEdit(false)
  }, [id])

  function showFlash(msg) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  async function openTransfer() {
    const { data } = await supabase.from('profiles').select('id, full_name, email, role').eq('is_active', true).order('full_name')
    setTeamProfiles(data || [])
    setTransferTo(''); setTransferReason(''); setShowTransfer(true)
  }

  async function confirmTransfer(e) {
    e.preventDefault()
    if (!transferTo || !transferReason.trim()) return
    setTransferBusy(true)
    try {
      await supabase.from('ownership_transfers').insert({
        company_id: id, from_owner_id: company.owner_id, to_owner_id: transferTo,
        purpose: transferReason.trim(), transferred_by: access?.userId || null,
      })
      const { error } = await supabase.from('companies').update({ owner_id: transferTo }).eq('id', id)
      if (error) throw error
      setShowTransfer(false); showFlash('Ownership transferred'); load()
    } catch (err) {
      alert(err.message || 'Transfer failed')
    } finally {
      setTransferBusy(false)
    }
  }

  async function addOpp(e) {
    e.preventDefault()
    if (!canCreateActivity(access, company?.owner_id)) {
      alert('Only the Account Owner can create opportunities. Admin: Transfer ownership to yourself first.')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await createOppWithOptionalTask(oForm, id)
      if (error) throw error
      setShowOpp(false); setOForm({ ...EMPTY_OPP_FORM }); await load(); showFlash('Opportunity created')
    } catch (err) {
      alert(err.message || 'Could not create opportunity')
    } finally {
      setSaving(false)
    }
  }

  function onLifecycleChange(val) {
    if (val === 'not_qualified') { setNqReason(''); setShowNotQualified(true); return }
    updateLifecycle(val, null)
  }

  async function updateLifecycle(val, notQualifiedReason) {
    const patch = { lifecycle_status: val }
    if (val === 'not_qualified' && notQualifiedReason) patch.not_qualified_reason = notQualifiedReason
    const { error } = await supabase.from('companies').update(patch).eq('id', id)
    if (error) alert(error.message); else load()
  }

  async function saveNotQualified(e) {
    e.preventDefault()
    if (!nqReason) return
    setShowNotQualified(false)
    await updateLifecycle('not_qualified', nqReason)
  }

  function openEdit() {
    setEForm({
      name: company.name || '', legal_name: company.legal_name || '', short_name: company.short_name || '',
      address: company.address || '', city: company.city || '', pincode: company.pincode || '', country: company.country || '',
      hq: company.hq || company.hq_location || '', board_no: company.board_no || '',
      employees: company.employees || company.employee_count || '', gst: company.gst || company.gst_no || company.gstin || '',
      website: company.website || '', email: company.email || '', industry: company.industry || '', notes: company.notes || '',
      locations: (company.metadata && company.metadata.locations) || [],
    })
    setShowEdit(true)
  }

  async function saveCompany(e) {
    e.preventDefault()
    setSaving(true)
    const meta = { ...(company.metadata || {}), locations: eForm.locations || [] }
    // Form uses "employees" / "gst" labels; DB columns are employee_count / gst_no only.
    // Never write "employees" or "gst" — those columns do not exist.
    const empRaw = eForm.employees
    const empVal = empRaw === '' || empRaw == null ? null : Number(empRaw)
    const payload = {
      name: eForm.name,
      legal_name: eForm.legal_name || null,
      short_name: eForm.short_name || null,
      address: eForm.address || null,
      city: eForm.city || null,
      pincode: eForm.pincode || null,
      country: eForm.country || null,
      hq: eForm.hq || null,
      board_no: eForm.board_no || null,
      employee_count: empVal != null && !Number.isNaN(empVal) ? empVal : null,
      gst_no: eForm.gst || null,
      website: eForm.website || null,
      email: eForm.email || null,
      industry: eForm.industry || null,
      notes: eForm.notes || null,
      metadata: meta,
    }
    let { error } = await supabase.from('companies').update(payload).eq('id', id)

    // If a specific optional column is missing, drop ONLY that column and retry.
    // Do not substitute invalid column names (employees / gst).
    async function dropColAndRetry(col) {
      if (!error || !String(error.message || '').includes(col)) return
      delete payload[col]
      ;({ error } = await supabase.from('companies').update(payload).eq('id', id))
    }
    await dropColAndRetry('employee_count')
    await dropColAndRetry('gst_no')
    await dropColAndRetry('hq')
    await dropColAndRetry('short_name')
    await dropColAndRetry('board_no')
    await dropColAndRetry('pincode')
    await dropColAndRetry('industry')
    await dropColAndRetry('country')

    setSaving(false)
    if (error) alert(error.message); else { setShowEdit(false); load(); showFlash('Company updated') }
  }

  async function checkDup(field, value) {
    const v = (value || '').trim()
    if (!v) { setDupHints(h => ({ ...h, [field]: '' })); return }
    let q = supabase.from('contacts').select('id, full_name, company_id').neq('company_id', id).limit(3)
    if (field === 'email') q = q.ilike('email', v)
    else if (field === 'phone') q = q.eq('phone', v)
    else if (field === 'phone_mobile_2') q = q.eq('phone_mobile_2', v)
    const { data } = await q
    setDupHints(h => ({ ...h, [field]: data && data.length ? `Also on another company (${data[0].full_name})` : '' }))
  }

  async function saveContact(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      full_name: cForm.full_name, job_title: cForm.job_title || null, role: cForm.role || null,
      email: cForm.email || null, phone: cForm.phone || null, phone_mobile_2: cForm.phone_mobile_2 || null,
      phone_landline: cForm.phone_landline || null, phone_extension: cForm.phone_extension || null,
      company_id: id, metadata: { promo_opt_out: !!cForm.promo_opt_out },
    }
    let error
    if (editingContactId) ({ error } = await supabase.from('contacts').update(payload).eq('id', editingContactId))
    else ({ error } = await supabase.from('contacts').insert(payload))
    setSaving(false)
    if (error) alert(error.message); else { setShowContact(false); load(); showFlash('Contact saved') }
  }

  function openMove(ct) {
    setMoveContact(ct)
    setMoveForm({ mode: isLeft(ct) ? 'transfer' : 'left', new_company_id: '', job_title: ct.job_title || '', role: ct.role || '', notes: '', left_reason: leftReason(ct) || '' })
  }

  async function saveMove(e) {
    e.preventDefault()
    setSaving(true)
    if (moveForm.mode === 'left') {
      const meta = { ...(moveContact.metadata || {}), left_reason: moveForm.left_reason || '', left_at: new Date().toISOString() }
      const { error } = await supabase.from('contacts').update({ contact_status: 'left', metadata: meta }).eq('id', moveContact.id)
      setSaving(false)
      if (error) alert(error.message); else { setMoveContact(null); load() }
    } else {
      if (!moveForm.new_company_id) { setSaving(false); alert('Select the new company.'); return }
      const meta = { ...(moveContact.metadata || {}), previous_company_id: id, transferred_at: new Date().toISOString() }
      const { error } = await supabase.from('contacts').update({
        company_id: moveForm.new_company_id, job_title: moveForm.job_title || null,
        role: moveForm.role || null, contact_status: 'active', metadata: meta,
      }).eq('id', moveContact.id)
      setSaving(false)
      if (error) alert(error.message); else { setMoveContact(null); load() }
    }
  }

  async function restoreContact(ct) {
    const { error } = await supabase.from('contacts').update({ contact_status: 'active' }).eq('id', ct.id)
    if (error) alert(error.message); else load()
  }

  async function addTask(e) {
    e.preventDefault()
    if (!canCreateActivity(access, company?.owner_id)) { alert('Only the Account Owner can create tasks.'); return }
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      company_id: id, title: tForm.title, description: tForm.description || null,
      priority: tForm.priority || 'medium', due_date: tForm.due_at || null, status: 'open',
      created_by: access?.userId || null,
    })
    setSaving(false)
    if (error) alert(error.message); else { setShowTask(false); setTForm({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' }); load() }
  }

  async function addMeeting(e) {
    e.preventDefault()
    if (!canCreateActivity(access, company?.owner_id)) { alert('Only the Account Owner can log calls/meetings.'); return }
    setSaving(true)
    const { error } = await supabase.from('meetings_calls').insert({
      company_id: id, type: mForm.type || 'call', subject: mForm.subject, notes: mForm.description || null,
      outcome: mForm.outcome || null, scheduled_at: mForm.scheduled_at || null, status: mForm.status || 'open',
      created_by: access?.userId || null,
    })
    setSaving(false)
    if (error) alert(error.message); else { setShowMeeting(false); load() }
  }

  async function saveEditTask(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('tasks').update({
      title: editTask.title, status: editTask.status, priority: editTask.priority,
      due_date: editTask.due_at || null,
    }).eq('id', editTask.id)
    setSaving(false)
    if (error) alert(error.message); else { setEditTask(null); load() }
  }

  async function saveEditMeeting(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('meetings_calls').update({
      type: editMeeting.type, subject: editMeeting.subject, outcome: editMeeting.outcome || null,
      status: editMeeting.status, scheduled_at: editMeeting.scheduled_at || null,
    }).eq('id', editMeeting.id)
    setSaving(false)
    if (error) alert(error.message); else { setEditMeeting(null); load() }
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
  const mayCreate = canCreateActivity(access, company.owner_id)
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: `Contacts (${activeContacts.length}${leftContacts.length ? ` · ${leftContacts.length} left` : ''})` },
    { id: 'tasks', label: `Tasks (${tasks.filter(t => isTaskOpen(t.status)).length})` },
    { id: 'meetings', label: `Meetings (${meetings.length})` },
    { id: 'opps', label: `Opportunities (${opps.length})` },
    { id: 'quoted', label: 'Quoted items' },
  ]

  return (
    <>
      <CompanyDetailBody
        access={access} activeContacts={activeContacts} company={company} contacts={contacts}
        flash={flash} go={go} id={id} leftContacts={leftContacts} mayCreate={mayCreate}
        meetings={meetings} opps={opps} ownerProfile={ownerProfile} signals={signals}
        tab={tab} tabs={tabs} tasks={tasks} setTab={setTab}
        openEdit={openEdit} openTransfer={openTransfer} onLifecycleChange={onLifecycleChange}
        setShowContact={setShowContact} setEditingContactId={setEditingContactId} setCForm={setCForm} setDupHints={setDupHints}
        setShowTask={setShowTask} setTForm={setTForm} setShowMeeting={setShowMeeting} setMForm={setMForm}
        setShowOpp={setShowOpp} setOForm={setOForm} openMove={openMove} restoreContact={restoreContact}
        setEditTask={setEditTask} setEditMeeting={setEditMeeting} selectedOpp={selectedOpp} setSelectedOpp={setSelectedOpp} load={load}
      />
      <CompanyDetailModals
        company={company} contacts={contacts} id={id} saving={saving}
        cForm={cForm} setCForm={setCForm} dupHints={dupHints} setDupHints={setDupHints} checkDup={checkDup}
        editingContactId={editingContactId} showContact={showContact} setShowContact={setShowContact} saveContact={saveContact}
        moveContact={moveContact} setMoveContact={setMoveContact} moveForm={moveForm} setMoveForm={setMoveForm} saveMove={saveMove}
        showTask={showTask} setShowTask={setShowTask} tForm={tForm} setTForm={setTForm} addTask={addTask}
        editTask={editTask} setEditTask={setEditTask} saveEditTask={saveEditTask}
        showMeeting={showMeeting} setShowMeeting={setShowMeeting} mForm={mForm} setMForm={setMForm} addMeeting={addMeeting}
        editMeeting={editMeeting} setEditMeeting={setEditMeeting} saveEditMeeting={saveEditMeeting}
        showOpp={showOpp} setShowOpp={setShowOpp} oForm={oForm} setOForm={setOForm} addOpp={addOpp}
        showEdit={showEdit} setShowEdit={setShowEdit} eForm={eForm} setEForm={setEForm} saveCompany={saveCompany}
        showNotQualified={showNotQualified} setShowNotQualified={setShowNotQualified} nqReason={nqReason} setNqReason={setNqReason} saveNotQualified={saveNotQualified}
        showTransfer={showTransfer} setShowTransfer={setShowTransfer} transferTo={transferTo} setTransferTo={setTransferTo}
        transferReason={transferReason} setTransferReason={setTransferReason} transferBusy={transferBusy}
        teamProfiles={teamProfiles} ownerProfile={ownerProfile} confirmTransfer={confirmTransfer}
      />
    </>
  )
}
