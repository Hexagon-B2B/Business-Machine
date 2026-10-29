import { useState, useEffect } from 'react'
import { PageHead, Field } from '../ui'

const STORAGE_KEY = 'hexagon_project_links'

const DEFAULT_LINKS = [
  { id: 'github', label: 'GitHub repo', url: 'https://github.com/Hexagon-B2B/Business-Machine' },
  { id: 'live', label: 'Live app', url: 'https://hexagon-b2b-os.vercel.app' },
]

function loadLinks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LINKS.map(l => ({ ...l }))
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length) return parsed
  } catch {}
  return DEFAULT_LINKS.map(l => ({ ...l }))
}

function saveLinks(links) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
}

export default function Settings() {
  const [links, setLinks] = useState(() => loadLinks())
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setLinks(loadLinks())
  }, [])

  function flash(m) {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  function addLink(e) {
    e.preventDefault()
    const l = label.trim()
    let u = url.trim()
    if (!l || !u) { flash('Label and URL are required.'); return }
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    const next = [...links, { id: 'custom_' + Date.now(), label: l, url: u }]
    setLinks(next)
    saveLinks(next)
    setLabel('')
    setUrl('')
    flash('Link added.')
  }

  function removeLink(id) {
    const next = links.filter(x => x.id !== id)
    setLinks(next)
    saveLinks(next)
    flash('Link removed.')
  }

  function resetDefaults() {
    const next = DEFAULT_LINKS.map(l => ({ ...l }))
    setLinks(next)
    saveLinks(next)
    flash('Reset to defaults.')
  }

  return (
    <div style={{ padding: 28 }}>
      <PageHead
        eyebrow="Workspace"
        title="Settings"
        subtitle="Project links and preferences. Links are saved in this browser (you can add the Grok project link and any others)."
      />

      {msg && (
        <div className="notice" style={{ marginBottom: 12, background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
          {msg}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>Project links</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
          Open external resources from here. Add your own (Grok chat project, Supabase, docs, etc.).
        </p>

        {links.length === 0 ? (
          <div className="empty" style={{ padding: 12 }}>No links yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
            {links.map(link => (
              <li key={link.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '10px 0', borderBottom: '1px solid #f1f5f9', minHeight: 48,
              }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{link.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', wordBreak: 'break-all' }}>{link.url}</div>
                </div>
                <a className="btn primary" href={link.url} target="_blank" rel="noreferrer" style={{ minHeight: 44 }}>Open</a>
                <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => removeLink(link.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addLink}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Label">
              <input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Grok project" />
            </Field>
            <Field label="URL">
              <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" className="btn primary">Add link</button>
            <button type="button" className="btn" onClick={resetDefaults}>Reset defaults</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>About this workspace</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          Hexagon B2B Sales & Business OS — sole-operator POC. Trigger criteria remain under Action Centre → Trigger criteria.
        </p>
      </div>
    </div>
  )
}
