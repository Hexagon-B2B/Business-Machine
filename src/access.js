import { useState, useEffect, useContext, createContext } from 'react'
import { supabase } from './supabase'

export const AuthCtx = createContext(null)

export function useAuth() {
  return useContext(AuthCtx)
}

export async function loadAccess(userId) {
  if (!userId) {
    return { profile: null, isAdmin: false, userId: null, ownedIds: [], watchIds: [], visibleIds: null, loading: false }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('profiles load:', error.message)
    return { profile: null, isAdmin: true, userId, ownedIds: null, watchIds: [], visibleIds: null, loading: false, error: error.message }
  }

  if (!profile) {
    return { profile: null, isAdmin: true, userId, ownedIds: null, watchIds: [], visibleIds: null, loading: false }
  }

  const isAdmin = profile.role === 'admin' && profile.active !== false

  let ownedIds = []
  const { data: ownedRows, error: oErr } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_id', userId)
    .neq('state', 'deleted')
  if (oErr) console.warn('owned companies:', oErr.message)
  else ownedIds = (ownedRows || []).map(r => r.id)

  let watchIds = []
  const { data: watchRows, error: wErr } = await supabase
    .from('company_watchers')
    .select('company_id')
    .eq('user_id', userId)
  if (!wErr && watchRows) watchIds = watchRows.map(r => r.company_id).filter(Boolean)

  let assignIds = []
  const { data: assignRows } = await supabase
    .from('company_assignments')
    .select('company_id')
    .eq('user_id', userId)
  if (assignRows) assignIds = assignRows.map(r => r.company_id).filter(Boolean)

  const visibleSet = new Set([...ownedIds, ...watchIds, ...assignIds])
  const visibleIds = isAdmin ? null : Array.from(visibleSet)

  return { profile, isAdmin, userId, ownedIds, watchIds, assignIds, visibleIds, loading: false }
}

export function useAccessLoader(session) {
  const [access, setAccess] = useState({
    profile: null, isAdmin: true, userId: null, ownedIds: null, watchIds: [], visibleIds: null, loading: true, error: null,
  })

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!session?.user?.id) {
        if (!cancelled) setAccess({ profile: null, isAdmin: false, userId: null, ownedIds: [], watchIds: [], visibleIds: [], loading: false })
        return
      }
      const a = await loadAccess(session.user.id)
      if (!cancelled) setAccess({ ...a, loading: false })
    }
    run()
    return () => { cancelled = true }
  }, [session?.user?.id])

  return [access, setAccess]
}

export function scopeCompanyList(query, access) {
  if (!access || access.isAdmin || access.visibleIds === null) return query
  const ids = access.visibleIds || []
  if (ids.length === 0) return query.eq('id', '00000000-0000-0000-0000-000000000000')
  return query.in('id', ids)
}

export function canViewCompany(access, companyId, companyOwnerId) {
  if (!access) return true
  if (access.isAdmin || access.visibleIds === null) return true
  if (companyOwnerId && companyOwnerId === access.userId) return true
  return (access.visibleIds || []).includes(companyId)
}

/** Only Account Owner creates tasks/meetings/opps. Admin must transfer account to self first. */
export function canCreateActivity(access, companyOwnerId) {
  if (!access?.userId) return false
  if (access.ownedIds === null && access.isAdmin) return true
  if (!companyOwnerId) return !!access.isAdmin
  return companyOwnerId === access.userId
}

export function isOwner(access, companyOwnerId) {
  if (!access?.userId) return false
  if (access.ownedIds === null && access.isAdmin) return true
  return companyOwnerId === access.userId
}

export function scopeByCompanyIds(query, access, column = 'company_id') {
  if (!access || access.isAdmin || access.visibleIds === null) return query
  const ids = access.visibleIds || []
  if (ids.length === 0) return query.eq(column, '00000000-0000-0000-0000-000000000000')
  return query.in(column, ids)
}
