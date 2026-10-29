import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { PAGE_SIZE, OPP_STAGES, oppStageLabel, isOppOpen } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge, CompanySearchSelect } from '../ui'
import QuotationPanel from '../components/QuotationPanel'

const emptyForm = {
  company_id: '', name: '', stage: 'requirement', deal_size: '', expected_close_date: '',
  requirement_description: '', solution: '', next_action: '', next_action_due: '', primary_contact_id: '',
}

export default function Opportunities({ go }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('board')
  const [stageFilter, setStageFilter] = useState('all')
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

  useEffect(() => {
    load()
  }, [view, stageFilter, page, sortKey, sortDir])

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
    setTimeout(() => setFlash(''), 4000)
  }

  async function load() {
    setLoading(true)
    if (view === 'board') {
      const { data, error } = await supabase.from('opportunities')
        .select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id, companies(name)')
        .neq('state', 'deleted')
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
      if (stageFilter !== 'all') q = q.eq('stage', stageFilter)
      const { data, count, error } = await q
      if (error) console.error(error)
      setItems(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
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
      solution: form.solution.trim() || null,
      next_action: form.next_action.trim() || null,
      next_action_due: form.next_action_due || null,
      primary_contact_id: form.primary_contact_id || null,
      state: 'active',
      metadata: {},
    }
    const { data, error } = await supabase.from('opportunities').insert(payload).select('id').single()
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

  const board = useMemo(() => {
    const map = {}
    for (const st of OPP_STAGES) map[st] = []
    for (const it of items) {
      const st = it.stage || 'requirement'
      if (!map[st]) map[st] = []
      map[st].push(it)
    }
    return map
  }, [items])

  return (
    <div style={{ padding: 28 }}>
      <PageHead eyebrow="Pipeline" title="Opportunities" subtitle="Buyer progress stages. Quote value drives pipeline when available.">
        <button type="button" className="btn" onClick={() => setView(v => v === 'board' ? 'list' : 'board')}>{view === 'board' ? 'List view' : 'Board view'}</button>
        <button type="button" className="btn primary" onClick={() => { setForm({ ...emptyForm }); setShowCreate(true) }}>+ New opportunity</button>
      </PageHead>

      {flash && <div className="notice" style={{ marginBottom: 12 }}>{flash}</div>}

      {loading ? <div className="loading">Loading…</div> : view === 'board' ? (
        <div className="stagebar">
          {OPP_STAGES.map(st => {
            const list = board[st] || []
            const colVal = list.reduce((s, r) => s + (Number(r.deal_size) || 0), 0)
            return (
              <div className="stage" key={st} style={{ minWidth: 180 }}>
                <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{oppStageLabel(st)} ({list.length})</h4>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>₹{colVal.toLocaleString()}</div>
                {list.map(r => (
                  <div key={r.id} className="opp-card" onClick={() => setSelected(r)}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name || '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{r.companies?.name || '—'}</div>
                    {r.deal_size != null && <div style={{ fontSize: 12, color: '#065f46' }}>₹{Number(r.deal_size).toLocaleString()}</div>}
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
            { key: 'company', label: 'Company', render: r => r.companies?.name || '—' },
            { key: 'stage', label: 'Stage', render: r => <Badge>{oppStageLabel(r.stage)}</Badge> },
            { key: 'deal_size', label: 'Value', render: r => r.deal_size != null ? `₹${Number(r.deal_size).toLocaleString()}` : '—' },
          ]}
          rows={items}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={k => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc') } }}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          onRowClick={r => setSelected(r)}
          empty="No opportunities"
        />
      )}

      {showCreate && (
        <Modal title="New opportunity" onClose={() => setShowCreate(false)} width={560}>
          <form onSubmit={createOpp}>
            <Field label="Company *">
              <CompanySearchSelect
                companies={companies}
                value={form.company_id}
                onChange={id => setForm({ ...form, company_id: id, primary_contact_id: '' })}
                required
              />
            </Field>
            <Field label="Name">
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Short name (optional)" />
            </Field>
            <Field label="Requirement *">
              <textarea className="input" required rows={3} value={form.requirement_description} onChange={e => setForm({ ...form, requirement_description: e.target.value })} />
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
            <Field label="Expected close">
              <input className="input" type="date" value={form.expected_close_date} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} />
            </Field>
            <Field label="Next action">
              <input className="input" value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} />
            </Field>
            <Field label="Next action due">
              <input className="input" type="date" value={form.next_action_due} onChange={e => setForm({ ...form, next_action_due: e.target.value })} />
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
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            <div><strong>Company:</strong> {selected.companies?.name || '—'}</div>
            <div><strong>Stage:</strong> {oppStageLabel(selected.stage)}</div>
            <div><strong>Deal size:</strong> {selected.deal_size != null ? `₹${Number(selected.deal_size).toLocaleString()}` : '—'}</div>
          </div>
          <p style={{ fontSize: 13, color: '#334155', marginBottom: 12 }}>{selected.requirement_description || '—'}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => go('company', selected.company_id)}>Open company</button>
            <button type="button" className="btn primary" onClick={() => setShowQuote(s => !s)}>{showQuote ? 'Hide quotes' : 'Quotations'}</button>
          </div>
          {showQuote && <div style={{ marginTop: 16 }}><QuotationPanel opportunity={selected} onSaved={() => load()} /></div>}
        </Modal>
      )}
    </div>
  )
}
