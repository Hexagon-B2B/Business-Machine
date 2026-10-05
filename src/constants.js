/** Controlled values — aligned with Supabase + V1 Data Dictionary */

/** Company sales lifecycle (buyer relationship stage) */
export const LIFECYCLE = [
  'prospect_no_contact',
  'first_contact',
  'spoc_identified',
  'rfq_only',
  'active',
  'lost',
]
export const LIFECYCLE_META = {
  prospect_no_contact: { label: 'Prospect — no contact yet', short: 'No contact' },
  first_contact:       { label: '1st contact only',          short: '1st contact' },
  spoc_identified:     { label: 'SPOC identified',           short: 'SPOC ID' },
  rfq_only:            { label: 'RFQ only',                  short: 'RFQ only' },
  active:              { label: 'Active',                    short: 'Active' },
  lost:                { label: 'Lost',                      short: 'Lost' },
}
export function lifecycleLabel(s) {
  return LIFECYCLE_META[s]?.label || s || '—'
}
export function lifecycleShort(s) {
  return LIFECYCLE_META[s]?.short || s || '—'
}

/** Contact phone kinds */
export const PHONE_TYPES = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'landline', label: 'Direct landline' },
  { value: 'extension', label: 'Extension (via board)' },
]

export const RESEARCH_STATUS = ['NOT_RESEARCHED', 'IN_PROGRESS', 'RESEARCHED', 'NEEDS_UPDATE']
export const ROLES = ['Decision Maker', 'Procurement', 'IT', 'Finance', 'Technical Evaluator', 'Influencer', 'End User', 'Other']
export const OPP_STAGES = ['requirement', 'qualification', 'discovery', 'solution', 'quotation', 'negotiation', 'decision', 'won', 'lost']
/** Stage meaning for Hexagon B2B commercial process (buyer progress, not internal busy-work) */
export const OPP_STAGE_META = {
  requirement:   { label: 'Requirement',   pct: 10,  exit: 'Buyer has a stated need Hexagon can address' },
  qualification: { label: 'Qualification', pct: 20,  exit: 'ICP fit, budget path, and a stakeholder confirmed' },
  discovery:     { label: 'Discovery',     pct: 35,  exit: 'Pain, success criteria, and buying process understood' },
  solution:      { label: 'Solution',      pct: 50,  exit: 'Proposed offer maps to their requirement' },
  quotation:     { label: 'Quotation',     pct: 65,  exit: 'Formal commercial quote shared; follow-up owned' },
  negotiation:   { label: 'Negotiation',   pct: 80,  exit: 'Terms under discussion; objections in play' },
  decision:      { label: 'Decision',      pct: 90,  exit: 'Awaiting final yes / internal approval' },
  won:           { label: 'Won',           pct: 100, exit: 'Order / commitment confirmed' },
  lost:          { label: 'Lost',          pct: 0,   exit: 'Closed without win — capture reason' },
}
export function oppStageLabel(s) {
  return OPP_STAGE_META[s]?.label || s
}
export function isOppOpen(stage) {
  return stage !== 'won' && stage !== 'lost'
}
export const TASK_STATUS = ['open', 'in_progress', 'completed', 'cancelled']
/** Closed statuses (DB check constraint uses completed, not done) */
export const TASK_CLOSED = ['completed', 'done', 'cancelled']
export function isTaskClosed(status) {
  return TASK_CLOSED.includes((status || '').toLowerCase())
}
export function isTaskOpen(status) {
  return !isTaskClosed(status)
}
export const TASK_PRIORITY = ['low', 'medium', 'high']
export const SIGNAL_TYPES = ['news', 'hiring', 'funding', 'expansion', 'tender', 'leadership', 'other']
export const PAGE_SIZE = 25
export const MISSING_COMPANY_FIELDS = [
  ['industry', 'Industry'],
  ['employee_count', 'Employee count'],
  ['website', 'Website'],
  ['city', 'City'],
  ['gst_no', 'GST'],
]
export const TRIGGER_TYPE_LABELS = {
  missing_details: 'Missing details',
  employees: 'Employees',
  industry: 'Industry',
  research: 'Research',
  signal: 'Signal',
  quotation_followup: 'Quote follow-up',
  news: 'News',
  hiring: 'Hiring',
  funding: 'Funding',
}
