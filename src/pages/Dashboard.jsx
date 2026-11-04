import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { runDailyTriggerScan, getTriggerConfig, saveTriggerConfig } from '../triggers'
import { DEFAULT_TRIGGER_CONFIG } from '../constants'
import { PageHead, Badge } from '../ui'

const sectionTitle = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#64748b',
  margin: 0,
}

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
      supabase.from('meetings_calls').select('id, subject, type, outcome, next_action, scheduled_at, company_id').neq('state', 'deleted').order('scheduled_at', { ascending: false }).limit(6),
    ])
    setStats({
      companies: c.count || 0, contacts: ct.count || 0, openTasks: tOpen.count || 0,
      meetings: m.count || 0, openOpps: o.count || 0, research: rq.count || 0,
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
    const due = t.due_at ? new Date(t.due_at).toLocaleDateString() : null
    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        onClick={() => go('tasks')}
        onKeyDown={e => { if (e.key === 'Enter') go('tasks') }}
        style={{
          padding: '7px 0',
          borderBottom: '1px solid #f1f5f9',
          fontSize: 13,
          cursor: 'pointer',
          lineHeight: 1.3,
        }}
      >
        <div style={{ fontWeight: 600, color: '#0f172a' }}>{t.title}</div>
        <div style={{ color: '#64748b', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2, fontSize: 12, alignItems: 'center' }}>
          {t.companies?.name && <span style={{ color: accent, fontWeight: 600 }}>{t.companies.name}</span>}
          {due && <span>Due {due}</span>}
          {t.priority && t.priority !== 'medium' && (
            <Badge tone={t.priority === 'high' ? 'red' : 'gray'}>{t.priority}</Badge>
          )}
        </div>
      </div>
    )
  }

  function WorkCard({ title, count, actionLabel, onAction, children, empty, accent }) {
    const accentColor = accent === 'red' ? '#ef4444' : accent === 'blue' ? '#2563eb' : accent === 'slate' ? '#94a3b8' : null
    return (
      <div
        className="card"
        style={{
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h2 style={sectionTitle}>{title}</h2>
            {count > 0 && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: accent === 'red' ? '#991b1b' : accent === 'blue' ? '#1e40af' : '#475569',
                background: accent === 'red' ? '#fee2e2' : accent === 'blue' ? '#dbeafe' : '#f1f5f9',
                borderRadius: 999,
                padding: '1px 7px',
                flexShrink: 0,
              }}>{count}</span>
            )}
          </div>
          {onAction && (
            <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 9px', minHeight: 0, flexShrink: 0 }} onClick={onAction}>
              {actionLabel || 'View'}
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto', maxHeight: 280 }}>
          {children || (
            <div style={{ padding: '18px 6px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {empty}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) return <div className="loading">Loading…</div>

  const kpiCards = [
    { label: 'Companies', value: stats.companies, page: 'companies' },
    { label: 'Contacts', value: stats.contacts, page: 'contacts' },
    { label: 'Open tasks', value: stats.openTasks, page: 'tasks' },
    { label: 'Meetings', value: stats.meetings, page: 'meetings' },
    { label: 'Open opps', value: stats.openOpps, page: 'opportunities' },
    { label: 'Research', value: stats.research, page: 'research' },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280 }}>
      <PageHead
        eyebrow="Daily"
        title="Action Centre"
        subtitle="What needs attention today — tasks, triggers, and follow-ups."
      >
        <button type="button" className="btn" onClick={() => setShowCfg(s => !s)}>
          {showCfg ? 'Hide criteria' : 'Trigger criteria'}
        </button>
        <button type="button" className="btn primary" disabled={running} onClick={generate}>
          {running ? 'Generating…' : 'Generate trigger work'}
        </button>
      </PageHead>

      {showCfg && (
        <div className="card" style={{ marginBottom: 14, padding: 14 }}>
          <div style={{ marginBottom: 10 }}>
            <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Trigger criteria</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Saved on this browser. Applies the next time you Generate.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>Max new tasks</div>
              <input className="input" type="number" min={1} max={50} value={cfg.maxNew}
                style={{ minHeight: 34, padding: '5px 10px', fontSize: 13 }}
                onChange={e => setCfg({ ...cfg, maxNew: Number(e.target.value) || 15 })} />
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>Employee threshold</div>
              <input className="input" type="number" min={0} value={cfg.employeeThreshold}
                style={{ minHeight: 34, padding: '5px 10px', fontSize: 13 }}
                onChange={e => setCfg({ ...cfg, employeeThreshold: Number(e.target.value) || 0 })} />
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>High employee</div>
              <input className="input" type="number" min={0} value={cfg.employeeHighThreshold}
                style={{ minHeight: 34, padding: '5px 10px', fontSize: 13 }}
                onChange={e => setCfg({ ...cfg, employeeHighThreshold: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 12, fontSize: 13 }}>
            {[
              ['enableMissingDetails', 'Missing details'],
              ['enableEmployeeCount', 'Employee scale'],
              ['enableIndustry', 'Industry fit'],
              ['enableNewsHiringFunding', 'News / hiring / funding'],
              ['enableSignals', 'Signals'],
              ['enableQuotation', 'Quotation follow-up'],
              ['enableMeeting', 'Meeting next-action'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#334155' }}>
                <input type="checkbox" checked={!!cfg[key]} onChange={e => setCfg({ ...cfg, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" style={{ minHeight: 34, padding: '5px 12px', fontSize: 13 }} onClick={saveCfg}>Save</button>
            <button type="button" className="btn" style={{ minHeight: 34, padding: '5px 12px', fontSize: 13 }} onClick={resetCfg}>Reset defaults</button>
            {cfgMsg && <span style={{ fontSize: 12, color: '#065f46' }}>{cfgMsg}</span>}
          </div>
        </div>
      )}

      {result && (
        <div
          className="notice"
          style={{
            marginBottom: 14,
            padding: '9px 12px',
            background: result.errors?.length ? '#fef2f2' : '#ecfdf5',
            borderColor: result.errors?.length ? '#fecaca' : '#a7f3d0',
            color: result.errors?.length ? '#991b1b' : '#065f46',
          }}
        >
          {result.errors?.length
            ? (String(result.errors[0]).includes('task_code') || String(result.errors[0]).includes('sequence')
              ? 'Task sequence permission is still missing. Run DB_VERIFY_AND_FIX.sql in Supabase, then Generate again.'
              : result.errors.join('; '))
            : `Run complete — created ${result.created || 0} · already open ${result.skipped || 0} · considered ${result.considered || 0}`}
        </div>
      )}

      {/* KPI strip — 6 core metrics, equal weight */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        gap: 10,
        marginBottom: 14,
      }}
        className="dash-kpi"
      >
        {kpiCards.map(c => (
          <div
            key={c.label}
            className="card"
            role="button"
            tabIndex={0}
            onClick={() => c.page && go(c.page)}
            onKeyDown={e => { if (e.key === 'Enter' && c.page) go(c.page) }}
            style={{
              padding: '12px 12px',
              cursor: 'pointer',
              transition: 'border-color 0.12s, box-shadow 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.label}
            </div>
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              marginTop: 4,
              color: '#0f172a',
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {Number(c.value).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Dormant alert — only when relevant, not mixed into KPIs */}
      {dormantCount > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            padding: '10px 14px',
            borderColor: '#fcd34d',
            background: '#fffbeb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
              {dormantCount.toLocaleString()} active compan{dormantCount === 1 ? 'y' : 'ies'} not billed in 6 months
            </div>
            <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
              Review lifecycle or update last billed date.
            </div>
          </div>
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: '5px 12px', minHeight: 0, flexShrink: 0, borderColor: '#f59e0b', color: '#92400e' }}
            onClick={() => setShowDormant(s => !s)}
          >
            {showDormant ? 'Hide list' : 'View list'}
          </button>
        </div>
      )}

      {showDormant && dormantCount > 0 && (
        <div className="card" style={{ marginBottom: 14, padding: 14, borderColor: '#fcd34d', background: '#fffbeb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <h2 style={{ ...sectionTitle, color: '#92400e' }}>Active — not billed in 6 months</h2>
            <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 9px', minHeight: 0 }} onClick={() => setShowDormant(false)}>Close</button>
          </div>
          {dormant.length === 0 ? (
            <div style={{ padding: 10, color: '#64748b', fontSize: 13 }}>None in this sample.</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 260 }}>
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
            </div>
          )}
        </div>
      )}

      {/* Work queues */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12,
        marginBottom: 14,
      }}
        className="dash-queues"
      >
        <WorkCard title="Overdue" count={overdue.length} actionLabel="All tasks" onAction={() => go('tasks')} empty="None overdue" accent="red">
          {overdue.length > 0 && overdue.map(t => taskRow(t, '#dc2626'))}
        </WorkCard>
        <WorkCard title="Scheduled" count={scheduled.length} empty="No scheduled tasks" accent="slate">
          {scheduled.length > 0 && scheduled.map(t => taskRow(t, '#64748b'))}
        </WorkCard>
        <WorkCard title="Trigger work" count={triggerWork.length} empty="None yet — click Generate" accent="blue">
          {triggerWork.length > 0 && triggerWork.map(t => taskRow(t, '#1e40af'))}
        </WorkCard>
      </div>

      {/* Recent activity */}
      <div className="card" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <h2 style={sectionTitle}>Recent meetings & calls</h2>
          <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 9px', minHeight: 0 }} onClick={() => go('meetings')}>
            View all
          </button>
        </div>
        {recentMeetings.length === 0 ? (
          <div style={{ padding: '18px 6px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>None logged yet</div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 300 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Outcome</th>
                  <th>Next action</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentMeetings.map(m => (
                  <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => go('meetings')}>
                    <td><Badge tone="blue">{m.type}</Badge></td>
                    <td style={{ fontWeight: 600 }}>{m.subject || '—'}</td>
                    <td>{m.outcome || '—'}</td>
                    <td style={{ color: m.next_action ? '#1e40af' : undefined, fontWeight: m.next_action ? 600 : 400 }}>
                      {m.next_action || '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .dash-kpi { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .dash-queues { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 520px) {
          .dash-kpi { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </div>
  )
}
