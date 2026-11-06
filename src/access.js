import { useState, useEffect, useContext, createContext } from 'react'
import { supabase } from './supabase'

export const AuthCtx = createContext(null)

export function useAuth() {
  return useContext(AuthCtx)
}

/** Load profile + assignment set for the signed-in user. */
export async function loadAccess(userId) {
  if (!userId) {
    return { profile: null, isAdmin: false, assignedIds: null, loading: false }
  }
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('profiles load:', error.message)
    // Table missing or RLS — treat as admin so sole operator is not locked out
    return {
      profile: null,
      isAdmin: true,
      assignedIds: null,
      loading: false,
      error: error.message,
    }
  }

  if (!profile) {
    // No row yet (SQL not run): sole operator stays unrestricted
    return { profile: null, isAdmin: true, assignedIds: null, loading: false }
  }

  const isAdmin = profile.role === 'admin' && profile.active !== false
  if (isAdmin) {
    return { profile, isAdmin: true, assignedIds: null, loading: false }
  }

  const { data: rows } = await supabase
    .from('company_assignments')
    .select('company_id')
    .eq('user_id', userId)

  const assignedIds = (rows || []).map(r => r.company_id).filter(Boolean)
  return { profile, isAdmin: false, assignedIds, loading: false }
}

export function useAccessLoader(session) {
  const [access, setAccess] = useState({
    profile: null,
    isAdmin: true,
    assignedIds: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setAccess({ profile: null, isAdmin: false, assignedIds: [], loading: false })
        }
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

/** Apply company scope to a Supabase query builder when user is not admin. */
export function scopeCompanies(query, access, column = 'company_id') {
  if (!access || access.isAdmin || access.assignedIds === null) return query
  const ids = access.assignedIds || []
  if (ids.length === 0) {
    return query.eq(column, '00000000-0000-0000-0000-000000000000')
  }
  return query.in(column, ids)
}

export function canAccessCompany(access, companyId) {
  if (!access) return true
  if (access.isAdmin || access.assignedIds === null) return true
  return (access.assignedIds || []).includes(companyId)
}
