'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { AuthUser, Concept } from '@/lib/types'

type Filter = 'all' | 'pending' | 'approved' | 'rejected'

interface ConceptWithCreator extends Concept {
  creator_name: string | null
}

export default function ReviewPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [concepts, setConcepts] = useState<ConceptWithCreator[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Concept>>({})
  const [rejectionNote, setRejectionNote] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    const u = getStoredUser()
    setUser(u)
    loadConcepts()
  }, [])

  async function loadConcepts() {
    setLoading(true)
    const { data: conceptData } = await supabase
      .from('concepts')
      .select('*')
      .order('created_at', { ascending: false })

    if (!conceptData) { setLoading(false); return }

    const creatorIds = [...new Set(conceptData.map(c => c.created_by).filter(Boolean))]
    let creatorMap: Record<string, string> = {}
    if (creatorIds.length > 0) {
      const { data: users } = await supabase
        .from('admin_users')
        .select('id, name')
        .in('id', creatorIds)
      if (users) {
        creatorMap = Object.fromEntries(users.map(u => [u.id, u.name]))
      }
    }

    const enriched: ConceptWithCreator[] = conceptData.map(c => ({
      ...c,
      creator_name: c.created_by ? creatorMap[c.created_by] || null : null,
    }))
    setConcepts(enriched)
    setLoading(false)
  }

  const filtered = concepts.filter(c => {
    if (filter === 'pending') return !c.is_verified && !c.needs_work
    if (filter === 'approved') return c.is_verified
    if (filter === 'rejected') return c.needs_work
    return true
  })

  async function approve(concept: ConceptWithCreator) {
    if (!user) return
    setActionLoading(true)
    await supabase
      .from('concepts')
      .update({ is_verified: true, needs_work: false, verified_by: user.id, verified_at: new Date().toISOString() })
      .eq('id', concept.id)
    await supabase.from('review_logs').insert({
      concept_id: concept.id,
      reviewed_by: user.id,
      action: 'approved',
    })
    setExpanded(null)
    loadConcepts()
    setActionLoading(false)
  }

  async function reject(concept: ConceptWithCreator) {
    if (!user || !rejectionNote.trim()) {
      alert('Please enter a rejection note')
      return
    }
    setActionLoading(true)
    await supabase
      .from('concepts')
      .update({ needs_work: true, is_verified: false, rejection_note: rejectionNote })
      .eq('id', concept.id)
    await supabase.from('review_logs').insert({
      concept_id: concept.id,
      reviewed_by: user.id,
      action: 'rejected',
      note: rejectionNote,
    })
    setRejectingId(null)
    setRejectionNote('')
    setExpanded(null)
    loadConcepts()
    setActionLoading(false)
  }

  async function saveEdit(concept: ConceptWithCreator) {
    if (!user) return
    setActionLoading(true)
    await supabase
      .from('concepts')
      .update({ ...editForm, updated_at: new Date().toISOString() })
      .eq('id', concept.id)
    await supabase.from('review_logs').insert({
      concept_id: concept.id,
      reviewed_by: user.id,
      action: 'edited',
    })
    setEditingId(null)
    setEditForm({})
    loadConcepts()
    setActionLoading(false)
  }

  const filterCounts = {
    all: concepts.length,
    pending: concepts.filter(c => !c.is_verified && !c.needs_work).length,
    approved: concepts.filter(c => c.is_verified).length,
    rejected: concepts.filter(c => c.needs_work).length,
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            Review Queue
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Review and approve intern-submitted concepts
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {(['all', 'pending', 'approved', 'rejected'] as Filter[]).map(f => (
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
              {f.charAt(0).toUpperCase() + f.slice(1)}{' '}
              <span
                className="ml-1 text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: filter === f ? 'rgba(255,255,255,0.25)' : '#f0f0ec',
                  color: filter === f ? 'white' : 'var(--muted)',
                }}
              >
                {filterCounts[f]}
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
            {filtered.map(concept => {
              const isExpanded = expanded === concept.id
              const isEditing = editingId === concept.id
              const isRejecting = rejectingId === concept.id
              const opts = concept.check_options as string[] | null

              return (
                <div
                  key={concept.id}
                  className="rounded-xl shadow-sm overflow-hidden"
                  style={{ background: 'var(--surface)' }}
                >
                  {/* Card header */}
                  <div
                    className="flex items-start gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : concept.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--primary)', color: 'white' }}
                        >
                          Ch {concept.chapter_number} › {concept.sub_chapter_id} › P{concept.book_page}
                        </span>
                        <ConceptStatusBadge concept={concept} />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {concept.concept_title || 'Untitled concept'}
                      </p>
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--muted)' }}>
                        {concept.text.slice(0, 100)}{concept.text.length > 100 ? '...' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {concept.creator_name && (
                        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                          {concept.creator_name}
                        </p>
                      )}
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        {new Date(concept.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-gray-400 text-xs shrink-0 mt-1">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      {isEditing ? (
                        <EditForm
                          concept={concept}
                          editForm={editForm}
                          setEditForm={setEditForm}
                          onSave={() => saveEdit(concept)}
                          onCancel={() => { setEditingId(null); setEditForm({}) }}
                          loading={actionLoading}
                        />
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <Field label="ICMAI Text" value={concept.text} multiline />
                            <Field label="Tenglish" value={concept.tenglish} multiline />
                            {concept.check_question && (
                              <Field label="Check Question" value={concept.check_question} multiline />
                            )}
                            {opts && (
                              <div>
                                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Options</p>
                                <div className="space-y-1">
                                  {opts.map((opt, i) => (
                                    <p
                                      key={i}
                                      className="text-sm"
                                      style={{
                                        color: concept.check_answer === i ? '#16a34a' : 'var(--text)',
                                        fontWeight: concept.check_answer === i ? 600 : 400,
                                      }}
                                    >
                                      {['A', 'B', 'C', 'D'][i]}. {opt}
                                      {concept.check_answer === i && ' ✓'}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                            {concept.is_key_concept && concept.kitty_question && (
                              <Field label="Kitty's Question" value={concept.kitty_question} multiline />
                            )}
                            {concept.needs_work && concept.rejection_note && (
                              <div className="col-span-2">
                                <Field label="Rejection Note" value={concept.rejection_note} multiline />
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                            {!concept.is_verified && (
                              <button
                                onClick={() => approve(concept)}
                                disabled={actionLoading}
                                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
                                style={{ background: '#16a34a' }}
                              >
                                ✅ Approve
                              </button>
                            )}
                            {!concept.needs_work && (
                              <button
                                onClick={() => setRejectingId(isRejecting ? null : concept.id)}
                                className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer"
                                style={{ background: '#dc2626' }}
                              >
                                ❌ Reject
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const opts = concept.check_options as string[] | null
                                setEditForm({
                                  concept_title: concept.concept_title || '',
                                  text: concept.text,
                                  tenglish: concept.tenglish || '',
                                  check_question: concept.check_question || '',
                                  check_options: opts,
                                  check_answer: concept.check_answer,
                                  check_explanation: concept.check_explanation || '',
                                })
                                setEditingId(concept.id)
                              }}
                              className="rounded-lg px-4 py-2 text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                              style={{ color: 'var(--text)' }}
                            >
                              ✏️ Edit
                            </button>
                          </div>

                          {/* Rejection note input */}
                          {isRejecting && (
                            <div className="mt-3 space-y-2">
                              <textarea
                                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                                rows={2}
                                value={rejectionNote}
                                onChange={e => setRejectionNote(e.target.value)}
                                placeholder="Explain what needs to be fixed..."
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => reject(concept)}
                                  disabled={actionLoading || !rejectionNote.trim()}
                                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
                                  style={{ background: '#dc2626' }}
                                >
                                  Confirm Reject
                                </button>
                                <button
                                  onClick={() => { setRejectingId(null); setRejectionNote('') }}
                                  className="rounded-lg px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50 cursor-pointer"
                                  style={{ color: 'var(--text)' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>{label}</p>
      {multiline ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
          {value}
        </p>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text)' }}>{value}</p>
      )}
    </div>
  )
}

function ConceptStatusBadge({ concept }: { concept: Concept }) {
  if (concept.is_verified) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">verified</span>
  }
  if (concept.needs_work) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">needs work</span>
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">pending</span>
}

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
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all'
  const opts = editForm.check_options as string[] | null || ['', '', '', '']

  return (
    <div className="mt-4 space-y-3">
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
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Tenglish</label>
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
      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--accent)' }}
        >
          Save Changes
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
  )
}
