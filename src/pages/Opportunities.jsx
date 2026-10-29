import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, OPP_STAGE_META, PAGE_SIZE, oppStageLabel, isOppOpen } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge, CompanySearchSelect } from '../ui'
import QuotationPanel from '../components/QuotationPanel'
import { logActivity } from '../lib/activityLog'

function stageTone(stage) {
  if (stage === 'won') return 'green'
  if (stage === 'lost') return 'red'
  if (stage === 'quotation' || stage === 'negotiation' || stage === 'decision') return 'yellow'
  return 'blue'
}

/** Actual commercial value = latest quotation total (ex-tax). Create-time deal_size is only a rough estimate. */
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

const emptyForm = {
  company_id: '', name: '', stage: 'requirement', deal_size: '', expected_close_date: '',
  requirement_description: '', solution: '', next_action: '', next_action_due: '',
  primary_contact_id: '', lost_reason: '',
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
  const [form, setForm] = useState({ ...emptyForm })
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [showQuote, setShowQuote] = useState(false)
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
      let q = supabase.from('opportunities')
        .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name)')
        .neq('state', 'deleted')
        .not('stage', 'in', '(won,lost)')
        .order('created_at', { ascending: false })
        .limit(400)
      const { data, error } = await q
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

  function openEdit(o) {
    setSelected({
      ...o,
      solution: o.pain_points || o.metadata?.solution || '',
      next_action: o.metadata?.next_action || o.next_action || '',
      next_action_due: (o.metadata?.next_action_due || o.next_action_due || '').toString().slice(0, 10),
      lost_reason: o.lost_reason || '',
      expected_close_date: (o.expected_close_date || '').toString().slice(0, 10),
    })
    setShowQuote(false)
  }

  async function moveStage(id, stage) {
    if (stage === 'lost') {
      const row = items.find(x => x.id === id) || selected
      if (!(row?.lost_reason || '').trim() && !(selected?.id === id && (selected.lost_reason || '').trim())) {
        openEdit({ ...(row || selected), stage: 'lost' })
        showMsg('Select Lost and enter a lost reason, then Save.')
        return
      }
    }
    const payload = { stage }
    if (selected?.id === id && stage === 'lost') payload.lost_reason = selected.lost_reason || null
    const { error } = await supabase.from('opportunities').update(payload).eq('id', id)
    if (error) showMsg('Stage update failed: ' + error.message)
    else {
      showMsg('Stage → ' + oppStageLabel(stage))
      if (selected?.id === id) setSelected(s => ({ ...s, stage, lost_reason: payload.lost_reason ?? s.lost_reason }))
      await logActivity({ entityType: 'opportunity', entityId: id, action: 'stage_change', summary: 'Stage → ' + stage })
      load()
    }
  }

  async function saveOpp(e) {
    e.preventDefault()
    if (!selected?.id) return
    if (selected.stage === 'lost' && !(selected.lost_reason || '').trim()) {
      showMsg('Lost reason is required when stage is Lost.'); return
    }
    setSaving(true)
    const meta = {
      ...(selected.metadata || {}),
      next_action: selected.next_action || null,
      next_action_due: selected.next_action_due || null,
      solution: selected.solution || null,
    }
    const payload = {
      name: (selected.name || '').trim() || null,
      stage: selected.stage,
      deal_size: selected.deal_size != null && selected.deal_size !== '' ? Number(selected.deal_size) : null,
      expected_close_date: selected.expected_close_date || null,
      requirement_description: selected.requirement_description || null,
      pain_points: selected.solution || selected.pain_points || null,
      lost_reason: selected.stage === 'lost' ? (selected.lost_reason || null) : null,
      primary_contact_id: selected.primary_contact_id || null,
      metadata: meta,
    }
    let { error } = await supabase.from('opportunities').update(payload).eq('id', selected.id)
    if (error && /primary_contact|column/i.test(error.message)) {
      delete payload.primary_contact_id
      ;({ error } = await supabase.from('opportunities').update(payload).eq('id', selected.id))
    }
    setSaving(false)
    if (error) { showMsg('Save failed: ' + error.message); return }
    showMsg('Opportunity updated.')
    setSelected(null)
    load()
  }

  async function createOpp(e) {
    e.preventDefault()
    if (!form.company_id) { showMsg('Select a company.'); return }
    if (!form.requirement_description.trim()) { showMsg('Requirement is required.'); return }
    setSaving(true)
    const payload = {
      company_id: form.company_id,
      name: form.name.trim() || form.requirement_description.trim().slice(0, 80),
      stage: form.stage || 'requirement',
      deal_size: form.deal_size ? Number(form.deal_size) : null,
      expected_close_date: form.expected_close_date || null,
      requirement_description: form.requirement_description.trim(),
      pain_points: form.solution.trim() || null,
      primary_contact_id: form.primary_contact_id || null,
      state: 'active',
      metadata: {
        next_action: form.next_action.trim() || null,
        next_action_due: form.next_action_due || null,
        solution: form.solution.trim() || null,
      },
    }
    let { data, error } = await supabase.from('opportunities').insert(payload).select('id').single()
    if (error && /primary_contact|column/i.test(error.message)) {
      delete payload.primary_contact_id
      ;({ data, error } = await supabase.from('opportunities').insert(payload).select('id').single())
    }
    if (!error && form.next_action.trim() && form.next_action_due) {
      await supabase.from('tasks').insert({
        company_id: form.company_id,
        title: ('Opp next action: ' + form.next_action).slice(0, 200),
        description: 'From opportunity: ' + (payload.name || ''),
        due_at: form.next_action_due,
        priority: 'medium',
        status: 'open',
        source: 'user',
        state: 'active',
      })
    }
    setSaving(false)
    if (error) { showMsg('Create failed: ' + error.message); return }
    setShowCreate(false)
    setForm({ ...emptyForm })
    showMsg('Opportunity created.')
    load()
  }

  const boardCols = OPP_STAGES.filter(s => s !== 'won' && s !== 'lost')

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Pipeline" title="Opportunities" subtitle="Buyer stages · pipeline value prefers latest quote total (ex-tax); deal size is estimate only.">
        <button type="button" className="btn" onClick={() => setView(v => v === 'board' ? 'list' : 'board')}>{view === 'board' ? 'List view' : 'Board view'}</button>
        <button type="button" className="btn primary" onClick={() => { setForm({ ...emptyForm }); setShowCreate(true) }}>+ New opportunity</button>
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
                  <div key={r.id} className="opp-card" onClick={() => openEdit(r)} style={{ cursor: 'pointer', padding: 10, marginBottom: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
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
          onRowClick={openEdit}
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
            <Field label="Name">
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Short name (optional)" />
            </Field>
            <Field label="Requirement *">
              <textarea className="input" required rows={3} value={form.requirement_description}
                onChange={e => setForm({ ...form, requirement_description: e.target.value })} />
            </Field>
            <Field label="Solution / approach">
              <textarea className="input" rows={2} value={form.solution} onChange={e => setForm({ ...form, solution: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Stage">
                <select className="input" value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
                  {OPP_STAGES.filter(s => isOppOpen(s)).map(s => <option key={s} value={s}>{oppStageLabel(s)}</option>)}
                </select>
              </Field>
              <Field label="Deal size (estimate)">
                <input className="input" type="number" value={form.deal_size} onChange={e => setForm({ ...form, deal_size: e.target.value })} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Expected close">
                <input className="input" type="date" value={form.expected_close_date} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} />
              </Field>
              <Field label="Next action due">
                <input className="input" type="date" value={form.next_action_due} onChange={e => setForm({ ...form, next_action_due: e.target.value })} />
              </Field>
            </div>
            <Field label="Next action">
              <input className="input" value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} />
            </Field>
            {form.company_id && contacts.length > 0 && (
              <Field label="Primary contact">
                <select className="input" value={form.primary_contact_id} onChange={e => setForm({ ...form, primary_contact_id: e.target.value })}>
                  <option value="">—</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </Field>
            )}
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.name || 'Opportunity'} onClose={() => { setSelected(null); setShowQuote(false) }} width={640}>
          <form onSubmit={saveOpp}>
            <div style={{ fontSize: 13, marginBottom: 10, color: '#64748b' }}>
              {selected.companies?.name || '—'} · Value {formatInr(displayValue(selected))}
            </div>
            <Field label="Name">
              <input className="input" value={selected.name || ''} onChange={e => setSelected({ ...selected, name: e.target.value })} />
            </Field>
            <Field label="Requirement">
              <textarea className="input" rows={2} value={selected.requirement_description || ''} onChange={e => setSelected({ ...selected, requirement_description: e.target.value })} />
            </Field>
            <Field label="Solution">
              <textarea className="input" rows={2} value={selected.solution || ''} onChange={e => setSelected({ ...selected, solution: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Stage">
                <select className="input" value={selected.stage || 'requirement'} onChange={e => setSelected({ ...selected, stage: e.target.value })}>
                  {OPP_STAGES.map(s => <option key={s} value={s}>{oppStageLabel(s)}</option>)}
                </select>
              </Field>
              <Field label="Deal size (estimate)">
                <input className="input" type="number" value={selected.deal_size ?? ''} onChange={e => setSelected({ ...selected, deal_size: e.target.value })} />
              </Field>
            </div>
            {selected.stage === 'lost' && (
              <Field label="Lost reason *">
                <input className="input" required value={selected.lost_reason || ''} onChange={e => setSelected({ ...selected, lost_reason: e.target.value })} placeholder="Why lost?" />
              </Field>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Expected close">
                <input className="input" type="date" value={selected.expected_close_date || ''} onChange={e => setSelected({ ...selected, expected_close_date: e.target.value })} />
              </Field>
              <Field label="Next action due">
                <input className="input" type="date" value={selected.next_action_due || ''} onChange={e => setSelected({ ...selected, next_action_due: e.target.value })} />
              </Field>
            </div>
            <Field label="Next action">
              <input className="input" value={selected.next_action || ''} onChange={e => setSelected({ ...selected, next_action: e.target.value })} />
            </Field>
            {contacts.length > 0 && (
              <Field label="Primary contact">
                <select className="input" value={selected.primary_contact_id || ''} onChange={e => setSelected({ ...selected, primary_contact_id: e.target.value })}>
                  <option value="">—</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </Field>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <button type="button" className="btn" onClick={() => go('company', selected.company_id)}>Open company</button>
              <button type="button" className="btn primary" onClick={() => setShowQuote(s => !s)}>{showQuote ? 'Hide quotes' : 'Quotations'}</button>
              {isOppOpen(selected.stage) && OPP_STAGES.includes('won') && (
                <button type="button" className="btn" onClick={() => moveStage(selected.id, 'won')}>Mark won</button>
              )}
            </div>
            {showQuote && <div style={{ marginBottom: 12 }}><QuotationPanel opportunity={selected} onSaved={() => { load(); }} /></div>}
            <Actions saving={saving} onCancel={() => setSelected(null)} label="Save changes" />
          </form>
        </Modal>
      )}
    </div>
  )
}
