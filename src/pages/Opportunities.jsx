import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, PAGE_SIZE } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'

export default function Opportunities({ go }) {
  const [items, setItems] = useState([])
  const [allForBoard, setAllForBoard] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('pipeline')
  const [stageFilter, setStageFilter] = useState('all')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [page, sortKey, sortDir, stageFilter, view])

  async function load() {
    setLoading(true)
    const board = await supabase.from('opportunities')
      .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, company_id, companies(name)')
      .not('stage', 'in', '(won,lost)')
      .order('created_at', { ascending: false })
      .limit(200)
    setAllForBoard(board.data || [])

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase.from('opportunities')
      .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, company_id, companies(name)', { count: 'exact' })
      .order(sortKey, { ascending: sortDir === 'asc' })
      .range(from, to)
    if (stageFilter !== 'all') q = q.eq('stage', stageFilter)
    const { data, count } = await q
    setItems(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  async function moveStage(id, stage) {
    const { error } = await supabase.from('opportunities').update({ stage }).eq('id', id)
    if (error) alert(error.message)
    else { setSelected(s => s && s.id === id ? { ...s, stage } : s); load() }
  }

  async function saveNext(e) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    const meta = { ...(selected.metadata || {}), next_action: selected._next || selected.metadata?.next_action || null }
    const { error } = await supabase.from('opportunities').update({
      stage: selected.stage,
      deal_size: selected.deal_size ? Number(selected.deal_size) : null,
      expected_close_date: selected.expected_close_date || null,
      requirement_description: selected.requirement_description || null,
      pain_points: selected.pain_points || null,
      metadata: meta,
      lost_reason: selected.stage === 'lost' ? (selected.lost_reason || null) : null
    }).eq('id', selected.id)
    setSaving(false)
    if (error) alert(error.message)
    else { setSelected(null); load() }
  }

  const columns = [
    { key: 'name', label: 'Opportunity', bold: true },
    { key: 'company', label: 'Company', render: r => r.companies?.name || '—' },
    { key: 'stage', label: 'Stage', render: r => <Badge tone={r.stage === 'quotation' ? 'yellow' : r.stage === 'won' ? 'green' : r.stage === 'lost' ? 'red' : 'blue'}>{r.stage}</Badge> },
    { key: 'deal_size', label: 'Value', render: r => r.deal_size ? `${r.currency || 'INR'} ${Number(r.deal_size).toLocaleString()}` : '—' },
    { key: 'expected_close_date', label: 'Timing' },
    { key: 'next', label: 'Next action', render: r => r.metadata?.next_action || '—' },
  ]

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Commercial" title="Opportunities" subtitle="Requirement → Qualification → Discovery → Solution → Quotation → Negotiation → Decision">
        <button className="btn primary" onClick={() => go('companies')}>Create from a Company →</button>
      </PageHead>

      <FilterTabs value={view} onChange={setView}
        options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'list', label: 'List' }]} />

      {view === 'pipeline' && (
        <>
          <div className="notice">A stage is not a forecast. Each opportunity should carry company, requirement, solution, value, timing and next action. Quotation is a real commercial stage.</div>
          {loading ? <div className="loading">Loading pipeline...</div> : (
            <div className="stagebar">
              {OPP_STAGES.filter(s => s !== 'won' && s !== 'lost').map(st => {
                const list = allForBoard.filter(o => (o.stage || '').toLowerCase() === st)
                return (
                  <div className="stage" key={st}>
                    <h4>{st} ({list.length})</h4>
                    {list.length === 0 && <div className="empty" style={{ padding: 12 }}>None</div>}
                    {list.map(o => (
                      <div className="opp-card" key={o.id} onClick={() => setSelected({ ...o, _next: o.metadata?.next_action || '' })}>
                        <strong style={{ fontSize: 13 }}>{o.name}</strong>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0' }}>{o.companies?.name}</p>
                        <p style={{ fontSize: 12 }}>{o.deal_size ? `INR ${Number(o.deal_size).toLocaleString()}` : 'Value not set'}</p>
                        {o.metadata?.next_action && <span className="badge blue">{o.metadata.next_action}</span>}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {view === 'list' && (
        <>
          <FilterTabs value={stageFilter} onChange={v => { setStageFilter(v); setPage(1) }}
            options={[{ value: 'all', label: 'All stages' }, ...OPP_STAGES.map(s => ({ value: s, label: s }))] } />
          {loading ? <div className="loading">Loading...</div> : (
            <DataTable
              columns={columns} rows={items}
              sortKey={sortKey} sortDir={sortDir} onSort={onSort}
              onRowClick={r => setSelected({ ...r, _next: r.metadata?.next_action || '' })}
              page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage}
              empty="No opportunities. Create one from a Company."
            />
          )}
        </>
      )}

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)} width={520}>
          <form onSubmit={saveNext}>
            <div style={{ marginBottom: 10 }}>
              <button type="button" className="btn" onClick={() => go('company', selected.company_id)}>Open company →</button>
            </div>
            <Field label="Company"><div>{selected.companies?.name || '—'}</div></Field>
            <Field label="Stage">
              <select className="input" value={selected.stage} onChange={e => setSelected({ ...selected, stage: e.target.value })}>
                {OPP_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Requirement"><textarea className="input" rows={2} value={selected.requirement_description || ''} onChange={e => setSelected({ ...selected, requirement_description: e.target.value })} /></Field>
            <Field label="Solution"><textarea className="input" rows={2} value={selected.pain_points || ''} onChange={e => setSelected({ ...selected, pain_points: e.target.value })} placeholder="Proposed solution / fit" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Estimated value (INR)"><input className="input" type="number" value={selected.deal_size || ''} onChange={e => setSelected({ ...selected, deal_size: e.target.value })} /></Field>
              <Field label="Expected timing"><input className="input" type="date" value={selected.expected_close_date || ''} onChange={e => setSelected({ ...selected, expected_close_date: e.target.value })} /></Field>
            </div>
            <Field label="Next action"><input className="input" value={selected._next || ''} onChange={e => setSelected({ ...selected, _next: e.target.value })} /></Field>
            {selected.stage === 'lost' && (
              <Field label="Lost reason"><input className="input" value={selected.lost_reason || ''} onChange={e => setSelected({ ...selected, lost_reason: e.target.value })} /></Field>
            )}
            <div className="notice">Quotation is a stage, not a separate finance document in V1. Capture value and next action here; billing stays outside CRM.</div>
            <Actions saving={saving} onCancel={() => setSelected(null)} label="Save opportunity" />
          </form>
        </Modal>
      )}
    </div>
  )
}
