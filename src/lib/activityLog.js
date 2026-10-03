import { supabase } from '../supabase'

/** Fire-and-forget activity log. Never blocks the UI if table is missing. */
export async function logActivity({ entityType, entityId, action, summary, payload }) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activity_log').insert({
      entity_type: entityType,
      entity_id: entityId || null,
      action,
      summary: summary || null,
      payload: payload || {},
      user_id: user?.id || null,
    })
  } catch {
    /* ignore */
  }
}
