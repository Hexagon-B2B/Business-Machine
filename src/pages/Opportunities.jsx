import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, OPP_STAGE_META, PAGE_SIZE, oppStageLabel, isOppOpen } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'
import QuotationPanel from '../components/QuotationPanel'
import { logActivity } from '../lib/activityLog'

function stageTone(stage) {
  if (stage === 'won') return 'green'
  if (stage === 'lost') return 'red'
  if (stage === 'quotation' || stage === 'negotiation' || stage === 'decision') return 'yellow'
  return 'blue'
}

const emptyForm = {
  company_id: '', name: '', stage: 'requirement', deal_size: '', expected_close_date: '',
  requirement_description: '', solution: '', next_action: '', next_action_due: '',
  primary_contact_id: '', lost_reason: '',
}

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
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')

  useEffect(() => { load() }, [page, sortKey, sortDir, stageFilter, view])
  useEffect(() => {
    supabase.from('companies').select('id, name').eq('state', 'active').order('name').limit(2000)
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
    setTimeout(() => setFlash(''), 4000)
  }

  async function load() {
    setLoading(true)
    const board = await supabase.from('opportunities')
      .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name)')
      .not('stage', 'in', '(won,lost)')
      .order('created_at', { ascending: false })
      .limit(300)
    setAllForBoard(board.data || [])
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase.from('opportunities')
      .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name)', { count: 'exact' })
      .order(sortKey, { ascending: sortDir === 'asc' })
      .range(from, to)
    if (stageFilter === 'open') q = q.not('stage', 'in', '(won,lost)')
    else if (stageFilter === 'closed') q = q.in('stage', ['won', 'lost'])
    else if (stageFilter !== 'all') q = q.eq('stage', stageFilter)
    const { data, count } = await q
    setItems(data || []); setTotal(count || 0); setLoading(false)
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
      next_action: o.metadata?.next_action || '',
      next_action_due: o.metadata?.next_action_due || '',
      lost_reason: o.lost_reason || '',
    })
  }

  async function moveStage(id, stage) {
    if (stage === 'lost' && selected?.id === id && !selected.lost_reason) {
      showMsg('Capture lost reason when moving to Lost.')
      setSelected(s => s && s.id === id ? { ...s, stage: 'lost' } : s)
      return
    }
    const { error } = await supabase.from('opportunities').update({ stage }).eq('id', id)
    if (error) showMsg('Stage update failed: ' + error.message)
    else {
      showMsg('Stage → ' + oppStageLabel(stage))
      if (selected?.id === id) setSelected(s => ({ ...s, stage }))
      await logActivity({ entityType: 'opportunity', entityId: id, action: 'stage_change', summary: `Stage → ${stage}` })
      load()
    }
  }

  async function saveOpp(e) {
    e.preventDefault()
    if (!selected) return
    if (selected.stage === 'lost' && !(selected.lost_reason || '').trim()) {
      showMsg('Lost reason is required when stage is Lost.'); return
    }
    setSaving(true)
    const { data: latest } = await supabase.from('opportunities').select('metadata').eq('id', selected.id).single()
    const meta = {
      ...(latest?.metadata || selected.metadata || {}),
      next_action: selected.next_action || null,
      next_action_due: selected.next_action_due || null,
      solution: selected.solution || null,
    }
    const payload = {
      name: selected.name?.trim() || selected.name,
      stage: selected.stage,
      deal_size: selected.deal_size ? Number(selected.deal_size) : null,
      expected_close_date: selected.expected_close_date || null,
      requirement_description: selected.requirement_description || null,
      pain_points: selected.solution || selected.pain_points || null,
      metadata: meta,
      lost_reason: selected.stage === 'lost' ? (selected.lost_reason || null) : null,
      primary_contact_id: selected.primary_contact_id || null,
    }
    let { error } = await supabase.from('opportunities').update(payload).eq('id', selected.id)
    if (error && /primary_contact|column/i.test(error.message)) {
      delete payload.primary_contact_id
      ;({ error } = await supabase.from('opportunities').update(payload).eq('id', selected.id))
    }
    if (error) { setSaving(false); showMsg('Save failed: ' + error.message); return }

    if (selected.next_action && selected.next_action_due && selected.company_id) {
      await supabase.from('tasks').insert({
        company_id: selected.company_id,
        title: `Opp next action: ${selected.next_action}`.slice(0, 200),
        description: `From opportunity: ${selected.name}\nStage: ${selected.stage}\n${selected.requirement_description || ''}`,
        priority: selected.stage === 'quotation' || selected.stage === 'negotiation' ? 'high' : 'medium',
        status: 'open', due_at: selected.next_action_due, state: 'active', source: 'user',
        metadata: { origin: 'opportunity', opportunity_id: selected.id },
      }).then(() => {})
    }

    setSaving(false)
    await logActivity({
      entityType: 'opportunity', entityId: selected.id, action: 'opportunity_saved',
      summary: `${selected.name} · stage ${selected.stage}`,
      payload: { stage: selected.stage, deal_size: selected.deal_size },
    })
    setSelected(null); showMsg('Opportunity saved.'); load()
  }

  async function createOpp(e) {
    e.preventDefault()
    if (!form.company_id) { showMsg('Select a company.'); return }
    if (!form.name.trim()) { showMsg('Opportunity name is required.'); return }
    if (!form.requirement_description.trim()) { showMsg('Capture the requirement — that is what makes this a real opportunity.'); return }
    setSaving(true)
    const meta = { next_action: form.next_action || null, next_action_due: form.next_action_due || null, solution: form.solution || null }
    const payload = {
      company_id: form.company_id, name: form.name.trim(), stage: form.stage || 'requirement',
      deal_size: form.deal_size ? Number(form.deal_size) : null, currency: 'INR',
      expected_close_date: form.expected_close_date || null,
      requirement_description: form.requirement_description.trim(),
      pain_points: form.solution || null,
      opportunity_code: 'OPP-' + Date.now().toString(36).toUpperCase(),
      state: 'active', metadata: meta, primary_contact_id: form.primary_contact_id || null,
    }
    let { error } = await supabase.from('opportunities').insert(payload)
    if (error && /primary_contact|column/i.test(error.message)) {
      delete payload.primary_contact_id
      ;({ error } = await supabase.from('opportunities').insert(payload))
    }
    setSaving(false)
    if (error) { showMsg('Create failed: ' + error.message); return }
    setShowCreate(false); setForm({ ...emptyForm }); showMsg('Opportunity created.'); load()
  }

  const columns = [
    { key: 'name', label: 'Opportunity', bold: true },
    { key: 'company', label: 'Company', render: r => (
      <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', padding: 0 }}
        onClick={e => { e.stopPropagation(); go('company', r.company_id) }}>{r.companies?.name || '—'}</button>
    )},
    { key: 'stage', label: 'Stage', render: r => <Badge tone={stageTone(r.stage)}>{oppStageLabel(r.stage)}</Badge> },
    { key: 'deal_size', label: 'Value', render: r => r.deal_size ? `₹${Number(r.deal_size).toLocaleString()}` : '—' },
    { key: 'expected_close_date', label: 'Timing', render: r => r.expected_close_date || '—' },
    { key: 'next', label: 'Next action', render: r => r.metadata?.next_action || '—' },
  ]

  const pipelineStages = OPP_STAGES.filter(s => isOppOpen(s))
  const pipelineValue = allForBoard.reduce((s, o) => s + (Number(o.deal_size) || 0), 0)

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Commercial" title="Opportunities"
        subtitle="Buyer-progress stages: Requirement → Qualification → Discovery → Solution → Quotation → Negotiation → Decision → Won / Lost">
        <button type="button" className="btn" onClick={() => go('companies')}>Companies</button>
        <button type="button" className="btn primary" onClick={() => { setForm({ ...emptyForm }); setShowCreate(true) }}>+ New opportunity</button>
      </PageHead>

      {flash && (
        <div className="notice" style={{ marginBottom: 12, background: flash.includes('failed') || flash.includes('required') || flash.includes('Select') || flash.includes('Capture') ? '#fef2f2' : '#ecfdf5', color: flash.includes('failed') || flash.includes('required') || flash.includes('Select') || flash.includes('Capture') ? '#991b1b' : '#065f46' }}>{flash}</div>
      )}

      <div className="notice" style={{ marginBottom: 14 }}>
        <strong>Discipline:</strong> Open a deal → create item-wise quotations (base + upgrades, transfer / margin % / customer price).
      </div>

      <FilterTabs value={view} onChange={setView} options={[{ value: 'pipeline', label: 'Pipeline board' }, { value: 'list', label: 'List' }]} />

      {view === 'pipeline' && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, color: '#475569', flexWrap: 'wrap' }}>
            <span><strong>{allForBoard.length}</strong> open deals</span>
            <span>Pipeline value <strong>₹{pipelineValue.toLocaleString()}</strong></span>
          </div>
          {loading ? <div className="loading">Loading pipeline…</div> : (
            <div className="stagebar" style={{ overflowX: 'auto' }}>
              {pipelineStages.map(st => {
                const list = allForBoard.filter(o => (o.stage || '').toLowerCase() === st)
                const meta = OPP_STAGE_META[st]
                const colVal = list.reduce((s, o) => s + (Number(o.deal_size) || 0), 0)
                return (
                  <div className="stage" key={st} style={{ minWidth: 180 }}>
                    <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{meta?.label || st} ({list.length})</h4>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{meta?.pct}% · ₹{colVal.toLocaleString()}</div>
                    {list.length === 0 && <div className="empty" style={{ padding: 10, fontSize: 12 }}>None</div>}
                    {list.map(o => (
                      <div className="opp-card" key={o.id} onClick={() => openEdit(o)} style={{ cursor: 'pointer' }}>
                        <strong style={{ fontSize: 13 }}>{o.name}</strong>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0' }}>{o.companies?.name}</p>
                        <p style={{ fontSize: 12 }}>{o.deal_size ? `₹${Number(o.deal_size).toLocaleString()}` : 'Value not set'}</p>
                        {o.metadata?.next_action && <Badge tone="blue">{o.metadata.next_action}</Badge>}
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
            options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Won / Lost' }, ...OPP_STAGES.map(s => ({ value: s, label: oppStageLabel(s) }))]} />
          {loading ? <div className="loading">Loading…</div> : (
            <DataTable columns={columns} rows={items} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
              page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} onRowClick={openEdit}
              empty="No opportunities. Create from here or from a Company." />
          )}
        </>
      )}

      {showCreate && (
        <Modal title="New opportunity" onClose={() => setShowCreate(false)} width={560}>
          <form onSubmit={createOpp}>
            <Field label="Company *">
              <select className="input" required value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value, primary_contact_id: '' })}>
                <option value="">Select company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Opportunity name *">
              <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Workspace fit-out · Phase 1" />
            </Field>
            <Field label="Requirement *">
              <textarea className="input" rows={3} required value={form.requirement_description} onChange={e => setForm({ ...form, requirement_description: e.target.value })} placeholder="What does the buyer need?" />
            </Field>
            <Field label="Proposed solution / Hexagon fit">
              <textarea className="input" rows={2} value={form.solution} onChange={e => setForm({ ...form, solution: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Stage">
                <select className="input" value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
                  {OPP_STAGES.filter(s => isOppOpen(s)).map(s => <option key={s} value={s}>{oppStageLabel(s)} ({OPP_STAGE_META[s]?.pct}%)</option>)}
                </select>
              </Field>
              <Field label="Est. value (INR)">
                <input className="input" type="number" value={form.deal_size} onChange={e => setForm({ ...form, deal_size: e.target.value })} />
              </Field>
              <Field label="Expected close">
                <input className="input" type="date" value={form.expected_close_date} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} />
              </Field>
            </div>
            <Actions saving={saving} onCancel={() => setShowCreate(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)} width={720}>
          <form onSubmit={saveOpp}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => go('company', selected.company_id)}>Open company →</button>
              {selected.opportunity_code && <Badge>{selected.opportunity_code}</Badge>}
              <Badge tone={stageTone(selected.stage)}>{oppStageLabel(selected.stage)} · {OPP_STAGE_META[selected.stage]?.pct ?? '—'}%</Badge>
            </div>
            <Field label="Company"><div style={{ fontWeight: 600 }}>{selected.companies?.name || '—'}</div></Field>
            <Field label="Name">
              <input className="input" value={selected.name || ''} onChange={e => setSelected({ ...selected, name: e.target.value })} />
            </Field>
            <Field label="Stage">
              <select className="input" value={selected.stage || 'requirement'} onChange={e => setSelected({ ...selected, stage: e.target.value })}>
                {OPP_STAGES.map(s => <option key={s} value={s}>{oppStageLabel(s)} ({OPP_STAGE_META[s]?.pct}%)</option>)}
              </select>
            </Field>
            {OPP_STAGE_META[selected.stage]?.exit && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: -6, marginBottom: 10 }}>Exit criteria: {OPP_STAGE_META[selected.stage].exit}</div>
            )}
            <Field label="Requirement">
              <textarea className="input" rows={2} value={selected.requirement_description || ''} onChange={e => setSelected({ ...selected, requirement_description: e.target.value })} />
            </Field>
            <Field label="Proposed solution / Hexagon fit">
              <textarea className="input" rows={2} value={selected.solution || ''} onChange={e => setSelected({ ...selected, solution: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Estimated value (INR)">
                <input className="input" type="number" value={selected.deal_size || ''} onChange={e => setSelected({ ...selected, deal_size: e.target.value })} />
              </Field>
              <Field label="Expected close">
                <input className="input" type="date" value={selected.expected_close_date || ''} onChange={e => setSelected({ ...selected, expected_close_date: e.target.value })} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
              <Field label="Next action">
                <input className="input" value={selected.next_action || ''} onChange={e => setSelected({ ...selected, next_action: e.target.value })} />
              </Field>
              <Field label="Next due (creates task on save)">
                <input className="input" type="date" value={selected.next_action_due || ''} onChange={e => setSelected({ ...selected, next_action_due: e.target.value })} />
              </Field>
            </div>
            {selected.stage === 'lost' && (
              <Field label="Lost reason *">
                <input className="input" required value={selected.lost_reason || ''} onChange={e => setSelected({ ...selected, lost_reason: e.target.value })} />
              </Field>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {isOppOpen(selected.stage) && OPP_STAGES.filter(s => isOppOpen(s)).map(s => (
                <button key={s} type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px', background: selected.stage === s ? '#1e40af' : undefined, color: selected.stage === s ? '#fff' : undefined }}
                  onClick={() => moveStage(selected.id, s)}>{oppStageLabel(s)}</button>
              ))}
              <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => moveStage(selected.id, 'won')}>Won</button>
              <button type="button" className="btn danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setSelected({ ...selected, stage: 'lost' })}>Lost</button>
            </div>
            <div className="notice">Next action + due creates a task when you save the opportunity. Quotes are saved separately below.</div>
            <Actions saving={saving} onCancel={() => setSelected(null)} label="Save opportunity" />
          </form>

            <QuotationPanel
              opportunity={selected}
              onTotalChange={v => { if (v != null && v !== '') setSelected(s => ({ ...s, deal_size: v })) }}
            />
        </Modal>
      )}
    </div>
  )
}
