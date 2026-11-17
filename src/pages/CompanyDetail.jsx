import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, ROLES, OPP_STAGES, isTaskOpen, isTaskClosed, lifecycleLabel, oppStageLabel, NOT_QUALIFIED_REASONS } from '../constants'
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
  const [showOpp, setShowOpp] = useState(false)
  const [oppForm, setOppForm] = useState({ ...EMPTY_OPP_FORM })
  const [openOppId, setOpenOppId] = useState(null)
  const [ownerProfile, setOwnerProfile] = useState(null)
  const [flash, setFlash] = useState('')
  const [saving, setSaving] = useState(false)

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
        const [ct, tk, mt, op] = await Promise.all([
          supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
          supabase.from('tasks').select('*').eq('company_id', id).order('due_date', { ascending: true }),
          supabase.from('meetings_calls').select('*').eq('company_id', id).order('scheduled_at', { ascending: false }),
          supabase.from('opportunities').select('*').eq('company_id', id).not('state', 'eq', 'deleted').order('updated_at', { ascending: false }),
        ])
        if (cancelled) return
        setCompany(co)
        setContacts(ct.data || [])
        setTasks(tk.data || [])
        setMeetings(mt.data || [])
        setOpps(op.data || [])
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
    setShowOpp(false)
  }, [id])

  async function reloadOpps() {
    const { data } = await supabase.from('opportunities').select('*').eq('company_id', id).not('state', 'eq', 'deleted').order('updated_at', { ascending: false })
    setOpps(data || [])
  }

  async function saveOpp(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await createOppWithOptionalTask({ companyId: id, form: oppForm, access })
      setShowOpp(false)
      setOppForm({ ...EMPTY_OPP_FORM })
      await reloadOpps()
      setFlash('Opportunity created')
      setTimeout(() => setFlash(''), 2500)
    } catch (err) {
      setFlash(err.message || 'Could not create opportunity')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 28 }}>Loading company…</div>
  if (loadError) return (
    <div style={{ padding: 28 }}>
      <button type="button" className="btn" onClick={() => go('companies')}>← Companies</button>
      <div className="notice" style={{ marginTop: 16, color: '#b91c1c' }}>{loadError}</div>
    </div>
  )
  if (!company) return (
    <div style={{ padding: 28 }}>
      <button type="button" className="btn" onClick={() => go('companies')}>← Companies</button>
      <div className="notice" style={{ marginTop: 16 }}>Company not found.</div>
    </div>
  )

  const activeContacts = contacts.filter(c => !isLeft(c))
  const leftContacts = contacts.filter(c => isLeft(c))
  const canAct = canCreateActivity(access, company)
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: `Contacts (${activeContacts.length})` },
    { id: 'tasks', label: `Tasks (${tasks.filter(t => isTaskOpen(t)).length})` },
    { id: 'meetings', label: `Meetings (${meetings.length})` },
    { id: 'opps', label: `Opportunities (${opps.length})` },
  ]

  return (
    <div style={{ padding: 28 }}>
      <button type="button" className="btn" onClick={() => go('companies')}>← Companies</button>
      <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{company.name}</h1>
          {company.legal_name && <div style={{ color: '#64748b', fontSize: 13 }}>{company.legal_name}</div>}
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            {[company.city, company.pincode, company.hq ? 'HQ: ' + company.hq : null, company.employees ? company.employees + ' emp' : null].filter(Boolean).join(' · ')}
          </div>
          {ownerProfile && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Owner: {ownerProfile.full_name || ownerProfile.email}</div>}
          <div style={{ marginTop: 6 }}><Badge>{lifecycleLabel(company.lifecycle_status) || company.lifecycle_status || '—'}</Badge></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {canAct && (
            <button type="button" className="btn primary" onClick={() => { setOppForm({ ...EMPTY_OPP_FORM }); setShowOpp(true) }}>+ Opportunity</button>
          )}
        </div>
      </div>
      {flash && <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} type="button" className="btn" onClick={() => setTab(t.id)} style={{ background: tab === t.id ? '#2563eb' : '#fff', color: tab === t.id ? '#fff' : '#0f172a' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0, fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>Company</h3>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div><strong>Legal name:</strong> {company.legal_name || '—'}</div>
              <div><strong>Website:</strong> {company.website || '—'}</div>
              <div><strong>Email:</strong> {company.email || '—'}</div>
              <div><strong>GST:</strong> {company.gstin || company.gst || '—'}</div>
              <div><strong>Industry:</strong> {company.industry || '—'}</div>
              <div><strong>Board Tele:</strong> {company.board_no || '—'}</div>
              <div style={{ marginTop: 8 }}><strong>Address:</strong> {company.address || '—'}</div>
            </div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0, fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>Snapshot</h3>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>Active contacts: <strong>{activeContacts.length}</strong></div>
              <div>Open tasks: <strong>{tasks.filter(t => isTaskOpen(t)).length}</strong></div>
              <div>Meetings / calls: <strong>{meetings.length}</strong></div>
              <div>Opportunities: <strong>{opps.length}</strong></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div>
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead><tr><th>Name</th><th>Title</th><th>Role</th><th>Email</th><th>Phones</th></tr></thead>
            <tbody>
              {activeContacts.map(ct => (
                <tr key={ct.id}>
                  <td>{ct.full_name}</td>
                  <td>{ct.job_title || '—'}</td>
                  <td>{ct.role || '—'}</td>
                  <td>{ct.email || '—'}</td>
                  <td>{phoneLine(ct)}</td>
                </tr>
              ))}
              {!activeContacts.length && <tr><td colSpan={5} style={{ color: '#64748b' }}>No active contacts</td></tr>}
            </tbody>
          </table>
          {!!leftContacts.length && (
            <>
              <h3 style={{ fontSize: 13, color: '#64748b', marginTop: 20 }}>Left</h3>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead><tr><th>Name</th><th>Reason</th><th>Phones</th></tr></thead>
                <tbody>
                  {leftContacts.map(ct => (
                    <tr key={ct.id}>
                      <td>{ct.full_name}</td>
                      <td style={{ color: '#64748b' }}>{leftReason(ct) || '—'}</td>
                      <td>{phoneLine(ct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead><tr><th>Title</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            {tasks.map(t => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>{t.due_date ? String(t.due_date).slice(0, 10) : '—'}</td>
                <td>{t.priority || '—'}</td>
                <td>{t.status || '—'}</td>
              </tr>
            ))}
            {!tasks.length && <tr><td colSpan={4} style={{ color: '#64748b' }}>No tasks</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'meetings' && (
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead><tr><th>Type</th><th>Subject</th><th>When</th><th>Status</th></tr></thead>
          <tbody>
            {meetings.map(m => (
              <tr key={m.id}>
                <td>{m.type || '—'}</td>
                <td>{m.subject || '—'}</td>
                <td>{m.scheduled_at ? String(m.scheduled_at).replace('T', ' ').slice(0, 16) : '—'}</td>
                <td>{m.status || '—'}</td>
              </tr>
            ))}
            {!meetings.length && <tr><td colSpan={4} style={{ color: '#64748b' }}>No meetings or calls</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'opps' && (
        <div>
          {openOppId ? (
            <OpportunityDetail
              opportunity={opps.find(o => o.id === openOppId) || null}
              company={company}
              contacts={activeContacts}
              onClose={() => setOpenOppId(null)}
              onChanged={reloadOpps}
              access={access}
            />
          ) : (
            <table className="table" style={{ width: '100%', fontSize: 13 }}>
              <thead><tr><th>Name</th><th>Stage</th><th>Deal size</th><th>Updated</th></tr></thead>
              <tbody>
                {opps.map(o => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpenOppId(o.id)}>
                    <td>{o.name}</td>
                    <td>{oppStageLabel(o.stage) || o.stage}</td>
                    <td>{o.deal_size != null ? '₹ ' + Number(o.deal_size).toLocaleString('en-IN') : '—'}</td>
                    <td>{o.updated_at ? String(o.updated_at).slice(0, 10) : '—'}</td>
                  </tr>
                ))}
                {!opps.length && <tr><td colSpan={4} style={{ color: '#64748b' }}>No opportunities</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={720}>
          <form onSubmit={saveOpp}>
            <OpportunityCreateFields form={oppForm} setForm={setOppForm} companyId={id} contacts={activeContacts} />
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}
    </div>
  )
}
