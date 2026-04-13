'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { incrementActivity } from '@/lib/concept-locks'
import type { AuthUser, Concept } from '@/lib/types'

const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

type Filter = 'all' | 'submitted' | 'pending' | 'approved' | 'rejected'

interface ConceptRow extends Concept {
  creator_name: string | null
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ concept }: { concept: Concept }) {
  if (concept.is_verified)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Approved</span>
  if (concept.needs_work)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Rejected</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pending</span>
}

// ─── Section Block (always expanded) ─────────────────────────────────────────
function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          {title}
        </span>
      </div>
      <div className="p-3 bg-white">{children}</div>
    </div>
  )
}

// ─── Concept Card ─────────────────────────────────────────────────────────────
function ConceptCard({
  concept,
  isExpanded,
  pdfUrl,
  user,
  onToggle,
  onApprove,
  onRejectConfirm,
  actionLoading,
  onReloadConcepts,
  pdfOpen,
  setPdfOpen,
}: {
  concept: ConceptRow
  isExpanded: boolean
  pdfUrl: string | undefined
  user: AuthUser | null
  onToggle: () => void
  onApprove: () => void
  onRejectConfirm: (note: string) => void
  actionLoading: boolean
  onReloadConcepts: () => void
  pdfOpen: boolean
  setPdfOpen: (v: boolean) => void
}) {
  const [activeVariation, setActiveVariation] = useState<1 | 2 | 3>(1)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionNote, setRejectionNote] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Concept>>({})
  const [editLoading, setEditLoading] = useState(false)

  const opts = concept.check_options as string[] | null
  const tenglishV1 = concept.tenglish || ''
  const tenglishV2 = concept.tenglish_variation_2 || ''
  const tenglishV3 = concept.tenglish_variation_3 || ''
  const activeText = activeVariation === 1 ? tenglishV1 : activeVariation === 2 ? tenglishV2 : tenglishV3

  function startEdit() {
    setEditForm({
      concept_title: concept.concept_title || '',
      text: concept.text,
      tenglish: concept.tenglish || '',
      check_question: concept.check_question || '',
      check_options: opts ? [...opts] : ['', '', '', ''],
      check_answer: concept.check_answer ?? 0,
      check_explanation: concept.check_explanation || '',
    })
    setIsEditing(true)
  }

  async function saveEdit() {
    if (!user) return
    setEditLoading(true)
    await supabase
      .from('concepts')
      .update({ ...editForm, updated_at: new Date().toISOString() })
      .eq('id', concept.id)
    await supabase.from('review_logs').insert({
      concept_id: concept.id,
      reviewed_by: user.id,
      action: 'edited',
    })
    setIsEditing(false)
    setEditForm({})
    setEditLoading(false)
    onReloadConcepts()
  }

  function handleRejectClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isExpanded) onToggle()
    setRejectOpen(true)
  }

  function handleEditClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isExpanded) onToggle()
    startEdit()
  }

  return (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: 'var(--surface)' }}>
      {/* ── Card Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: 'var(--primary)', color: 'white' }}
            >
              Ch {concept.chapter_number} › {concept.sub_chapter_id} › Page {concept.book_page}
            </span>
            <StatusBadge concept={concept} />
          </div>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
            {concept.concept_title || 'Untitled concept'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {concept.creator_name ? `${concept.creator_name} · ` : ''}
            {new Date(concept.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          {!concept.is_verified && (
            <button
              onClick={e => { e.stopPropagation(); onApprove() }}
              disabled={actionLoading}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
              style={{ background: '#16a34a' }}
            >
              ✅ Approve
            </button>
          )}
          {!concept.needs_work && (
            <button
              onClick={handleRejectClick}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              style={{ background: '#dc2626' }}
            >
              ❌ Reject
            </button>
          )}
          <button
            onClick={handleEditClick}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
            style={{ color: 'var(--text)' }}
          >
            ✏️ Edit
          </button>
        </div>
        <span className="text-gray-400 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
      </div>

      {/* ── Expanded Body ── */}
      {isExpanded && (
        <div className="border-t border-gray-100">
          {isEditing ? (
            <div className="p-4">
              <EditForm
                concept={concept}
                editForm={editForm}
                setEditForm={setEditForm}
                onSave={saveEdit}
                onCancel={() => { setIsEditing(false); setEditForm({}) }}
                loading={editLoading}
              />
            </div>
          ) : (
            <div className="flex" style={{ minHeight: 580 }}>
              {/* ── Middle Content — flex-1 ── */}
              <div className="overflow-y-auto p-4 space-y-2.5 flex-1">

                {/* 1. ICMAI TEXT */}
                <SectionBlock title="ICMAI Text">
                  <textarea
                    readOnly
                    className="w-full text-sm leading-relaxed resize-none border-0 outline-none"
                    style={{ color: 'var(--text)', background: 'transparent', fontFamily: 'inherit' }}
                    rows={8}
                    value={concept.text}
                  />
                </SectionBlock>

                {/* 2. MAMA'S TENGLISH — V1/V2/V3 tabs */}
                <SectionBlock title="Mama's Tenglish">
                  <div className="flex gap-1 mb-3">
                    {([1, 2, 3] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setActiveVariation(v)}
                        className="px-3 py-1 rounded text-xs font-bold cursor-pointer transition-all"
                        style={{
                          background: activeVariation === v ? 'var(--accent)' : '#f3f4f6',
                          color: activeVariation === v ? 'white' : 'var(--muted)',
                        }}
                      >
                        V{v}
                      </button>
                    ))}
                  </div>
                  <textarea
                    readOnly
                    className="w-full text-sm leading-relaxed resize-none border-0 outline-none"
                    style={{ color: 'var(--text)', background: 'transparent', fontFamily: 'inherit' }}
                    rows={8}
                    value={activeText || '—'}
                  />
                </SectionBlock>

                {/* 3. KITTY INTERACTION */}
                {concept.is_key_concept && (concept.kitty_question || concept.mama_kitty_answer) && (
                  <SectionBlock title="Kitty Interaction">
                    {concept.kitty_question && (
                      <div className="mb-3">
                        <p className="text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Kitty's Question</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{concept.kitty_question}</p>
                      </div>
                    )}
                    {concept.mama_kitty_answer && (
                      <div>
                        <p className="text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Mama's Answer</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{concept.mama_kitty_answer}</p>
                      </div>
                    )}
                  </SectionBlock>
                )}

                {/* 4. CHECK QUESTION */}
                {concept.check_question && (
                  <SectionBlock title="Check Question">
                    <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
                      {concept.check_question}
                    </p>
                    {opts && (
                      <div className="space-y-2 mb-3">
                        {opts.map((opt, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2.5 rounded-lg px-3 py-2"
                            style={{
                              background: concept.check_answer === i ? '#f0fdf4' : '#f9fafb',
                              border: `1px solid ${concept.check_answer === i ? '#bbf7d0' : '#e5e7eb'}`,
                            }}
                          >
                            <span
                              className="text-xs font-bold shrink-0 mt-0.5 w-4"
                              style={{ color: concept.check_answer === i ? '#16a34a' : '#9ca3af' }}
                            >
                              {['A', 'B', 'C', 'D'][i]}
                            </span>
                            <span
                              className="text-sm"
                              style={{
                                color: concept.check_answer === i ? '#15803d' : 'var(--text)',
                                fontWeight: concept.check_answer === i ? 600 : 400,
                              }}
                            >
                              {opt}{concept.check_answer === i && ' ✓'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {concept.check_explanation && (
                      <div className="rounded-lg p-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <p className="text-xs font-bold mb-1" style={{ color: '#2563eb' }}>Explanation</p>
                        <p className="text-sm" style={{ color: '#1e40af' }}>{concept.check_explanation}</p>
                      </div>
                    )}
                  </SectionBlock>
                )}

                {/* 5. MAMA RESPONSES */}
                {(concept.mama_response_correct || concept.mama_response_wrong) && (
                  <SectionBlock title="Mama Responses">
                    <div className="grid grid-cols-2 gap-3">
                      {concept.mama_response_correct && (
                        <div className="rounded-lg p-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                          <p className="text-xs font-bold mb-1.5" style={{ color: '#16a34a' }}>✅ Correct</p>
                          <p className="text-sm" style={{ color: '#14532d' }}>{concept.mama_response_correct}</p>
                        </div>
                      )}
                      {concept.mama_response_wrong && (
                        <div className="rounded-lg p-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                          <p className="text-xs font-bold mb-1.5" style={{ color: '#dc2626' }}>❌ Wrong</p>
                          <p className="text-sm" style={{ color: '#7f1d1d' }}>{concept.mama_response_wrong}</p>
                        </div>
                      )}
                    </div>
                  </SectionBlock>
                )}

                {/* Previous rejection note */}
                {concept.needs_work && concept.rejection_note && (
                  <div className="rounded-lg p-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <p className="text-xs font-bold mb-1" style={{ color: '#dc2626' }}>Previous Rejection Note</p>
                    <p className="text-sm" style={{ color: '#7f1d1d' }}>{concept.rejection_note}</p>
                  </div>
                )}

                {/* Inline reject form */}
                {rejectOpen && (
                  <div className="rounded-lg p-3 space-y-2" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <p className="text-xs font-bold" style={{ color: '#dc2626' }}>Rejection Reason</p>
                    <textarea
                      className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                      style={{ background: 'white' }}
                      rows={3}
                      value={rejectionNote}
                      onChange={e => setRejectionNote(e.target.value)}
                      placeholder="Explain what needs to be fixed..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onRejectConfirm(rejectionNote)
                          setRejectOpen(false)
                          setRejectionNote('')
                        }}
                        disabled={actionLoading || !rejectionNote.trim()}
                        className="rounded-lg px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                        style={{ background: '#dc2626' }}
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => { setRejectOpen(false); setRejectionNote('') }}
                        className="rounded-lg px-4 py-1.5 text-xs border border-gray-200 hover:bg-gray-50 cursor-pointer"
                        style={{ color: 'var(--text)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── PDF Pane — independently collapsible ── */}
              <div
                style={{
                  width: pdfOpen ? 420 : 32,
                  transition: 'width 0.3s ease',
                  overflow: 'hidden',
                  flexShrink: 0,
                  borderLeft: '1px solid #e5e7eb',
                }}
              >
                {!pdfOpen ? (
                  <div
                    style={{
                      width: 32,
                      height: '100%',
                      background: '#f5f5f5',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      paddingTop: 16,
                      gap: 8,
                      cursor: 'pointer',
                    }}
                    onClick={() => setPdfOpen(true)}
                  >
                    <span style={{ fontSize: 18 }}>📄</span>
                    <span style={{
                      writingMode: 'vertical-rl',
                      fontSize: 11,
                      color: '#9ca3af',
                      transform: 'rotate(180deg)',
                    }}>Open PDF</span>
                    <span style={{ color: '#9ca3af' }}>▶</span>
                  </div>
                ) : (
                  <div style={{ width: 420, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      <button
                        onClick={() => setPdfOpen(false)}
                        style={{
                          fontSize: 12,
                          color: '#6b7280',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          background: 'none',
                          border: 'none',
                          padding: 0,
                        }}
                      >
                        ◀ Close PDF
                      </button>
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <PDFViewer bookPage={concept.book_page} pdfUrl={pdfUrl} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReviewPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [concepts, setConcepts] = useState<ConceptRow[]>([])
  const [filter, setFilter] = useState<Filter>('submitted')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [paperUrls, setPaperUrls] = useState<Record<string, string>>({})
  const [pdfOpen, setPdfOpen] = useState(false)

  useEffect(() => {
    setUser(getStoredUser())
    loadConcepts()
  }, [])

  async function loadConcepts() {
    setLoading(true)
    const { data: conceptData } = await supabase
      .from('concepts')
      .select('*')
      .order('created_at', { ascending: false })

    if (!conceptData) { setLoading(false); return }

    // Creator names
    const creatorIds = [...new Set(conceptData.map(c => c.created_by).filter(Boolean))]
    let creatorMap: Record<string, string> = {}
    if (creatorIds.length) {
      const { data: users } = await supabase.from('admin_users').select('id, name').in('id', creatorIds)
      if (users) creatorMap = Object.fromEntries(users.map(u => [u.id, u.name]))
    }

    // Paper PDF URLs (course_id + paper_number → pdf_url)
    const courseIds = [...new Set(conceptData.map(c => c.course_id).filter(Boolean))]
    if (courseIds.length) {
      const { data: papers } = await supabase
        .from('papers')
        .select('course_id, paper_number, pdf_url')
        .in('course_id', courseIds)
      if (papers) {
        const urlMap: Record<string, string> = {}
        for (const p of papers) {
          if (p.pdf_url) urlMap[`${p.course_id}|${p.paper_number}`] = p.pdf_url
        }
        setPaperUrls(urlMap)
      }
    }

    setConcepts(conceptData.map(c => ({
      ...c,
      creator_name: c.created_by ? creatorMap[c.created_by] || null : null,
    })))
    setLoading(false)
  }

  async function approve(concept: ConceptRow) {
    if (!user) return
    setActionLoading(true)
    await supabase.from('concepts').update({
      is_verified: true,
      needs_work: false,
      review_status: 'approved',
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    }).eq('id', concept.id)
    await supabase.from('review_logs').insert({ concept_id: concept.id, reviewed_by: user.id, action: 'approved' })
    await incrementActivity(user.id, 'concepts_approved')
    setExpanded(null)
    await loadConcepts()
    setActionLoading(false)
  }

  async function reject(concept: ConceptRow, note: string) {
    if (!user || !note.trim()) { alert('Please enter a rejection note'); return }
    setActionLoading(true)
    await supabase.from('concepts').update({
      needs_work: true,
      is_verified: false,
      review_status: 'rejected',
      rejection_note: note,
    }).eq('id', concept.id)
    await supabase.from('review_logs').insert({ concept_id: concept.id, reviewed_by: user.id, action: 'rejected', note })
    await incrementActivity(user.id, 'concepts_rejected')
    setExpanded(null)
    await loadConcepts()
    setActionLoading(false)
  }

  const filtered = concepts.filter(c => {
    if (filter === 'submitted') return c.review_status === 'submitted' || (!c.is_verified && !c.needs_work && !c.review_status)
    if (filter === 'pending') return !c.is_verified && !c.needs_work && (!c.review_status || c.review_status === 'draft')
    if (filter === 'approved') return c.is_verified
    if (filter === 'rejected') return c.needs_work
    return true
  })

  const counts = {
    all: concepts.length,
    submitted: concepts.filter(c => c.review_status === 'submitted' || (!c.is_verified && !c.needs_work && !c.review_status)).length,
    pending: concepts.filter(c => !c.is_verified && !c.needs_work && (!c.review_status || c.review_status === 'draft')).length,
    approved: concepts.filter(c => c.is_verified).length,
    rejected: concepts.filter(c => c.needs_work).length,
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-full mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Review Queue</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Review and approve intern-submitted concepts
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {(['all', 'submitted', 'pending', 'approved', 'rejected'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-all cursor-pointer"
              style={{
                background: filter === f ? 'var(--accent)' : 'var(--surface)',
                color: filter === f ? 'white' : 'var(--text)',
                border: filter === f ? 'none' : '1px solid #e5e7eb',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span
                className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: filter === f ? 'rgba(255,255,255,0.25)' : '#f0f0ec',
                  color: filter === f ? 'white' : 'var(--muted)',
                }}
              >
                {counts[f]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center"
            style={{ background: 'var(--surface)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
              No concepts in this category
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(concept => (
              <ConceptCard
                key={concept.id}
                concept={concept}
                isExpanded={expanded === concept.id}
                pdfUrl={paperUrls[`${concept.course_id}|${concept.paper_number}`]}
                user={user}
                onToggle={() => setExpanded(expanded === concept.id ? null : concept.id)}
                onApprove={() => approve(concept)}
                onRejectConfirm={note => reject(concept, note)}
                actionLoading={actionLoading}
                onReloadConcepts={loadConcepts}
                pdfOpen={pdfOpen}
                setPdfOpen={setPdfOpen}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Edit Form ────────────────────────────────────────────────────────────────
function EditForm({
  concept,
  editForm,
  setEditForm,
  onSave,
  onCancel,
  loading,
}: {
  concept: Concept
  editForm: Partial<Concept>
  setEditForm: React.Dispatch<React.SetStateAction<Partial<Concept>>>
  onSave: () => void
  onCancel: () => void
  loading: boolean
}) {
  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all'
  const opts = (editForm.check_options as string[]) || ['', '', '', '']

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>
          Edit: {concept.concept_title || 'Untitled concept'}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50 cursor-pointer"
            style={{ color: 'var(--text)' }}
          >
            Cancel
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Concept Title</label>
        <input
          className={inputCls}
          value={(editForm.concept_title as string) || ''}
          onChange={e => setEditForm(p => ({ ...p, concept_title: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>ICMAI Text</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={4}
          value={(editForm.text as string) || ''}
          onChange={e => setEditForm(p => ({ ...p, text: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Tenglish (V1)</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={4}
          value={(editForm.tenglish as string) || ''}
          onChange={e => setEditForm(p => ({ ...p, tenglish: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Check Question</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={(editForm.check_question as string) || ''}
          onChange={e => setEditForm(p => ({ ...p, check_question: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {opts.map((opt, i) => (
          <div key={i}>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
              Option {['A', 'B', 'C', 'D'][i]}
            </label>
            <input
              className={inputCls}
              value={opt}
              onChange={e => {
                const newOpts = [...opts]
                newOpts[i] = e.target.value
                setEditForm(p => ({ ...p, check_options: newOpts }))
              }}
            />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Explanation</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={(editForm.check_explanation as string) || ''}
          onChange={e => setEditForm(p => ({ ...p, check_explanation: e.target.value }))}
        />
      </div>
    </div>
  )
}
