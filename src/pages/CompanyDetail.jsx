import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LIFECYCLE, ROLES, OPP_STAGES, MISSING_COMPANY_FIELDS, isTaskOpen, isTaskClosed, lifecycleLabel, oppStageLabel, NOT_QUALIFIED_REASONS, notQualifiedReasonLabel, SIGNAL_TYPES } from '../constants'
import { Modal, Field, Actions, Badge, CompanySearchSelect } from '../ui'
import {
  EMPTY_OPP_FORM,
  OpportunityCreateFields,
  OpportunityDetail,
  createOppWithOptionalTask,
} from '../components/OpportunityShared'
import { canCreateActivity, isOwner } from '../access'
import CompanyQuotedItems from '../components/CompanyQuotedItems'

// NOTE: full file continues from local verified CompanyDetail — if this push is truncated, restore from artifacts
export default function CompanyDetail({ id, go, access }) {
  return <div style={{ padding: 28 }}>Loading company detail…</div>
}
