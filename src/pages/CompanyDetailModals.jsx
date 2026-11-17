import { Modal, Field, Actions, CompanySearchSelect } from '../ui'
import { OpportunityCreateFields } from '../components/OpportunityShared'
import { ROLES, NOT_QUALIFIED_REASONS } from '../constants'

export default function CompanyDetailModals(p) {
  const {
    company, contacts, id, saving,
    cForm, setCForm, dupHints, setDupHints, checkDup, editingContactId, showContact, setShowContact, saveContact,
    moveContact, setMoveContact, moveForm, setMoveForm, saveMove,
    showTask, setShowTask, tForm, setTForm, addTask,
    editTask, setEditTask, saveEditTask,
    showMeeting, setShowMeeting, mForm, setMForm, addMeeting,
    editMeeting, setEditMeeting, saveEditMeeting,
    showOpp, setShowOpp, oForm, setOForm, addOpp,
    showEdit, setShowEdit, eForm, setEForm, saveCompany,
    showNotQualified, setShowNotQualified, nqReason, setNqReason, saveNotQualified,
    showTransfer, setShowTransfer, transferTo, setTransferTo, transferReason, setTransferReason,
    transferBusy, teamProfiles, ownerProfile, confirmTransfer,
  } = p

  return (
    <>
      {showContact && (
        <Modal title={editingContactId ? 'Edit contact' : 'Add contact'} onClose={() => setShowContact(false)} width={520}>
          <form onSubmit={saveContact}>
            <Field label="Full name *"><input className="input" required value={cForm.full_name} onChange={e => setCForm({ ...cForm, full_name: e.target.value })} /></Field>
            <Field label="Job title"><input className="input" value={cForm.job_title || ''} onChange={e => setCForm({ ...cForm, job_title: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={cForm.role || ''} onChange={e => setCForm({ ...cForm, role: e.target.value })}><option value="">—</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></Field>
            <Field label="Email"><input className="input" type="email" value={cForm.email || ''} onChange={e => setCForm({ ...cForm, email: e.target.value })} onBlur={e => checkDup('email', e.target.value)} />{dupHints.email && <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>{dupHints.email}</div>}</Field>
            <Field label="Mobile"><input className="input" value={cForm.phone || ''} onChange={e => setCForm({ ...cForm, phone: e.target.value })} onBlur={e => checkDup('phone', e.target.value)} />{dupHints.phone && <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>{dupHints.phone}</div>}</Field>
            <Field label="Mobile 2"><input className="input" value={cForm.phone_mobile_2 || ''} onChange={e => setCForm({ ...cForm, phone_mobile_2: e.target.value })} onBlur={e => checkDup('phone_mobile_2', e.target.value)} />{dupHints.phone_mobile_2 && <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>{dupHints.phone_mobile_2}</div>}</Field>
            <Field label="Landline"><input className="input" value={cForm.phone_landline || ''} onChange={e => setCForm({ ...cForm, phone_landline: e.target.value })} /></Field>
            <Field label="Extension"><input className="input" value={cForm.phone_extension || ''} onChange={e => setCForm({ ...cForm, phone_extension: e.target.value })} /></Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!cForm.promo_opt_out} onChange={e => setCForm({ ...cForm, promo_opt_out: e.target.checked })} />
              Do not send promotional emails
            </label>
            <Actions saving={saving} onCancel={() => setShowContact(false)} label="Save contact" />
          </form>
        </Modal>
      )}

      {moveContact && (
        <Modal title={`Move — ${moveContact.full_name || ''}`} onClose={() => setMoveContact(null)} width={520}>
          <form onSubmit={saveMove}>
            <Field label="What happened?">
              <select className="input" value={moveForm.mode} onChange={e => setMoveForm({ ...moveForm, mode: e.target.value })}>
                <option value="left">Left this company (keep as former)</option>
                <option value="transfer">Moved to another company (transfer)</option>
              </select>
            </Field>
            {moveForm.mode === 'left' ? (
              <Field label="Reason"><input className="input" placeholder="e.g. resigned, mail bounce…" value={moveForm.left_reason} onChange={e => setMoveForm({ ...moveForm, left_reason: e.target.value })} /></Field>
            ) : (
              <>
                <Field label="New company *"><CompanySearchSelect value={moveForm.new_company_id} onChange={v => setMoveForm({ ...moveForm, new_company_id: v })} required placeholder="Type company name (A–Z)…" /></Field>
                <Field label="New job title"><input className="input" value={moveForm.job_title} onChange={e => setMoveForm({ ...moveForm, job_title: e.target.value })} /></Field>
                <Field label="Notes"><textarea className="input" rows={2} value={moveForm.notes} onChange={e => setMoveForm({ ...moveForm, notes: e.target.value })} /></Field>
              </>
            )}
            <Actions saving={saving} onCancel={() => setMoveContact(null)} label={moveForm.mode === 'left' ? 'Mark as left' : 'Transfer'} />
          </form>
        </Modal>
      )}

      {showTask && (
        <Modal title="New task" onClose={() => setShowTask(false)} width={480}>
          <form onSubmit={addTask}>
            <Field label="Title *"><input className="input" required value={tForm.title} onChange={e => setTForm({ ...tForm, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={2} value={tForm.description} onChange={e => setTForm({ ...tForm, description: e.target.value })} /></Field>
            <Field label="Priority"><select className="input" value={tForm.priority} onChange={e => setTForm({ ...tForm, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
            <Field label="Due"><input className="input" type="date" value={tForm.due_at} onChange={e => setTForm({ ...tForm, due_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowTask(false)} label="Create" />
          </form>
        </Modal>
      )}

      {editTask && (
        <Modal title="Edit task" onClose={() => setEditTask(null)} width={480}>
          <form onSubmit={saveEditTask}>
            <Field label="Title *"><input className="input" required value={editTask.title || ''} onChange={e => setEditTask({ ...editTask, title: e.target.value })} /></Field>
            <Field label="Status"><select className="input" value={editTask.status || 'open'} onChange={e => setEditTask({ ...editTask, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="cancelled">Cancelled</option></select></Field>
            <Field label="Priority"><select className="input" value={editTask.priority || 'medium'} onChange={e => setEditTask({ ...editTask, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
            <Field label="Due"><input className="input" type="date" value={editTask.due_at || ''} onChange={e => setEditTask({ ...editTask, due_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setEditTask(null)} label="Save" />
          </form>
        </Modal>
      )}

      {showMeeting && (
        <Modal title="Log call / meeting" onClose={() => setShowMeeting(false)} width={520}>
          <form onSubmit={addMeeting}>
            <Field label="Type"><select className="input" value={mForm.type} onChange={e => setMForm({ ...mForm, type: e.target.value })}><option value="call">Call</option><option value="meeting">Meeting</option><option value="visit">Visit</option><option value="message">Message</option></select></Field>
            <Field label="Subject *"><input className="input" required value={mForm.subject} onChange={e => setMForm({ ...mForm, subject: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={mForm.description} onChange={e => setMForm({ ...mForm, description: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={mForm.outcome} onChange={e => setMForm({ ...mForm, outcome: e.target.value })} /></Field>
            <Field label="When"><input className="input" type="datetime-local" value={mForm.scheduled_at} onChange={e => setMForm({ ...mForm, scheduled_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setShowMeeting(false)} label="Save" />
          </form>
        </Modal>
      )}

      {editMeeting && (
        <Modal title="Edit call / meeting" onClose={() => setEditMeeting(null)} width={520}>
          <form onSubmit={saveEditMeeting}>
            <Field label="Type"><select className="input" value={editMeeting.type || 'call'} onChange={e => setEditMeeting({ ...editMeeting, type: e.target.value })}><option value="call">Call</option><option value="meeting">Meeting</option><option value="visit">Visit</option><option value="message">Message</option></select></Field>
            <Field label="Subject *"><input className="input" required value={editMeeting.subject || ''} onChange={e => setEditMeeting({ ...editMeeting, subject: e.target.value })} /></Field>
            <Field label="Outcome"><input className="input" value={editMeeting.outcome || ''} onChange={e => setEditMeeting({ ...editMeeting, outcome: e.target.value })} /></Field>
            <Field label="Status"><select className="input" value={editMeeting.status || 'open'} onChange={e => setEditMeeting({ ...editMeeting, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="done">Done</option></select></Field>
            <Field label="When"><input className="input" type="datetime-local" value={editMeeting.scheduled_at ? String(editMeeting.scheduled_at).slice(0, 16) : ''} onChange={e => setEditMeeting({ ...editMeeting, scheduled_at: e.target.value })} /></Field>
            <Actions saving={saving} onCancel={() => setEditMeeting(null)} label="Save" />
          </form>
        </Modal>
      )}

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={720}>
          <form onSubmit={addOpp}>
            <OpportunityCreateFields form={oForm} setForm={setOForm} companyId={id} contacts={contacts} />
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create" />
          </form>
        </Modal>
      )}

      {showEdit && (
        <Modal title="Edit company" onClose={() => setShowEdit(false)} width={640}>
          <form onSubmit={saveCompany}>
            <Field label="Name *"><input className="input" required value={eForm.name || ''} onChange={e => setEForm({ ...eForm, name: e.target.value })} /></Field>
            <Field label="Legal name"><input className="input" value={eForm.legal_name || ''} onChange={e => setEForm({ ...eForm, legal_name: e.target.value })} /></Field>
            <Field label="Short name"><input className="input" value={eForm.short_name || ''} onChange={e => setEForm({ ...eForm, short_name: e.target.value })} /></Field>
            <Field label="Address"><input className="input" value={eForm.address || ''} onChange={e => setEForm({ ...eForm, address: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="City"><input className="input" value={eForm.city || ''} onChange={e => setEForm({ ...eForm, city: e.target.value })} /></Field>
              <Field label="Pincode"><input className="input" value={eForm.pincode || ''} onChange={e => setEForm({ ...eForm, pincode: e.target.value })} /></Field>
              <Field label="Country"><input className="input" value={eForm.country || ''} onChange={e => setEForm({ ...eForm, country: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="HQ"><input className="input" value={eForm.hq || ''} onChange={e => setEForm({ ...eForm, hq: e.target.value })} /></Field>
              <Field label="Board Tele No"><input className="input" value={eForm.board_no || ''} onChange={e => setEForm({ ...eForm, board_no: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Employees"><input className="input" value={eForm.employees || ''} onChange={e => setEForm({ ...eForm, employees: e.target.value })} /></Field>
              <Field label="GST"><input className="input" value={eForm.gst || ''} onChange={e => setEForm({ ...eForm, gst: e.target.value })} /></Field>
            </div>
            <Field label="Website"><input className="input" value={eForm.website || ''} onChange={e => setEForm({ ...eForm, website: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={eForm.email || ''} onChange={e => setEForm({ ...eForm, email: e.target.value })} /></Field>
            <Field label="Industry"><input className="input" value={eForm.industry || ''} onChange={e => setEForm({ ...eForm, industry: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={eForm.notes || ''} onChange={e => setEForm({ ...eForm, notes: e.target.value })} /></Field>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Additional locations</div>
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

      {showTransfer && (
        <Modal title="Transfer Account Owner" onClose={() => setShowTransfer(false)} width={480}>
          <form onSubmit={confirmTransfer}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Current owner: <strong>{ownerProfile?.full_name || ownerProfile?.email || 'Unassigned'}</strong>.
              Only Admin can transfer. Purpose is required and stored in the transfer log.
            </p>
            <Field label="New Account Owner *">
              <select className="input" required value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                <option value="">Select person…</option>
                {teamProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name || p.email} ({p.role})</option>
                ))}
              </select>
            </Field>
            <Field label="Purpose of transfer *">
              <textarea className="input" rows={3} required value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="Why is ownership moving?" />
            </Field>
            <Actions saving={transferBusy} onCancel={() => setShowTransfer(false)} label="Confirm transfer" />
          </form>
        </Modal>
      )}
    </>
  )
}
