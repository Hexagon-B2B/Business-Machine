/** Controlled values — aligned with Supabase + V1 Data Dictionary */

export const LIFECYCLE = ['prospect', 'active', 'repeat', 'dormant', 'lost']
export const RESEARCH_STATUS = ['NOT_RESEARCHED', 'IN_PROGRESS', 'RESEARCHED', 'NEEDS_UPDATE']
export const ROLES = ['Decision Maker', 'Procurement', 'IT', 'Finance', 'Technical Evaluator', 'Influencer', 'End User', 'Other']
export const OPP_STAGES = ['requirement', 'qualification', 'discovery', 'solution', 'quotation', 'negotiation', 'decision', 'won', 'lost']
export const TASK_STATUS = ['open', 'in_progress', 'done', 'cancelled']
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
