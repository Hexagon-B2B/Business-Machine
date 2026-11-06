import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !serviceKey || !anonKey) {
    res.status(501).json({
      error: 'Server not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY on Vercel.',
    })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Invalid session' })
    return
  }

  const admin = createClient(url, serviceKey)
  const { data: profile } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'admin' || profile.active === false) {
    res.status(403).json({ error: 'Only Admin can create team accounts' })
    return
  }

  const { email, password, full_name, role } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanRole = role === 'service' ? 'service' : 'sales'
  if (!cleanEmail || !password || String(password).length < 8) {
    res.status(400).json({ error: 'Email and password (min 8 chars) required' })
    return
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password: String(password),
    email_confirm: true,
    user_metadata: { full_name: full_name || '', role: cleanRole },
  })

  if (createErr) {
    res.status(400).json({ error: createErr.message })
    return
  }

  const userId = created.user.id
  const { error: pErr } = await admin.from('profiles').upsert({
    id: userId,
    email: cleanEmail,
    full_name: (full_name || '').trim() || cleanEmail.split('@')[0],
    role: cleanRole,
    active: true,
    updated_at: new Date().toISOString(),
  })

  if (pErr) {
    res.status(500).json({ error: 'Auth user created but profile failed: ' + pErr.message, userId })
    return
  }

  res.status(200).json({ userId, email: cleanEmail, role: cleanRole })
}
