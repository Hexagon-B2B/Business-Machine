import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, OPP_STAGE_META, PAGE_SIZE, oppStageLabel } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge, CompanySearchSelect } from '../ui'
import {
  EMPTY_OPP_FORM,
  OpportunityCreateFields,
  OpportunityDetail,
  createOppWithOptionalTask,
} from '../components/OpportunityShared'
import { logActivity } from '../lib/activityLog'

function stageTone(stage) {
  if (stage === 'won') return 'green'
  if (stage === 'lost') return 'red'
  if (stage === 'quotation' || stage === 'negotiation' || stage === 'decision') return 'yellow'
  return 'blue'
}

function quoteTotal(o) {
  const quotes = o?.metadata?.quotes
  if (!Array.isArray(quotes) || !quotes.length) return null
  const latest = quotes[quotes.length - 1]
  const t = latest?.totals?.total_ex_tax ?? latest?.total_ex_tax ?? latest?.totals?.grand_total
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
  const [form, setForm] = useState({ ...EMPTY_OPP_FORM })
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [checked, setChecked] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { load() }, [page, sortKey, sortDir, stageFilter, view])

  useEffect(() => {
    supabase.from('companies').select('id, name, city').neq('state', 'deleted').order('name').limit(3000)
      .then(({ data }) => setCompanies(data || []))
  }, [])

  useEffect(() => {
    if (!form.company_id && !selected?.company_id) { setContacts([]); return }
    const cid = form.company_id || selected?.company_id
    supabase.from('contacts').select('id, full_name, role').eq('company_id', cid).order('full_name')
      .then(({ data }) => setContacts(data || []))
  }, [form.company_id, selected?.company_id])

  function showMsg(m) {
    setFlash(m)
    setTimeout(() => setFlash(''), 4500)
  }

  function toggleSelect(id) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(rows, selectAll) {
    setChecked(prev => {
      const next = new Set(prev)
      for (const r of rows) {
        if (selectAll) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  async function deleteSelected() {
    const ids = [...checked]
    if (!ids.length) return
    if (!confirm(`Move ${ids.length} opportunity(ies) to Deleted?`)) return
    setDeleting(true)
    const { data, error } = await supabase.from('opportunities')
      .update({ state: 'deleted', deleted_at: new Date().toISOString() })
      .in('id', ids)
      .select('id')
    setDeleting(false)
    if (error) { showMsg('Delete failed: ' + error.message); return }
    setChecked(new Set())
    showMsg(`Moved ${(data || []).length} to Deleted.`)
    load()
  }

  async function load() {
    setLoading(true)
    if (view === 'board') {
      const { data, error } = await supabase.from('opportunities')
        .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name)')
        .neq('state', 'deleted')
        .not('stage', 'in', '(won,lost)')
        .order('created_at', { ascending: false })
        .limit(400)
      if (error) console.error(error)
      setItems(data || [])
      setTotal((data || []).length)
    } else {
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      let q = supabase.from('opportunities')
        .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name)', { count: 'exact' })
        .neq('state', 'deleted')
        .order(sortKey, { ascending: sortDir === 'asc' })
        .range(from, to)
      if (stageFilter === 'open') q = q.not('stage', 'in', '(won,lost)')
      else if (stageFilter === 'closed') q = q.in('stage', ['won', 'lost'])
      else if (stageFilter !== 'all') q = q.eq('stage', stageFilter)
      const { data, count, error } = await q
      if (error) console.error(error)
      setItems(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  async function createOpp(e) {
    e.preventDefault()
    if (!form.company_id) { showMsg('Select a company.'); return }
    if (!form.requirement_description.trim()) { showMsg('Requirement is required.'); return }
    setSaving(true)
    const { data, error } = await createOppWithOptionalTask(form, form.company_id)
    setSaving(false)
    if (error) { showMsg('Create failed: ' + error.message); return }
    if (data?.id) await logActivity({ entityType: 'opportunity', entityId: data.id, action: 'create', summary: 'Opportunity created' })
    setShowCreate(false)
    setForm({ ...EMPTY_OPP_FORM })
    showMsg('Opportunity created — add quote items (base product + sub-items).')
    await load()
    if (data?.id) {
      const { data: full } = await supabase.from('opportunities')
        .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name)')
        .eq('id', data.id).single()
      if (full) {
        setOpenQuotes(true)
        setSelected(full)
      }
    }
  }

  const boardCols = OPP_STAGES.filter(s => s !== 'won' && s !== 'lost')

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Pipeline" title="Opportunities" subtitle="Same form as Company → New opportunity. After create, add quote items (base product + sub-items). Quote total drives pipeline value.">
        <button type="button" className="btn" onClick={() => setView(v => v === 'board' ? 'list' : 'board')}>{view === 'board' ? 'List view' : 'Board view'}</button>
        <button type="button" className="btn primary" onClick={() => { setForm({ ...EMPTY_OPP_FORM }); setShowCreate(true) }}>+ New opportunity</button>
      </PageHead>

      {flash && <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>}

      {view === 'list' && (
        <FilterTabs value={stageFilter} onChange={v => { setStageFilter(v); setPage(1) }}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
            ...OPP_STAGES.map(s => ({ value: s, label: oppStageLabel(s) })),
          ]} />
      )}

      {checked.size > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{checked.size} selected</span>
          <button type="button" className="btn danger" disabled={deleting} onClick={deleteSelected}>
            {deleting ? 'Deleting…' : `Move to Deleted (${checked.size})`}
          </button>
          <button type="button" className="btn" onClick={() => setChecked(new Set())}>Clear</button>
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : view === 'board' ? (
        <div className="stagebar" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {boardCols.map(st => {
            const list = items.filter(i => i.stage === st)
            const colVal = list.reduce((s, r) => s + (displayValue(r) || 0), 0)
            const meta = OPP_STAGE_META[st]
            return (
              <div className="stage" key={st} style={{ minWidth: 180, flex: '0 0 180px' }}>
                <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{oppStageLabel(st)} ({list.length})</h4>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{meta?.pct != null ? meta.pct + '% · ' : ''}{formatInr(colVal)}</div>
                {list.map(r => (
                  <div key={r.id} className="opp-card" onClick={() => { setOpenQuotes(false); setSelected(r) }} style={{ cursor: 'pointer', padding: 10, marginBottom: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name || '—'}</div>
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
          onRowClick={r => { setOpenQuotes(false); setSelected(r) }}
          empty="No opportunities"
          selectable
          selectedIds={checked}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      )}

      {showCreate && (
        <Modal title="New opportunity" onClose={() => setShowCreate(false)} width={560}>
          <form onSubmit={createOpp}>
            <Field label="Company *">
              <CompanySearchSelect companies={companies} value={form.company_id}
                onChange={id => setForm({ ...form, company_id: id, primary_contact_id: '' })} required />
            </Field>
            <OpportunityCreateFields form={form} setForm={setForm} contacts={contacts} />
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.name || 'Opportunity'} onClose={() => { setSelected(null); setOpenQuotes(false) }} width={640}>
          <OpportunityDetail
            opportunity={selected}
            contacts={contacts}
            onClose={() => { setSelected(null); setOpenQuotes(false) }}
            onSaved={() => { load() }}
            goCompany={(cid) => { setSelected(null); setOpenQuotes(false); go('company', cid) }}
            initialShowQuote={openQuotes}
          />
        </Modal>
      )}
    </div>
  )
}
