import { LIFECYCLE, isTaskOpen, lifecycleLabel, oppStageLabel, notQualifiedReasonLabel, SIGNAL_TYPES } from '../constants'
import { isOwner } from '../access'
import { isLeft, phoneLine, leftReason } from './companyDetailHelpers'
import CompanyQuotedItems from '../components/CompanyQuotedItems'
import { OpportunityDetail, EMPTY_OPP_FORM } from '../components/OpportunityShared'
import { Badge } from '../ui'

export default function CompanyDetailBody(p) {
  const {
    access, activeContacts, company, contacts, flash, go, id, leftContacts, mayCreate,
    meetings, opps, ownerProfile, signals, tab, tabs, tasks, setTab,
    openEdit, openTransfer, onLifecycleChange,
    setShowContact, setEditingContactId, setCForm, setDupHints,
    setShowTask, setTForm, setShowMeeting, setMForm, setShowOpp, setOForm,
    openMove, restoreContact, setEditTask, setEditMeeting,
    selectedOpp, setSelectedOpp, load,
  } = p

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
              {ownerProfile && <span style={{ fontSize: 12, color: '#64748b' }}>Owner: {ownerProfile.full_name || ownerProfile.email}</span>}
              {access?.role === 'admin' && (
                <button type="button" className="btn" style={{ fontSize: 12, minHeight: 32, padding: '4px 10px' }} onClick={openTransfer}>Transfer</button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <button type="button" className="btn" onClick={openEdit}>Edit</button>
            <button type="button" className="btn" onClick={() => { setEditingContactId(null); setCForm({ full_name: '', job_title: '', role: '', email: '', phone: '', phone_mobile_2: '', phone_landline: '', phone_extension: '', promo_opt_out: false }); setDupHints({ email: '', phone: '', phone_mobile_2: '' }); setShowContact(true) }}>+ Contact</button>
            <button type="button" className="btn" disabled={!mayCreate} title={!mayCreate ? 'Only Account Owner can create tasks' : undefined} onClick={() => { if (!mayCreate) { alert('Only the Account Owner can create tasks. Admin: use Transfer to take ownership first.'); return } setTForm({ title: '', description: '', priority: 'medium', due_at: '', contact_id: '' }); setShowTask(true) }}>+ Task</button>
            <button type="button" className="btn" disabled={!mayCreate} title={!mayCreate ? 'Only Account Owner can log calls/meetings' : undefined} onClick={() => { if (!mayCreate) { alert('Only the Account Owner can log calls/meetings. Admin: use Transfer to take ownership first.'); return } setMForm({ type: 'call', subject: '', description: '', outcome: '', next_action: '', scheduled_at: '', status: 'open', contact_id: '' }); setShowMeeting(true) }}>+ Call/Meeting</button>
            <button type="button" className="btn primary" disabled={!mayCreate} title={!mayCreate ? 'Only Account Owner can create opportunities' : undefined} onClick={() => { if (!mayCreate) { alert('Only the Account Owner can create opportunities. Admin: use Transfer to take ownership first.'); return } setOForm({ ...EMPTY_OPP_FORM }); setShowOpp(true) }}>+ Opportunity</button>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>
          {[company.legal_name, company.city, company.pincode, company.hq ? 'HQ: ' + company.hq : null, company.employees ? company.employees + ' emp' : null].filter(Boolean).join(' · ')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} type="button" className="btn" onClick={() => setTab(t.id)} style={{ background: tab === t.id ? '#2563eb' : '#fff', color: tab === t.id ? '#fff' : '#0f172a' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Legal name</div>{company.legal_name || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Website</div>{company.website ? <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Email</div>{company.email || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>GST</div>{company.gst_no || company.gst || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Employees</div>{company.employee_count ?? company.employees ?? '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Board Tele No</div>{company.board_no || '—'}</div>
            <div><div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>HQ</div>{company.hq_location || company.hq || '—'}</div>
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

      {tab === 'contacts' && (
        <div>
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead><tr><th>Name</th><th>Title</th><th>Role</th><th>Email</th><th>Phones</th><th></th></tr></thead>
            <tbody>
              {activeContacts.map(ct => {
                const optOut = ct.metadata && ct.metadata.promo_opt_out
                return (
                  <tr key={ct.id}>
                    <td style={{ fontWeight: 600 }}>{ct.full_name}{optOut && <span style={{ marginLeft: 6 }}><Badge tone="yellow">No promo</Badge></span>}</td>
                    <td>{ct.job_title || '—'}</td>
                    <td>{ct.role || '—'}</td>
                    <td>{ct.email || '—'}</td>
                    <td>{phoneLine(ct)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn" style={{ fontSize: 11, marginRight: 4 }} onClick={() => { setEditingContactId(ct.id); setCForm({ full_name: ct.full_name || '', job_title: ct.job_title || '', role: ct.role || '', email: ct.email || '', phone: ct.phone || '', phone_mobile_2: ct.phone_mobile_2 || '', phone_landline: ct.phone_landline || '', phone_extension: ct.phone_extension || '', promo_opt_out: !!(ct.metadata && ct.metadata.promo_opt_out) }); setShowContact(true) }}>Edit</button>
                      <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => openMove(ct)}>Move</button>
                    </td>
                  </tr>
                )
              })}
              {!activeContacts.length && <tr><td colSpan={6} style={{ color: '#64748b' }}>No active contacts</td></tr>}
            </tbody>
          </table>
          {!!leftContacts.length && (
            <>
              <h3 style={{ fontSize: 13, color: '#64748b', marginTop: 20 }}>Left</h3>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead><tr><th>Name</th><th>Reason</th><th>Phones</th><th></th></tr></thead>
                <tbody>
                  {leftContacts.map(ct => (
                    <tr key={ct.id}>
                      <td style={{ fontWeight: 600 }}>{ct.full_name}<span style={{ marginLeft: 6 }}><Badge tone="gray">Left</Badge></span></td>
                      <td style={{ color: '#64748b' }}>{leftReason(ct) || '—'}</td>
                      <td>{phoneLine(ct)}</td>
                      <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => restoreContact(ct)}>Restore</button></td>
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
          <thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Due</th><th></th></tr></thead>
          <tbody>
            {tasks.map(t => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>{t.priority}</td>
                <td>{t.status}</td>
                <td>{t.due_at ? String(t.due_at).slice(0, 10) : (t.due_date ? String(t.due_date).slice(0, 10) : '—')}</td>
                <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setEditTask({ ...t, due_at: (t.due_at || t.due_date) ? String(t.due_at || t.due_date).slice(0, 10) : '' })}>Edit</button></td>
              </tr>
            ))}
            {!tasks.length && <tr><td colSpan={5} style={{ color: '#64748b' }}>No tasks</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'meetings' && (
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead><tr><th>Type</th><th>Subject</th><th>When</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {meetings.map(m => (
              <tr key={m.id}>
                <td>{m.type || '—'}</td>
                <td>{m.subject || '—'}</td>
                <td>{m.scheduled_at ? String(m.scheduled_at).replace('T', ' ').slice(0, 16) : '—'}</td>
                <td>{m.status || '—'}</td>
                <td><button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setEditMeeting(m)}>Edit</button></td>
              </tr>
            ))}
            {!meetings.length && <tr><td colSpan={5} style={{ color: '#64748b' }}>No meetings or calls</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'opps' && (
        <div>
          {selectedOpp ? (
            <>
              <div style={{ padding: 12 }}><button type="button" className="btn" onClick={() => setSelectedOpp(null)}>← Back to list</button></div>
              <OpportunityDetail opportunity={selectedOpp} contacts={activeContacts} onClose={() => setSelectedOpp(null)} onSaved={() => load()} />
            </>
          ) : (
            <table className="table" style={{ width: '100%', fontSize: 13 }}>
              <thead><tr><th>Name</th><th>Stage</th><th>Deal size</th></tr></thead>
              <tbody>
                {opps.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOpp(r)}>
                    <td>{r.name}</td>
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

      {tab === 'quoted' && (
        <CompanyQuotedItems
          companyId={id}
          opportunities={opps}
          onOpenOpportunity={(o) => { setTab('opps'); setSelectedOpp(o) }}
        />
      )}
    </div>
  )
}
