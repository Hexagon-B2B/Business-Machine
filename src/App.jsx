import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Tasks from './pages/Tasks'
import MeetingsCalls from './pages/MeetingsCalls'
import Opportunities from './pages/Opportunities'
import Research from './pages/Research'
import Trash from './pages/Trash'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [selectedCompanyId, setSelectedCompanyId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

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

  if (loading) return <div className="loading">Loading Hexagon B2B...</div>
  if (!session) return <Login />

  const go = (p, companyId = null) => {
    setPage(p)
    setSelectedCompanyId(companyId)
    setMenuOpen(false)
  }

  const nav = [
    ['dashboard', 'Action Centre'],
    ['companies', 'Companies'],
    ['tasks', 'Tasks'],
    ['meetings', 'Meetings & Calls'],
    ['opportunities', 'Opportunities'],
    ['research', 'Research & Signals'],
    ['trash', 'Trash'],
  ]

  const pageLabel = page === 'company'
    ? 'Company'
    : (nav.find(([id]) => id === page)?.[1] || 'Hexagon B2B')

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <button
          type="button"
          className="menu-toggle"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>
        <div className="mobile-bar-title">
          <div className="mobile-bar-eyebrow">HEXAGON B2B</div>
          <div>{pageLabel}</div>
        </div>
      </header>

      {menuOpen && (
        <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />
      )}

      <aside className={`app-nav ${menuOpen ? 'open' : ''}`}>
        <div className="nav-brand">
          <div className="nav-brand-eyebrow">HEXAGON B2B</div>
          <div className="nav-brand-title">Sales & Business OS</div>
          <button
            type="button"
            className="nav-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>
        <nav className="nav-links">
          {nav.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              className={
                page === id || (page === 'company' && id === 'companies')
                  ? 'nav-link active'
                  : 'nav-link'
              }
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="nav-footer">
          <div className="nav-email">{session.user.email}</div>
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
        {page === 'dashboard' && <Dashboard go={go} />}
        {page === 'companies' && <Companies go={go} />}
        {page === 'company' && <CompanyDetail id={selectedCompanyId} go={go} />}
        {page === 'tasks' && <Tasks go={go} />}
        {page === 'meetings' && <MeetingsCalls go={go} />}
        {page === 'opportunities' && <Opportunities go={go} />}
        {page === 'research' && <Research go={go} />}
        {page === 'trash' && <Trash go={go} />}
      </main>
    </div>
  )
}
