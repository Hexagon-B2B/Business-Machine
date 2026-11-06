import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PageHead, Field, Modal, Actions, Badge, CompanySearchSelect } from '../ui'
import { useAuth } from '../access'

const STORAGE_KEY = 'hexagon_project_links'
const DEFAULT_LINKS = [
  { id: 'github', label: 'GitHub repo', url: 'https://github.com/Hexagon-B2B/Business-Machine' },
  { id: 'live', label: 'Live app', url: 'https://hexagon-b2b-os.vercel.app' },
]

function loadLinks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LINKS.map(l => ({ ...l }))
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length) return parsed
  } catch {}
  return DEFAULT_LINKS.map(l => ({ ...l }))
}
function saveLinks(links) { localStorage.setItem(STORAGE_KEY, JSON.stringify(links)) }
function roleLabel(role) {
  if (role === 'admin') return 'Admin'
  if (role === 'service') return 'Service'
  return 'Sales'
}

export default function Settings() {
  const auth = useAuth()
  const isAdmin = auth?.isAdmin
  const [links, setLinks] = useState(() => loadLinks())
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [team, setTeam] = useState([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'sales' })
  const [assignUser, setAssignUser] = useState(null)
  const [assignIds, setAssignIds] = useState([])
  const [pickCompany, setPickCompany] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)

  useEffect(() => { setLinks(loadLinks()) }, [])
  useEffect(() => { if (isAdmin) loadTeam() }, [isAdmin])

  function flash(m) { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 3500) }
  function flashErr(m) { setErr(m); setMsg('') }

  async function loadTeam() {
    setTeamLoading(true)
    const { data, error } = await supabase.from('profiles').select('id, email, full_name, role, active, created_at').order('created_at', { ascending: true })
    if (error) { flashErr('Team list needs SQL 014. Run sql/014_profiles_assignments.sql in Supabase. (' + error.message + ')'); setTeam([]) }
    else setTeam(data || [])
    setTeamLoading(false)
  }

  function addLink(e) {
    e.preventDefault()
    const l = label.trim(); let u = url.trim()
    if (!l || !u) { flash('Label and URL are required.'); return }
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    const next = [...links, { id: 'custom_' + Date.now(), label: l, url: u }]
    setLinks(next); saveLinks(next); setLabel(''); setUrl(''); flash('Link added.')
  }
  function removeLink(id) {
    const next = links.filter(x => x.id !== id); setLinks(next); saveLinks(next); flash('Link removed.')
  }
  function resetDefaults() {
    const next = DEFAULT_LINKS.map(l => ({ ...l })); setLinks(next); saveLinks(next); flash('Reset to defaults.')
  }

  async function createTeamUser(e) {
    e.preventDefault()
    const email = form.email.trim().toLowerCase()
    const password = form.password
    const full_name = form.full_name.trim()
    const role = form.role === 'service' ? 'service' : 'sales'
    if (!email || !password) { flashErr('Email and temporary password are required.'); return }
    if (password.length < 8) { flashErr('Password must be at least 8 characters.'); return }
    setSaving(true); setErr('')
    let created = null
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch('/api/create-team-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: session?.access_token ? `Bearer ${session.access_token}` : '' },
        body: JSON.stringify({ email, password, full_name, role }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.userId) created = body
      else if (res.status !== 404 && res.status !== 501) { setSaving(false); flashErr(body.error || 'Could not create user via API.'); return }
    } catch {}
    if (!created) {
      const { data: signData, error: signErr } = await supabase.auth.signUp({ email, password, options: { data: { full_name, role } } })
      if (signErr) { setSaving(false); flashErr(signErr.message); return }
      const newId = signData?.user?.id
      if (!newId) { setSaving(false); flashErr('User may need email confirmation. Configure /api/create-team-user or disable email confirm in Supabase.'); return }
      const { error: pErr } = await supabase.from('profiles').upsert({ id: newId, email, full_name: full_name || email.split('@')[0], role, active: true, updated_at: new Date().toISOString() })
      if (pErr) { setSaving(false); flashErr('Auth user created but profile failed: ' + pErr.message + ' — run SQL 014.'); return }
      await supabase.auth.signOut()
      setSaving(false); setShowCreate(false); setForm({ full_name: '', email: '', password: '', role: 'sales' })
      flashErr('Account created. Sign in again as Admin, then assign companies.')
      return
    }
    setSaving(false); setShowCreate(false); setForm({ full_name: '', email: '', password: '', role: 'sales' })
    flash('Account created for ' + email + '. Assign companies next.'); await loadTeam()
  }

  async function openAssign(user) {
    setAssignUser(user); setPickCompany('')
    const { data } = await supabase.from('company_assignments').select('company_id, companies(name)').eq('user_id', user.id)
    setAssignIds((data || []).map(r => ({ id: r.company_id, name: r.companies?.name || r.company_id })))
  }
  async function addAssignment() {
    if (!assignUser || !pickCompany) return
    if (assignIds.some(a => a.id === pickCompany)) { flash('Already assigned.'); return }
    setAssignBusy(true)
    const { error } = await supabase.from('company_assignments').insert({ user_id: assignUser.id, company_id: pickCompany, assigned_by: auth?.profile?.id || null })
    setAssignBusy(false)
    if (error) { flashErr(error.message); return }
    setPickCompany(''); await openAssign(assignUser); flash('Company assigned.')
  }
  async function removeAssignment(companyId) {
    if (!assignUser) return
    setAssignBusy(true)
    const { error } = await supabase.from('company_assignments').delete().eq('user_id', assignUser.id).eq('company_id', companyId)
    setAssignBusy(false)
    if (error) { flashErr(error.message); return }
    await openAssign(assignUser)
  }
  async function setActive(user, active) {
    const { error } = await supabase.from('profiles').update({ active, updated_at: new Date().toISOString() }).eq('id', user.id)
    if (error) flashErr(error.message)
    else { flash(active ? 'User activated.' : 'User deactivated.'); loadTeam() }
  }

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Workspace" title="Settings" subtitle="Project links, team accounts, and company access. Team management is Admin only." />
      {msg && <div className="notice" style={{ marginBottom: 12, background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>{msg}</div>}
      {err && <div className="notice" style={{ marginBottom: 12, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>{err}</div>}

      {isAdmin && (
        <div className="card" style={{ marginBottom: 16, maxWidth: 720 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <h2 style={{ fontSize: 15, marginBottom: 4 }}>Team accounts</h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Admin sees all companies. Sales and Service only see companies you assign.</p>
            </div>
            <button type="button" className="btn primary" onClick={() => setShowCreate(true)}>+ Create account</button>
          </div>
          {teamLoading ? <div className="loading" style={{ padding: 20 }}>Loading team…</div>
            : team.length === 0 ? <div className="empty" style={{ padding: 16 }}>No profiles yet. Run sql/014_profiles_assignments.sql in Supabase, then refresh.</div>
            : (
              <table className="table" style={{ minWidth: 0 }}>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {team.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.full_name || '—'}</td>
                      <td>{u.email}</td>
                      <td><Badge tone={u.role === 'admin' ? 'blue' : u.role === 'service' ? 'yellow' : 'green'}>{roleLabel(u.role)}</Badge></td>
                      <td>{u.active === false ? <Badge tone="gray">Inactive</Badge> : <Badge tone="green">Active</Badge>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {u.role !== 'admin' && (
                          <>
                            <button type="button" className="btn" style={{ fontSize: 11, marginRight: 4 }} onClick={() => openAssign(u)}>Assign companies</button>
                            <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setActive(u, u.active === false)}>{u.active === false ? 'Activate' : 'Deactivate'}</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>Optional: set SUPABASE_SERVICE_ROLE_KEY on Vercel for /api/create-team-user.</p>
        </div>
      )}

      {!isAdmin && (
        <div className="card" style={{ marginBottom: 16, maxWidth: 640 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Your access</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Role: <strong>{roleLabel(auth?.profile?.role)}</strong>. You only see companies assigned by Admin.</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>Project links</h2>
        {links.length === 0 ? <div className="empty" style={{ padding: 12 }}>No links yet.</div> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
            {links.map(link => (
              <li key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid #f1f5f9', minHeight: 48 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{link.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', wordBreak: 'break-all' }}>{link.url}</div>
                </div>
                <a className="btn primary" href={link.url} target="_blank" rel="noreferrer">Open</a>
                <button type="button" className="btn" onClick={() => removeLink(link.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addLink}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Label"><input className="input" value={label} onChange={e => setLabel(e.target.value)} /></Field>
            <Field label="URL"><input className="input" value={url} onChange={e => setUrl(e.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn primary">Add link</button>
            <button type="button" className="btn" onClick={resetDefaults}>Reset defaults</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>About this workspace</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Hexagon B2B — Admin / Sales / Service. Same screens; data scoped by company assignment for team users.</p>
      </div>

      {showCreate && (
        <Modal title="Create team account" onClose={() => setShowCreate(false)} width={480}>
          <form onSubmit={createTeamUser}>
            <Field label="Full name"><input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Email *"><input className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Temporary password *"><input className="input" type="text" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Role *">
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="sales">Sales</option>
                <option value="service">Service</option>
              </select>
            </Field>
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create account" />
          </form>
        </Modal>
      )}

      {assignUser && (
        <Modal title={`Assign companies — ${assignUser.full_name || assignUser.email}`} onClose={() => setAssignUser(null)} width={520}>
          <Field label="Add company">
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><CompanySearchSelect value={pickCompany} onChange={setPickCompany} placeholder="Type company name…" /></div>
              <button type="button" className="btn primary" disabled={assignBusy || !pickCompany} onClick={addAssignment}>Add</button>
            </div>
          </Field>
          {assignIds.length === 0 ? <div className="empty" style={{ padding: 16 }}>No companies assigned yet.</div> : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {assignIds.map(a => (
                <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 600 }}>{a.name}</span>
                  <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => removeAssignment(a.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 14, textAlign: 'right' }}><button type="button" className="btn" onClick={() => setAssignUser(null)}>Done</button></div>
        </Modal>
      )}
    </div>
  )
}
