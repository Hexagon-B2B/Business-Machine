/** Controlled values — aligned with Supabase + V1 Data Dictionary */

export const LIFECYCLE = ['prospect', 'active', 'repeat', 'dormant', 'lost']
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
export const SIGNAL_REVIEW = ['pending', 'reviewed', 'actioned', 'dismissed']
export const MEETING_TYPES = ['call', 'meeting', 'visit', 'message']
export const PAGE_SIZE = 25

export const MISSING_COMPANY_FIELDS = [
  ['website', 'Website'],
  ['industry', 'Industry'],
  ['city', 'City'],
  ['country', 'Country'],
  ['legal_name', 'Legal name'],
  ['employee_count', 'Employee count'],
]

export const TRIGGER_TYPE_LABELS = {
  signal: 'Signal',
  quotation: 'Quotation',
  meeting: 'Meeting',
  missing_details: 'Missing details',
  employee_count: 'Employee scale',
  industry: 'Industry fit',
  news_hiring_funding: 'News / Hiring / Funding',
  research: 'Research',
}

/** Default trigger criteria — overridable via localStorage key hexagon_trigger_config */
export const DEFAULT_TRIGGER_CONFIG = {
  maxNew: 15,
  employeeThreshold: 200,
  employeeHighThreshold: 1000,
  enableMissingDetails: true,
  enableEmployeeCount: true,
  enableIndustry: true,
  enableNewsHiringFunding: true,
  enableSignals: true,
  enableQuotation: true,
  enableMeeting: true,
}
