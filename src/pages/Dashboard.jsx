import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { runDailyTriggerScan, getTriggerConfig, saveTriggerConfig } from '../triggers'
import { DEFAULT_TRIGGER_CONFIG } from '../constants'
import { PageHead, Badge } from '../ui'

export default function Dashboard({ go }) {
  const [stats, setStats] = useState({ companies: 0, contacts: 0, openTasks: 0, meetings: 0, openOpps: 0, research: 0 })
  const [overdue, setOverdue] = useState([])
  const [scheduled, setScheduled] = useState([])
  const [triggerWork, setTriggerWork] = useState([])
  const [recentMeetings, setRecentMeetings] = useState([])
  const [dormant, setDormant] = useState([])
  const [dormantCount, setDormantCount] = useState(0)
  const [showDormant, setShowDormant] = useState(false)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [cfg, setCfg] = useState(() => getTriggerConfig())
  const [showCfg, setShowCfg] = useState(false)
  const [cfgMsg, setCfgMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const today = new Date().toISOString().slice(0, 10)
    const [c, ct, tOpen, m, o, rq, tasksOver, tasksUser, tasksTrig, meets] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact', head: true }).neq('state', 'deleted'),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).neq('state', 'deleted'),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('state', 'deleted').in('status', ['open', 'in_progress']),
      supabase.from('meetings_calls').select('id', { count: 'exact', head: true }).neq('state', 'deleted'),
      supabase.from('opportunities').select('id', { count: 'exact', head: true }).neq('state', 'deleted').not('stage', 'in', '(won,lost)'),
      supabase.from('research_queue').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
      supabase.from('tasks').select('id, title, due_at, priority, status, source, company_id, companies(name)').neq('state', 'deleted').in('status', ['open', 'in_progress']).lt('due_at', today).order('due_at').limit(10),
      supabase.from('tasks').select('id, title, due_at, priority, status, source, metadata, company_id, companies(name)').neq('state', 'deleted').in('status', ['open', 'in_progress']).or('source.is.null,source.eq.user').order('due_at').limit(10),
      supabase.from('tasks').select('id, title, due_at, priority, status, source, metadata, company_id, companies(name)').neq('state', 'deleted').in('status', ['open', 'in_progress']).in('source', ['trigger', 'research']).order('due_at').limit(15),
      supabase.from('meetings_calls').select('id, subject, type, outcome, next_action, scheduled_at, company_id').neq('state', 'deleted').order('scheduled_at', { ascending: false }).limit(6)
    ])
    setStats({
      companies: c.count || 0, contacts: ct.count || 0, openTasks: tOpen.count || 0,
      meetings: m.count || 0, openOpps: o.count || 0, research: rq.count || 0
    })
    setOverdue(tasksOver.data || [])
    setScheduled((tasksUser.data || []).filter(t => t.source !== 'trigger' && t.source !== 'research').slice(0, 8))
    setTriggerWork(tasksTrig.data || [])
    setRecentMeetings(meets.data || [])

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const cutoff = sixMonthsAgo.toISOString().slice(0, 10)
    const { data: activeCos, count: activeCnt } = await supabase
      .from('companies')
      .select('id, name, lifecycle_status, last_billed_at, city, industry', { count: 'exact' })
      .neq('state', 'deleted')
      .eq('lifecycle_status', 'active')
      .or('last_billed_at.is.null,last_billed_at.lt.' + cutoff)
      .order('last_billed_at', { ascending: true, nullsFirst: true })
      .limit(50)
    setDormant(activeCos || [])
    setDormantCount(activeCnt || (activeCos || []).length)

    setLoading(false)
  }

  async function generate() {
    setRunning(true)
    setResult(null)
    const r = await runDailyTriggerScan(supabase)
    setResult(r)
    setRunning(false)
    await load()
  }

  function saveCfg() {
    saveTriggerConfig(cfg)
    setCfgMsg('Criteria saved. Next Generate uses these rules.')
    setTimeout(() => setCfgMsg(''), 3500)
  }

  function resetCfg() {
    setCfg({ ...DEFAULT_TRIGGER_CONFIG })
    saveTriggerConfig(DEFAULT_TRIGGER_CONFIG)
    setCfgMsg('Reset to defaults.')
    setTimeout(() => setCfgMsg(''), 3000)
  }

  function taskRow(t, accent) {
    return (
      <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13, cursor: 'pointer' }}
        onClick={() => go('tasks')}>
        <div style={{ fontWeight: 600 }}>{t.title}</div>
        <div style={{ color: '#64748b', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {t.companies?.name && <span style={{ color: accent }}>{t.companies.name}</span>}
          {t.due_at && <span>Due {new Date(t.due_at).toLocaleDateString()}</span>}
          <Badge tone={t.priority === 'high' ? 'red' : 'gray'}>{t.priority}</Badge>
        </div>
      </div>
    )
  }

  if (loading) return <div className="loading">Loading…</div>

  const cards = [
    { label: 'Companies', value: stats.companies, page: 'companies' },
    { label: 'Contacts', value: stats.contacts, page: 'companies' },
    { label: 'Open Tasks', value: stats.openTasks, page: 'tasks' },
    { label: 'Meetings', value: stats.meetings, page: 'meetings' },
    { label: 'Open Opps', value: stats.openOpps, page: 'opportunities' },
    { label: 'Research queue', value: stats.research, page: 'research' },
    { label: 'Active not billed 6m', value: dormantCount, page: null, action: 'dormant' },
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Daily Command Centre" title="Action Centre" subtitle="Scheduled work you created, plus trigger work the system prepares from employees, industry, missing details, news/hiring/funding and quotations.">
        <button type="button" className="btn" onClick={() => setShowCfg(s => !s)}>
          {showCfg ? 'Hide criteria' : 'Trigger criteria'}
        </button>
        <button type="button" className="btn primary" disabled={running} onClick={generate}>
          {running ? 'Generating…' : "Generate today's trigger work"}
        </button>
      </PageHead>

      {showCfg && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #1e40af' }}>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>Trigger criteria (saved on this browser)</h2>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
            Controls what Generate creates each day. Change limits and which signal types run, then Generate again.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Max new tasks / run</div>
              <input className="input" type="number" min={1} max={50} value={cfg.maxNew}
                onChange={e => setCfg({ ...cfg, maxNew: Number(e.target.value) || 15 })} />
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Employee threshold</div>
              <input className="input" type="number" min={0} value={cfg.employeeThreshold}
                onChange={e => setCfg({ ...cfg, employeeThreshold: Number(e.target.value) || 0 })} />
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>High employee threshold</div>
              <input className="input" type="number" min={0} value={cfg.employeeHighThreshold}
                onChange={e => setCfg({ ...cfg, employeeHighThreshold: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, fontSize: 13 }}>
            {[
              ['enableMissingDetails', 'Missing details'],
              ['enableEmployeeCount', 'Employee scale'],
              ['enableIndustry', 'Industry fit'],
              ['enableNewsHiringFunding', 'News / hiring / funding'],
              ['enableSignals', 'Signals'],
              ['enableQuotation', 'Quotation follow-up'],
              ['enableMeeting', 'Meeting next-action'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!cfg[key]} onChange={e => setCfg({ ...cfg, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn primary" onClick={saveCfg}>Save criteria</button>
            <button type="button" className="btn" onClick={resetCfg}>Reset defaults</button>
            {cfgMsg && <span style={{ fontSize: 12, color: '#065f46' }}>{cfgMsg}</span>}
          </div>
        </div>
      )}

      {result && (
        <div className="notice" style={{ marginBottom: 16, background: result.errors?.length ? '#fef2f2' : '#ecfdf5', borderColor: result.errors?.length ? '#fecaca' : '#a7f3d0' }}>
          {result.errors?.length
            ? (String(result.errors[0]).includes('task_code') || String(result.errors[0]).includes('sequence')
              ? 'Task sequence permission is still missing. Run DB_VERIFY_AND_FIX.sql in Supabase, then click Generate again.'
              : result.errors.join('; '))
            : `Run complete: created ${result.created || 0} · already open ${result.skipped || 0} · considered ${result.considered || 0}`}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 16 }}>
        {cards.map(c => (
          <div
            key={c.label}
            className="card"
            style={{
              cursor: 'pointer',
              borderLeft: c.action === 'dormant' && dormantCount > 0 ? '4px solid #f59e0b' : undefined,
              background: c.action === 'dormant' && dormantCount > 0 ? '#fffbeb' : undefined,
            }}
            onClick={() => {
              if (c.action === 'dormant') setShowDormant(s => !s)
              else if (c.page) go(c.page)
            }}
          >
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: c.action === 'dormant' && dormantCount > 0 ? '#b45309' : undefined }}>
              {c.value.toLocaleString()}
            </div>
            {c.action === 'dormant' && (
              <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>Click to {showDormant ? 'hide' : 'view'} list</div>
            )}
          </div>
        ))}
      </div>

      {showDormant && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Active customers not billed in 6 months</h2>
            <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setShowDormant(false)}>Close</button>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
            Lifecycle is Active, but last billed date is empty or older than 6 months. Open a company to update lifecycle or set last billed date.
          </p>
          {dormant.length === 0 ? (
            <div className="empty" style={{ padding: 12 }}>None — good coverage.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>City</th>
                  <th>Industry</th>
                  <th>Last billed</th>
                </tr>
              </thead>
              <tbody>
                {dormant.map(co => (
                  <tr key={co.id} style={{ cursor: 'pointer' }} onClick={() => go('company', co.id)}>
                    <td style={{ fontWeight: 600, color: '#2563eb' }}>{co.name}</td>
                    <td>{co.city || '—'}</td>
                    <td>{co.industry || '—'}</td>
                    <td>{co.last_billed_at ? new Date(co.last_billed_at).toLocaleDateString() : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14 }}>Overdue</h2>
            <button className="btn" onClick={() => go('tasks')}>All tasks</button>
          </div>
          {overdue.length === 0 ? <div className="empty" style={{ padding: 16 }}>None overdue</div> : overdue.map(t => taskRow(t, '#dc2626'))}
        </div>
        <div className="card">
          <h2 style={{ fontSize: 14, marginBottom: 12 }}>Scheduled (you created)</h2>
          {scheduled.length === 0 ? <div className="empty" style={{ padding: 16 }}>No scheduled tasks</div> : scheduled.map(t => taskRow(t, '#64748b'))}
        </div>
        <div className="card">
          <h2 style={{ fontSize: 14, marginBottom: 12 }}>Trigger work</h2>
          {triggerWork.length === 0 ? <div className="empty" style={{ padding: 16 }}>None yet. Click Generate.</div> : triggerWork.map(t => taskRow(t, '#1e40af'))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14 }}>Recent Meetings & Calls</h2>
          <button className="btn" onClick={() => go('meetings')}>View all</button>
        </div>
        {recentMeetings.length === 0 ? <div className="empty" style={{ padding: 16 }}>None logged yet</div> :
          <table className="table">
            <thead><tr><th>Type</th><th>Subject</th><th>Outcome</th><th>Next Action</th><th>When</th></tr></thead>
            <tbody>
              {recentMeetings.map(m => (
                <tr key={m.id}>
                  <td><Badge tone="blue">{m.type}</Badge></td>
                  <td style={{ fontWeight: 600 }}>{m.subject}</td>
                  <td>{m.outcome || '—'}</td>
                  <td style={{ color: m.next_action ? '#1e40af' : undefined }}>{m.next_action || '—'}</td>
                  <td>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  )
}
