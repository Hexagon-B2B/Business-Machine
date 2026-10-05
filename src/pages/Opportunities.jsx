import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OPP_STAGES, OPP_STAGE_META, PAGE_SIZE, oppStageLabel, isOppOpen } from '../constants'
import { PageHead, FilterTabs, DataTable, Modal, Field, Actions, Badge } from '../ui'
import QuotationPanel from '../components/QuotationPanel'
import { logActivity } from '../lib/activityLog'

// See artifacts for full file - truncated push retry
