'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredUser } from '@/lib/auth'
import { AuthUser } from '@/lib/types'

const SAMPLE_JSON = `[
  {
    "paper": 1, "chapter": 1, "sub_chapter": "1.1", "book_page": 3,
    "concept_title": "Sources of Law",
    "text": "Law is derived from multiple sources including legislation, custom, judicial decisions, and equity.",
    "is_key_concept": true
  },
  {
    "paper": 1, "chapter": 1, "sub_chapter": "1.1", "book_page": 3,
    "concept_title": "Custom as Source",
    "text": "Custom refers to long-established practices that have acquired the force of law.",
    "is_key_concept": false
  }
]`

interface ImportResult { success: boolean; inserted: number; failed: number; total: number; pages_created: number; errors?: string[]; error?: string; details?: string[] }

export default function ImportPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [parsed, setParsed] = useState<Record<string, unknown>[] | null>(null)
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    const u = getStoredUser()
    if (!u || u.role !== 'admin') { router.replace('/dashboard'); return }
    setUser(u)
  }, [router])

  function handleParse() {
    setParseError(''); setParsed(null); setResult(null)
    if (!jsonText.trim()) { setParseError('Paste your JSON first'); return }
    try {
      const data = JSON.parse(jsonText)
      if (!Array.isArray(data)) { setParseError('JSON must be an array'); return }
      if (data.length === 0) { setParseError('Array is empty'); return }
      const missing: string[] = []
      data.forEach((item: Record<string, unknown>, i: number) => {
        if (!item.text) missing.push(`Row ${i+1}: missing "text"`)
        if (!item.book_page) missing.push(`Row ${i+1}: missing "book_page"`)
        if (!(item.paper || item.paper_number)) missing.push(`Row ${i+1}: missing "paper"`)
        if (!(item.chapter || item.chapter_number)) missing.push(`Row ${i+1}: missing "chapter"`)
        if (!(item.sub_chapter || item.sub_chapter_id)) missing.push(`Row ${i+1}: missing "sub_chapter"`)
      })
      if (missing.length > 0) { setParseError(missing.slice(0, 10).join('\n') + (missing.length > 10 ? `\n...+${missing.length - 10} more` : '')); return }
      setParsed(data)
    } catch (e) { setParseError(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`) }
  }

  async function handleImport() {
    if (!parsed || !user) return
    setImporting(true); setResult(null)
    try {
      const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concepts: parsed, created_by: user.id, course_id: 'cma' }) })
      const data = await res.json()
      setResult(data)
      if (data.success) setParsed(null)
    } catch (e) { setResult({ success: false, inserted: 0, failed: parsed.length, total: parsed.length, pages_created: 0, error: e instanceof Error ? e.message : 'Network error' }) }
    finally { setImporting(false) }
  }

  const grouped = parsed
    ? parsed.reduce<Record<string, Record<string, unknown>[]>>((acc, item) => {
        const ch = `P${item.paper ?? item.paper_number} Ch${item.chapter ?? item.chapter_number}`
        ;(acc[ch] ??= []).push(item)
        return acc
      }, {})
    : null

  if (!user) return null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>📥 Bulk JSON Import</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Paste JSON array of concepts to import into the database</p>
        </div>

        {result && (
          <div className="rounded-xl p-4 mb-5" style={{ background: result.success ? '#ecfdf5' : '#fef2f2', border: `1px solid ${result.success ? '#a7f3d0' : '#fecaca'}` }}>
            {result.success ? (<><p className="font-bold text-green-800">✅ Import Complete</p><p className="text-sm text-green-700 mt-1">{result.inserted} concepts inserted across {result.pages_created} pages.</p></>) : (<><p className="font-bold text-red-800">❌ Import Failed</p><p className="text-sm text-red-700 mt-1">{result.error}</p>{result.details && <div className="mt-2 text-xs text-red-600 max-h-40 overflow-y-auto">{result.details.map((e, i) => <p key={i}>{e}</p>)}</div>}</>)}
          </div>
        )}

        <div className="rounded-xl shadow-sm p-5 mb-5" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Paste JSON Array</label>
            <button onClick={() => { setJsonText(SAMPLE_JSON); setParsed(null); setResult(null) }} className="text-xs px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer" style={{ color: 'var(--accent)' }}>Load Sample</button>
          </div>
          <textarea value={jsonText} onChange={e => { setJsonText(e.target.value); setParsed(null); setResult(null); setParseError('') }} placeholder={'[\n  { "paper": 1, "chapter": 1, "sub_chapter": "1.1",\n    "book_page": 3, "concept_title": "...", "text": "..." }\n]'} rows={14} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all resize-none" style={{ fontFamily: 'monospace', color: 'var(--text)', fontSize: 12 }} />
          {parseError && <div className="mt-3 rounded-lg px-3 py-2 text-xs whitespace-pre-wrap" style={{ background: '#fef2f2', color: '#dc2626' }}>{parseError}</div>}
          <div className="flex gap-3 mt-4">
            <button onClick={handleParse} disabled={!jsonText.trim()} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer" style={{ background: 'var(--primary)' }}>🔍 Validate &amp; Preview</button>
            <button onClick={() => { setJsonText(''); setParsed(null); setResult(null); setParseError('') }} className="rounded-lg px-4 py-2.5 text-sm border border-gray-200 hover:bg-gray-50 cursor-pointer" style={{ color: 'var(--text)' }}>Clear</button>
          </div>
        </div>

        {parsed && grouped && (
          <div className="rounded-xl shadow-sm p-5 mb-5" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Preview: {parsed.length} concepts</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>All import as <strong>draft</strong></p>
              </div>
              <button onClick={handleImport} disabled={importing} className="rounded-lg px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60 cursor-pointer" style={{ background: 'var(--accent)' }}>
                {importing ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Importing...</span> : `📥 Import ${parsed.length} Concepts`}
              </button>
            </div>
            {Object.entries(grouped).map(([ch, items]) => (
              <div key={ch} className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>{ch} — {items.length} concepts</p>
                {items.map((item, i) => (
                  <div key={i} className="rounded-lg p-3 mb-1 flex items-start gap-3" style={{ background: '#f9fafb', border: '1px solid #f0f0ec' }}>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--primary)', color: 'white' }}>p{String(item.book_page)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{String(item.concept_title || 'Untitled')}</p>
                      <p className="text-xs line-clamp-2 mt-0.5" style={{ color: 'var(--muted)' }}>{String(item.text || '')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl shadow-sm p-5" style={{ background: 'var(--surface)' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>JSON Format Reference</h3>
          <div className="text-xs space-y-1" style={{ color: 'var(--muted)' }}>
            <p><strong style={{ color: 'var(--text)' }}>Required:</strong> paper, chapter, sub_chapter, book_page, text</p>
            <p><strong style={{ color: 'var(--text)' }}>Optional:</strong> concept_title, heading, content_type, is_key_concept, order_index</p>
            <p className="mt-2">→ Missing content_pages are auto-created</p>
            <p>→ All import as draft — use Generate Queue to run SOMI Engine</p>
          </div>
        </div>
      </div>
    </div>
  )
}
