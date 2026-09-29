import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { runDailyTriggerScan } from '../triggers'
import { PageHead, Badge } from '../ui'

export default function Dashboard({ go }) {
  const [stats, setStats] = useState({ companies: 0, contacts: 0, openTasks: 0, meetings: 0, openOpps: 0, research: 0 })
  const [overdue, setOverdue] = useState([])
  const [scheduled, setScheduled] = useState([])
  const [triggerWork, setTriggerWork] = useState([])
  const [recentMeetings, setRecentMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const today = new Date().toISOString().slice(0, 10)
    const [c, ct, tOpen, m, o, rq, tasksOver, tasksUser, tasksTrig, meets] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      supabase.from('meetings_calls').select('id', { count: 'exact', head: true }),
      supabase.from('opportunities').select('id', { count: 'exact', head: true }).not('stage', 'in', '(won,lost)'),
      supabase.from('research_queue').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
      supabase.from('tasks').select('id, title, due_at, priority, status, source, company_id, companies(name)').in('status', ['open', 'in_progress']).lt('due_at', today).order('due_at').limit(10),
      supabase.from('tasks').select('id, title, due_at, priority, status, source, metadata, company_id, companies(name)').in('status', ['open', 'in_progress']).or('source.is.null,source.eq.user').order('due_at').limit(10),
      supabase.from('tasks').select('id, title, due_at, priority, status, source, metadata, company_id, companies(name)').in('status', ['open', 'in_progress']).in('source', ['trigger', 'research']).order('due_at').limit(15),
      supabase.from('meetings_calls').select('id, subject, type, outcome, next_action, scheduled_at, company_id').order('scheduled_at', { ascending: false }).limit(6)
    ])
    setStats({
      companies: c.count || 0, contacts: ct.count || 0, openTasks: tOpen.count || 0,
      meetings: m.count || 0, openOpps: o.count || 0, research: rq.count || 0
    })
    setOverdue(tasksOver.data || [])
    setScheduled((tasksUser.data || []).filter(t => t.source !== 'trigger' && t.source !== 'research').slice(0, 8))
    setTriggerWork(tasksTrig.data || [])
    setRecentMeetings(meets.data || [])
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

  if (loading) return <div className="loading">Loading Action Centre...</div>

  const cards = [
    { label: 'Companies', value: stats.companies, page: 'companies' },
    { label: 'Contacts', value: stats.contacts, page: 'companies' },
    { label: 'Open Tasks', value: stats.openTasks, page: 'tasks' },
    { label: 'Meetings & Calls', value: stats.meetings, page: 'meetings' },
    { label: 'Open Opportunities', value: stats.openOpps, page: 'opportunities' },
    { label: 'Research Queue', value: stats.research, page: 'research' },
  ]

  function taskRow(t, color) {
    return (
      <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13, cursor: 'pointer' }}
        onClick={() => t.company_id && go('company', t.company_id)}>
        <div style={{ fontWeight: 600 }}>{t.title}</div>
        <div style={{ color }}>
          <Badge tone={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'gray'}>{t.priority}</Badge>
          {' '}{t.companies?.name || ''}
          {t.due_at && ` · ${new Date(t.due_at).toLocaleDateString()}`}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Daily Command Centre" title="Action Centre" subtitle="Scheduled work you created, plus trigger work the system prepares from employees, industry, missing details, news/hiring/funding and quotations.">
        <button className="btn primary" disabled={running} onClick={generate}>
          {running ? 'Generating…' : "Generate today's trigger work"}
        </button>
      </PageHead>

      <div className="notice" style={{ marginBottom: 16 }}>
        Trigger work is capped at 15 new tasks per run and will not duplicate an open task. It does not scrape LinkedIn. It creates reach-out / check tasks with search links. Log a Signal when you find evidence.
      </div>

      {result && (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>Run complete:</strong> created {result.created} · already open {result.skipped} · considered {result.considered}
          {result.errors?.length > 0 && (
            <div style={{ color: '#b91c1c', marginTop: 8, fontSize: 13 }}>
              {result.errors[0].includes('task_code_seq')
                ? 'Task sequence permission is still missing. Run the SQL I gave you, then click Generate again.'
                : result.errors.join(' | ')}
            </div>
          )}
          {result.items?.map((i, n) => <div key={n} style={{ fontSize: 13, marginTop: 4 }}><Badge tone="blue">{i.type}</Badge> {i.title}</div>)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map(c => (
          <div key={c.label} className="card" style={{ cursor: 'pointer' }} onClick={() => go(c.page)}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{c.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

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
