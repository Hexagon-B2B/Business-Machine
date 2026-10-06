/** Controlled values — aligned with Supabase + V1 Data Dictionary */

/** Company sales lifecycle (buyer relationship stage) */
export const LIFECYCLE = [
  'prospect_no_contact',
  'wishlist_1',
  'wishlist_2',
  'first_contact',
  'spoc_identified',
  'rfq_only',
  'active',
  'lost',
]
export const LIFECYCLE_META = {
  prospect_no_contact: { label: 'Prospect - No Contact', short: 'No Contact' },
  wishlist_1:          { label: 'Wishlist 1',            short: 'Wishlist 1' },
  wishlist_2:          { label: 'Wishlist 2',            short: 'Wishlist 2' },
  first_contact:       { label: '1st Contact Only',      short: '1st Contact' },
  spoc_identified:     { label: 'SPOC Identified',       short: 'SPOC ID' },
  rfq_only:            { label: 'RFQ Only',              short: 'RFQ Only' },
  active:              { label: 'Active',                short: 'Active' },
  lost:                { label: 'Lost',                  short: 'Lost' },
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

/** Opportunity stages — buyer progress */
export const OPP_STAGES = ['requirement', 'qualification', 'discovery', 'solution', 'quotation', 'negotiation', 'decision', 'won', 'lost']
export const OPP_STAGE_META = {
  requirement:   { label: 'Requirement',   short: 'Req' },
  qualification: { label: 'Qualification', short: 'Qual' },
  discovery:     { label: 'Discovery',     short: 'Disc' },
  solution:      { label: 'Solution',      short: 'Sol' },
  quotation:     { label: 'Quotation',     short: 'Quote' },
  negotiation:   { label: 'Negotiation',   short: 'Neg' },
  decision:      { label: 'Decision',      short: 'Dec' },
  won:           { label: 'Won',           short: 'Won' },
  lost:          { label: 'Lost',          short: 'Lost' },
}
export function oppStageLabel(s) {
  return OPP_STAGE_META[s]?.label || s || '—'
}
export function isOppOpen(stage) {
  return stage && stage !== 'won' && stage !== 'lost'
}

export const TASK_STATUS = ['open', 'in_progress', 'completed', 'cancelled']
export const TASK_CLOSED = ['completed', 'done', 'cancelled']
export function isTaskClosed(status) {
  return TASK_CLOSED.includes(status)
}
export function isTaskOpen(status) {
  return !isTaskClosed(status)
}
export const TASK_PRIORITY = ['low', 'medium', 'high']

export const SIGNAL_TYPES = ['news', 'hiring', 'funding', 'expansion', 'tender', 'leadership', 'other']
export const SIGNAL_REVIEW = ['pending', 'relevant', 'not_relevant', 'actioned']

export const PAGE_SIZE = 25

export const MISSING_COMPANY_FIELDS = [
  'website', 'email', 'industry', 'city', 'employee_count', 'gst_no', 'board_no',
]

export const TRIGGER_TYPE_LABELS = {
  missing_details: 'Missing company details',
  employee_count: 'Employee scale',
  industry: 'Industry fit',
  news_hiring_funding: 'News / hiring / funding',
  signal: 'Signal',
  quotation: 'Quotation follow-up',
  meeting: 'Meeting next-action',
}

export const DEFAULT_TRIGGER_CONFIG = {
  maxNew: 15,
  employeeThreshold: 50,
  employeeHighThreshold: 500,
  enableMissingDetails: true,
  enableEmployeeCount: true,
  enableIndustry: true,
  enableNewsHiringFunding: true,
  enableSignals: true,
  enableQuotation: true,
  enableMeeting: true,
}
