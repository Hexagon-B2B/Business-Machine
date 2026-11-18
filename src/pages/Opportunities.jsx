import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, OPP_STAGE_META, PAGE_SIZE, oppStageLabel, oppStageTone } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge, CompanySearchSelect } from '../ui'
import {
  EMPTY_OPP_FORM,
  emptyOppForm,
  OpportunityCreateFields,
  OpportunityDetail,
  createOppWithOptionalTask,
} from '../components/OpportunityShared'
import { logActivity } from '../lib/activityLog'

function stageTone(stage) {
  return oppStageTone(stage)
}

function quoteTotal(o) {
  const quotes = o?.metadata?.quotes
  if (!Array.isArray(quotes) || !quotes.length) return null
  const latest = [...quotes].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
  const t = latest?.total_value ?? latest?.totals?.total_ex_tax ?? latest?.total_ex_tax
  return t != null && !Number.isNaN(Number(t)) ? Number(t) : null
}

function displayValue(o) {
  const q = quoteTotal(o)
  if (q != null) return q
  if (o?.deal_size != null && !Number.isNaN(Number(o.deal_size))) return Number(o.deal_size)
  return null
}

function formatInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return '₹' + Math.round(Number(n)).toLocaleString('en-IN')
}

export default function Opportunities({ go }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('board')
  const [stageFilter, setStageFilter] = useState('open')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState(null)
  const [openQuotes, setOpenQuotes] = useState(false)
  const [form, setForm] = useState(emptyOppForm())
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [page, sortKey, sortDir, stageFilter, view])

  async function load() {
    setLoading(true)
    setErr('')
    try {
      if (view === 'board') {
        let q = supabase
          .from('opportunities')
          .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name, legal_name, city)')
          .neq('state', 'deleted')
          .not('stage', 'in', '(won,lost)')
          .order('created_at', { ascending: false })
          .limit(200)
        const { data, error } = await q
        if (error) throw error
        setItems(data || [])
        setTotal((data || []).length)
      } else {
        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        let q = supabase
          .from('opportunities')
          .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name, legal_name, city)', { count: 'exact' })
          .neq('state', 'deleted')
        if (stageFilter === 'open') q = q.not('stage', 'in', '(won,lost)')
        else if (stageFilter === 'closed') q = q.in('stage', ['won', 'lost'])
        else if (stageFilter !== 'all') q = q.eq('stage', stageFilter)
        q = q.order(sortKey || 'created_at', { ascending: sortDir === 'asc' }).range(from, to)
        const { data, error, count } = await q
        if (error) throw error
        setItems(data || [])
        setTotal(count || 0)
      }
    } catch (e) {
      setErr(e.message || 'Load failed')
      setItems([])
      setTotal(0)
    }
    setLoading(false)
  }

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    const { error } = await createOppWithOptionalTask(form, form.company_id)
    setSaving(false)
    if (error) { setErr(error.message || 'Create failed'); return }
    setShowCreate(false)
    setForm(emptyOppForm())
    setFlash('Opportunity created')
    setTimeout(() => setFlash(''), 2500)
    load()
  }

  const boardCols = OPP_STAGES.filter(s => s !== 'won' && s !== 'lost')

  return (
    <div style={{ padding: 28 }}>
      <PageHead
        eyebrow="Pipeline"
        title="Opportunities"
        subtitle="Board and list of deals. Value uses latest quote total when available."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={`btn ${view === 'board' ? 'primary' : ''}`} onClick={() => setView('board')}>Board</button>
            <button type="button" className={`btn ${view === 'list' ? 'primary' : ''}`} onClick={() => setView('list')}>List</button>
            <button type="button" className="btn primary" onClick={() => { setForm(emptyOppForm()); setShowCreate(true) }}>+ New opportunity</button>
          </div>
        }
      />
      {flash && <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>}
      {err && <div className="notice" style={{ marginBottom: 12, background: '#fef2f2', color: '#991b1b' }}>{err}</div>}

      {view === 'list' && (
        <FilterTabs
          value={stageFilter}
          onChange={v => { setStageFilter(v); setPage(1) }}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
            ...OPP_STAGES.map(s => ({ value: s, label: oppStageLabel(s) })),
          ]}
        />
      )}

      {loading ? <div className="loading">Loading…</div> : view === 'board' ? (
        <div className="stagebar" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {boardCols.map(st => {
            const list = items.filter(i => i.stage === st)
            const colVal = list.reduce((s, r) => s + (displayValue(r) || 0), 0)
            const meta = OPP_STAGE_META[st]
            const boardColor = meta?.board || '#64748b'
            return (
              <div className="stage" key={st} style={{ minWidth: 180, flex: '0 0 180px', borderTop: '3px solid ' + boardColor }}>
                <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: boardColor }}>{oppStageLabel(st)} ({list.length})</h4>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{formatInr(colVal)}</div>
                {list.map(r => (
                  <div key={r.id} className="opp-card" onClick={() => { setOpenQuotes(true); setSelected(r) }} style={{ cursor: 'pointer', padding: 10, marginBottom: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name || ''}>{(r.name || '—').length > 28 ? (r.name || '').slice(0, 26) + '…' : (r.name || '—')}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{r.companies?.name || '—'}</div>
                    <div style={{ fontSize: 12, color: '#065f46' }}>{formatInr(displayValue(r))}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'name', label: 'Opportunity', bold: true },
            { key: 'company', label: 'Company', render: r => r.companies?.name ? (
              <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
                onClick={e => { e.stopPropagation(); go('company', r.company_id) }}>{r.companies.name}</button>
            ) : '—' },
            { key: 'stage', label: 'Stage', render: r => <Badge tone={stageTone(r.stage)}>{oppStageLabel(r.stage)}</Badge> },
            { key: 'value', label: 'Value', render: r => formatInr(displayValue(r)) },
            { key: 'close', label: 'Expected close', render: r => r.expected_close_date ? new Date(r.expected_close_date).toLocaleDateString() : '—' },
          ]}
          rows={items}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          onRowClick={r => { setOpenQuotes(true); setSelected(r) }}
          empty="No opportunities"
        />
      )}

      {showCreate && (
        <Modal title="New opportunity" onClose={() => setShowCreate(false)} width={720}>
          <form onSubmit={handleCreate}>
            <OpportunityCreateFields form={form} setForm={setForm} />
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.name || 'Opportunity'} onClose={() => { setSelected(null); setOpenQuotes(false) }} width={1040}>
          <OpportunityDetail
            opportunity={selected}
            onClose={() => { setSelected(null); setOpenQuotes(false); load() }}
            onSaved={() => load()}
            initialShowQuote={openQuotes}
          />
        </Modal>
      )}
    </div>
  )
}
