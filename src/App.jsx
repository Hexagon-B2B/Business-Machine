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

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [selectedCompanyId, setSelectedCompanyId] = useState(null)

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

  if (loading) return <div className="loading">Loading Hexagon B2B...</div>
  if (!session) return <Login />

  const go = (p, companyId = null) => {
    setPage(p)
    setSelectedCompanyId(companyId)
  }

  const nav = [
    ['dashboard', 'Action Centre'],
    ['companies', 'Companies'],
    ['tasks', 'Tasks'],
    ['meetings', 'Meetings & Calls'],
    ['opportunities', 'Opportunities'],
    ['research', 'Research & Signals'],
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 230, background: '#0f172a', color: '#e2e8f0',
        padding: '20px 0', flexShrink: 0, display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: '#64748b' }}>HEXAGON B2B</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>Sales & Business OS</div>
        </div>
        <nav style={{ padding: '12px 10px', flex: 1 }}>
          {nav.map(([id, label]) => (
            <button key={id} onClick={() => go(id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                marginBottom: 2, border: 0, borderRadius: 8,
                background: page === id || (page === 'company' && id === 'companies') ? '#1e293b' : 'transparent',
                color: page === id || (page === 'company' && id === 'companies') ? '#fff' : '#94a3b8',
                fontWeight: 600, fontSize: 13, cursor: 'pointer'
              }}>
              {label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid #1e293b' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {session.user.email}
          </div>
          <button className="btn" style={{ width: '100%', background: '#1e293b', color: '#e2e8f0', border: 'none' }}
            onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', background: '#f1f5f9' }}>
        {page === 'dashboard' && <Dashboard go={go} />}
        {page === 'companies' && <Companies go={go} />}
        {page === 'company' && <CompanyDetail id={selectedCompanyId} go={go} />}
        {page === 'tasks' && <Tasks go={go} />}
        {page === 'meetings' && <MeetingsCalls go={go} />}
        {page === 'opportunities' && <Opportunities go={go} />}
        {page === 'research' && <Research go={go} />}
      </main>
    </div>
  )
}
