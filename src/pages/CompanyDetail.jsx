import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, OPP_STAGES, lifecycleLabel, oppStageLabel } from '../constants'
import { Modal, Field, Actions, Badge } from '../ui'
import {
  EMPTY_OPP_FORM,
  OpportunityCreateFields,
  OpportunityDetail,
  createOppWithOptionalTask,
} from '../components/OpportunityShared'

export default function CompanyDetail({ id, go }) {
  const [company, setCompany] = useState(null)
  const [contacts, setContacts] = useState([])
  const [opps, setOpps] = useState([])
  const [loading, setLoading] = useState(true)
  const [showOpp, setShowOpp] = useState(false)
  const [oForm, setOForm] = useState({ ...EMPTY_OPP_FORM })
  const [selectedOpp, setSelectedOpp] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (id) load() }, [id])

  async function load() {
    setLoading(true)
    const [c, ct, o] = await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('company_id', id).order('full_name'),
      supabase.from('opportunities').select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id').eq('company_id', id).neq('state', 'deleted').order('created_at', { ascending: false }),
    ])
    setCompany(c.data)
    setContacts(ct.data || [])
    setOpps(o.data || [])
    setLoading(false)
  }

  async function createOpp(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const { data, error } = await createOppWithOptionalTask(oForm, id)
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowOpp(false)
    setOForm({ ...EMPTY_OPP_FORM })
    await load()
    if (data?.id) {
      const full = (await supabase.from('opportunities').select('id, name, stage, deal_size, currency, expected_close_date, opportunity_code, requirement_description, pain_points, metadata, lost_reason, primary_contact_id, company_id').eq('id', data.id).single()).data
      if (full) setSelectedOpp(full)
    }
  }

  if (loading) return <div className="loading" style={{ padding: 40 }}>Loading…</div>
  if (!company) return <div className="empty" style={{ padding: 40 }}>Company not found</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => go('companies')}>← Companies</button>
        <h1 style={{ fontSize: 22, margin: 0 }}>{company.name}</h1>
        <Badge>{lifecycleLabel(company.lifecycle_status)}</Badge>
        <button type="button" className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => { setOForm({ ...EMPTY_OPP_FORM }); setShowOpp(true) }}>+ New opportunity</button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {company.city || '—'} · {company.industry || '—'} · {company.website || '—'}
        </div>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Opportunities</h2>
      {opps.length === 0 ? (
        <div className="empty" style={{ padding: 16 }}>No opportunities yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opps.map(o => (
            <button
              key={o.id}
              type="button"
              className="card"
              style={{ textAlign: 'left', cursor: 'pointer', padding: 12 }}
              onClick={() => setSelectedOpp(o)}
            >
              <strong>{o.name || '—'}</strong>
              <span style={{ marginLeft: 8, color: '#64748b', fontSize: 13 }}>{oppStageLabel(o.stage)} · ₹{Number(o.deal_size || 0).toLocaleString('en-IN')}</span>
            </button>
          ))}
        </div>
      )}

      {showOpp && (
        <Modal title="New opportunity" onClose={() => setShowOpp(false)} width={1200}>
          <form onSubmit={createOpp}>
            <OpportunityCreateFields form={oForm} setForm={setOForm} contacts={contacts} />
            <Actions saving={saving} onCancel={() => setShowOpp(false)} label="Create opportunity" />
          </form>
        </Modal>
      )}

      {selectedOpp && (
        <Modal title={selectedOpp.name || 'Opportunity'} onClose={() => setSelectedOpp(null)} width={1200}>
          <OpportunityDetail
            opportunity={{ ...selectedOpp, companies: { name: company?.name } }}
            contacts={contacts}
            onClose={() => setSelectedOpp(null)}
            onSaved={() => load()}
            goCompany={() => setSelectedOpp(null)}
          />
        </Modal>
      )}
    </div>
  )
}
