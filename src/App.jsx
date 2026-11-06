import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { AuthCtx, useAccessLoader } from './access'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Contacts from './pages/Contacts'
import Tasks from './pages/Tasks'
import MeetingsCalls from './pages/MeetingsCalls'
import Opportunities from './pages/Opportunities'
import Research from './pages/Research'
import Settings from './pages/Settings'
import Trash from './pages/Trash'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [selectedCompanyId, setSelectedCompanyId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [access] = useAccessLoader(session)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { setMenuOpen(false) }, [page, selectedCompanyId])

  if (loading || (session && access.loading)) {
    return <div className="loading">Loading Hexagon B2B...</div>
  }
  if (!session) return <Login />

  if (access.profile && access.profile.active === false) {
    return (
      <div className="empty" style={{ padding: 40 }}>
        Your account is inactive. Contact Admin.
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    )
  }

  const go = (p, companyId = null) => {
    setPage(p)
    setSelectedCompanyId(companyId)
    setMenuOpen(false)
  }

  const nav = [
    ['dashboard', 'Action Centre'],
    ['companies', 'Companies'],
    ['contacts', 'Contacts'],
    ['tasks', 'Tasks'],
    ['meetings', 'Meetings & Calls'],
    ['opportunities', 'Opportunities'],
    ['research', 'Research & Signals'],
    ['trash', 'Deleted items'],
    ['settings', 'Settings'],
  ]

  const roleTag = access.profile?.role === 'admin'
    ? 'Admin'
    : access.profile?.role === 'service'
      ? 'Service'
      : access.profile?.role === 'sales'
        ? 'Sales'
        : null

  const pageLabel = page === 'company'
    ? 'Company'
    : (nav.find(([id]) => id === page)?.[1] || 'Hexagon B2B')

  return (
    <AuthCtx.Provider value={access}>
      <div className="app-shell">
        <header className="mobile-bar">
          <button type="button" className="menu-toggle" aria-label="Open menu" onClick={() => setMenuOpen(true)}>☰</button>
          <div className="mobile-bar-title">
            <div className="mobile-bar-eyebrow">HEXAGON B2B{roleTag ? ` · ${roleTag}` : ''}</div>
            <div>{pageLabel}</div>
          </div>
        </header>

        {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />}

        <aside className={`app-nav ${menuOpen ? 'open' : ''}`}>
          <div className="nav-brand">
            <div className="nav-brand-eyebrow">HEXAGON B2B</div>
            <div className="nav-brand-title">Sales & Business OS</div>
            <button type="button" className="nav-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button>
          </div>
          <nav className="nav-links">
            {nav.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className={page === id || (page === 'company' && id === 'companies') ? 'nav-link active' : 'nav-link'}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="nav-footer">
            <div className="nav-email">{session.user.email}</div>
            {roleTag && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{roleTag}</div>}
            <button
              type="button"
              className="btn"
              style={{ width: '100%', background: '#1e293b', color: '#e2e8f0', border: 'none' }}
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="app-main">
          {page === 'dashboard' && <Dashboard go={go} access={access} />}
          {page === 'companies' && <Companies go={go} access={access} />}
          {page === 'contacts' && <Contacts go={go} access={access} />}
          {page === 'company' && selectedCompanyId && <CompanyDetail id={selectedCompanyId} go={go} access={access} />}
          {page === 'company' && !selectedCompanyId && (
            <div className="empty" style={{ padding: 40 }}>
              No company selected.
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => go('companies')}>← Companies</button>
              </div>
            </div>
          )}
          {page === 'tasks' && <Tasks go={go} access={access} />}
          {page === 'meetings' && <MeetingsCalls go={go} access={access} />}
          {page === 'opportunities' && <Opportunities go={go} access={access} />}
          {page === 'research' && <Research go={go} access={access} />}
          {page === 'trash' && <Trash go={go} access={access} />}
          {page === 'settings' && <Settings />}
        </main>
      </div>
    </AuthCtx.Provider>
  )
}
