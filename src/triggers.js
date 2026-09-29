/** Daily trigger work engine.
 *  Creates a small, ranked set of system tasks. Idempotent via metadata.trigger_key.
 *  Does not scrape LinkedIn/news. Creates CHECK / REACH-OUT work from data we already have.
 */

const MAX_NEW = 15
const FIT = /it|software|manufactur|bank|infra|construct|pharma|auto|hospital|health|education|govern|energy|oil|telecom|logistics|warehouse|hotel|real estate|engineer|securit|print|office/i

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((t - ys) / 86400000) + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
function emp(c) {
  return Number(c.employee_count || c.enrichment_employee_count || 0)
}
function qName(name) {
  return encodeURIComponent(name || '')
}
function newsLinks(name) {
  const q = qName(name)
  return [
    `News: https://www.google.com/search?tbm=nws&q=${q}`,
    `Hiring: https://www.google.com/search?q=${encodeURIComponent((name || '') + ' hiring OR jobs OR careers site:linkedin.com')}`,
    `Funding: https://www.google.com/search?q=${encodeURIComponent((name || '') + ' funding OR investment OR raised')}`,
  ].join('\n')
}

async function insertTask(supabase, row) {
  const payload = {
    company_id: row.company_id,
    title: row.title,
    description: row.description || null,
    priority: row.priority || 'medium',
    status: 'open',
    due_at: row.due_at || todayISO(),
    state: 'active',
    source: 'trigger',
    metadata: { trigger_key: row.key, trigger_type: row.type, origin: 'trigger' }
  }
  let { error } = await supabase.from('tasks').insert(payload)
  if (error && /source|column/i.test(error.message)) {
    delete payload.source
    ;({ error } = await supabase.from('tasks').insert(payload))
  }
  return error
}

export async function runDailyTriggerScan(supabase) {
  const wk = weekKey()
  const created = []
  const skipped = []
  const errors = []

  const [cos, cons, openTasks, sigs, opps, meets] = await Promise.all([
    supabase.from('companies').select('id, name, website, industry, city, employee_count, enrichment_employee_count, lifecycle_status, research_status').eq('state', 'active').limit(2500),
    supabase.from('contacts').select('company_id').limit(8000),
    supabase.from('tasks').select('id, title, company_id, metadata, source').in('status', ['open', 'in_progress']).limit(2000),
    supabase.from('signals').select('id, company_id, signal_type, observation, review_status, companies(name)').in('review_status', ['pending', 'new', 'open']).limit(80),
    supabase.from('opportunities').select('id, name, stage, company_id, companies(name)').eq('stage', 'quotation').limit(40),
    supabase.from('meetings_calls').select('id, subject, next_action, next_action_due_at, company_id, companies(name)').not('next_action', 'is', null).limit(40)
  ])

  const companies = cos.data || []
  const withContact = new Set((cons.data || []).map(x => x.company_id).filter(Boolean))
  const open = openTasks.data || []
  const keys = new Set()
  open.forEach(t => {
    if (t.metadata?.trigger_key) keys.add(t.metadata.trigger_key)
    if (t.title) keys.add('title:' + t.title)
  })

  const candidates = []

  function add(item) {
    if (keys.has(item.key) || keys.has('title:' + item.title)) {
      skipped.push(item.key)
      return
    }
    candidates.push(item)
  }

  for (const s of (sigs.data || [])) {
    const name = s.companies?.name || 'company'
    add({
      key: `signal:${s.id}`,
      type: 'signal',
      score: 100,
      company_id: s.company_id,
      title: `Reach out on ${s.signal_type} signal: ${name}`,
      priority: 'high',
      description: `Trigger: ${s.signal_type} signal.\nObservation: ${s.observation || ''}\nAction: reach out, capture missing details, convert to opportunity if Hexagon-fit.\n${newsLinks(name)}`
    })
  }

  for (const o of (opps.data || [])) {
    add({
      key: `quote:${o.id}`,
      type: 'quotation',
      score: 95,
      company_id: o.company_id,
      title: `Quotation follow-up: ${o.name}`,
      priority: 'high',
      description: `Opportunity is in quotation. Follow up on response, negotiation and next action.`
    })
  }

  for (const m of (meets.data || [])) {
    add({
      key: `meeting:${m.id}`,
      type: 'meeting',
      score: 90,
      company_id: m.company_id,
      title: `Meeting next action: ${m.subject || m.companies?.name || 'follow-up'}`,
      priority: 'high',
      due_at: (m.next_action_due_at || '').slice(0, 10) || todayISO(),
      description: m.next_action
    })
  }

  for (const c of companies) {
    const n = emp(c)
    const industry = c.industry || ''
    const fit = industry && FIT.test(industry)
    const noPeople = !withContact.has(c.id)
    const thin = !c.website || !c.industry || !c.city || noPeople
    const life = (c.lifecycle_status || 'prospect')
    if (life === 'lost' || life === 'dormant') continue

    if (thin) {
      add({
        key: `missing:${c.id}`,
        type: 'missing_details',
        score: 55 + (fit ? 10 : 0) + (n >= 200 ? 10 : 0),
        company_id: c.id,
        title: `Get missing details: ${c.name}`,
        priority: n >= 200 || fit ? 'high' : 'medium',
        description: `Missing: ${[!c.website && 'website', !c.industry && 'industry', !c.city && 'city', noPeople && 'contact'].filter(Boolean).join(', ')}.\nReach out or research, then update the company record.\n${newsLinks(c.name)}`
      })
    }
    if (n >= 200) {
      add({
        key: `employees:${c.id}:${wk}`,
        type: 'employee_count',
        score: n >= 1000 ? 80 : 65,
        company_id: c.id,
        title: `Scale review (employees ${n}): ${c.name}`,
        priority: n >= 1000 ? 'high' : 'medium',
        description: `Employee count ${n} suggests infrastructure / workspace / security demand. Identify IT, procurement and a live requirement.\n${newsLinks(c.name)}`
      })
    }
    if (fit && (c.research_status === 'NOT_RESEARCHED' || !c.research_status)) {
      add({
        key: `industry:${c.id}`,
        type: 'industry',
        score: 50,
        company_id: c.id,
        title: `Industry-fit research: ${c.name}`,
        priority: 'medium',
        description: `Industry: ${industry}. Check Hexagon fit (workspace, infra, security, print, networking). Find a contact and one requirement.\n${newsLinks(c.name)}`
      })
    }
    if (c.research_status === 'NEEDS_UPDATE' || c.research_status === 'NOT_RESEARCHED') {
      add({
        key: `newscheck:${c.id}:${wk}`,
        type: 'news_hiring_funding',
        score: 35 + (fit ? 8 : 0) + (n >= 200 ? 8 : 0),
        company_id: c.id,
        title: `Check news / hiring / funding: ${c.name}`,
        priority: 'medium',
        description: `Weekly scan. Log a Signal if you find hiring, funding, expansion or buying intent. Then reach out for missing details.\n${newsLinks(c.name)}`
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const picked = candidates.slice(0, MAX_NEW)

  for (const item of picked) {
    const error = await insertTask(supabase, item)
    if (error) errors.push(`${item.title}: ${error.message}`)
    else {
      created.push(item)
      keys.add(item.key)
    }
  }

  return {
    created: created.length,
    skipped: skipped.length,
    considered: candidates.length,
    errors,
    items: created.map(x => ({ title: x.title, type: x.type, priority: x.priority }))
  }
}
