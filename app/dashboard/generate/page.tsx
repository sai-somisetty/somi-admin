'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { incrementActivity } from '@/lib/concept-locks'
import type { AuthUser, Concept } from '@/lib/types'

interface ChapterGroup {
  paper_number: number
  chapter_number: number
  chapter_title: string
  total: number
  ungenerated: number
  concepts: Concept[]
}

type GenStatus = 'idle' | 'running' | 'done' | 'error'

interface ConceptGenState {
  id: string
  status: GenStatus
  error?: string
}

export default function GenerateQueuePage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [groups, setGroups] = useState<ChapterGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [genStates, setGenStates] = useState<Map<string, ConceptGenState>>(new Map())
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const abortRef = useRef(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: concepts }, { data: chapters }] = await Promise.all([
      supabase.from('concepts').select('*').eq('course_id', 'cma').order('paper_number').order('chapter_number').order('order_index'),
      supabase.from('chapters').select('paper_number, chapter_number, title').eq('course_id', 'cma').order('chapter_number'),
    ])

    if (!concepts || !chapters) { setLoading(false); return }

    const chapterMap = new Map(chapters.map(ch => [`${ch.paper_number}-${ch.chapter_number}`, ch.title]))

    const groupMap = new Map<string, ChapterGroup>()
    for (const c of concepts as Concept[]) {
      const key = `${c.paper_number}-${c.chapter_number}`
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          paper_number: c.paper_number,
          chapter_number: c.chapter_number,
          chapter_title: chapterMap.get(key) || `Chapter ${c.chapter_number}`,
          total: 0,
          ungenerated: 0,
          concepts: [],
        })
      }
      const g = groupMap.get(key)!
      g.total++
      if (!c.tenglish) {
        g.ungenerated++
        g.concepts.push(c)
      }
    }

    setGroups(Array.from(groupMap.values()).filter(g => g.ungenerated > 0))
    setLoading(false)
  }, [])

  useEffect(() => {
    const u = getStoredUser()
    setUser(u)
    loadData()
  }, [loadData])

  async function generateOne(concept: Concept): Promise<boolean> {
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          icmai_text: concept.text,
          concept_title: concept.concept_title || '',
          chapter: `${concept.chapter_number}`,
          sub_chapter: concept.sub_chapter_id,
        }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const data = await res.json()

      // Save to DB
      const { error } = await supabase.from('concepts').update({
        english: data.english || null,
        english_variation_2: data.english_variation_2 || null,
        english_variation_3: data.english_variation_3 || null,
        tenglish: data.tenglish || null,
        tenglish_variation_2: data.tenglish_variation_2 || null,
        tenglish_variation_3: data.tenglish_variation_3 || null,
        is_key_concept: data.is_key_concept ?? concept.is_key_concept,
        kitty_question: data.kitty_question || null,
        mama_kitty_answer: data.mama_kitty_answer || null,
        check_question: data.check_question || null,
        check_options: data.check_options || null,
        check_answer: data.check_answer ?? null,
        check_explanation: data.check_explanation || null,
        mama_response_correct: data.mama_response_correct || null,
        mama_response_wrong: data.mama_response_wrong || null,
        exam_rubric: data.exam_rubric || null,
        updated_at: new Date().toISOString(),
      }).eq('id', concept.id)

      if (error) throw new Error(error.message)

      // Track activity
      if (user) await incrementActivity(user.id, 'concepts_generated')

      return true
    } catch (err) {
      console.error(`Generate failed for ${concept.id}:`, err)
      return false
    }
  }

  async function runBatch(chapterKey: string) {
    const group = groups.find(g => `${g.paper_number}-${g.chapter_number}` === chapterKey)
    if (!group) return

    setIsRunning(true)
    abortRef.current = false
    const total = group.concepts.length
    setProgress({ done: 0, total })

    const states = new Map<string, ConceptGenState>()
    for (const c of group.concepts) {
      states.set(c.id, { id: c.id, status: 'idle' })
    }
    setGenStates(new Map(states))

    let done = 0
    for (const concept of group.concepts) {
      if (abortRef.current) break

      // Set running
      states.set(concept.id, { id: concept.id, status: 'running' })
      setGenStates(new Map(states))

      const ok = await generateOne(concept)

      states.set(concept.id, { id: concept.id, status: ok ? 'done' : 'error', error: ok ? undefined : 'Generation failed' })
      done++
      setProgress({ done, total })
      setGenStates(new Map(states))

      // Small delay between calls to avoid rate limits
      if (!abortRef.current && done < total) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    setIsRunning(false)
    // Reload to update counts
    await loadData()
  }

  function stopBatch() {
    abortRef.current = true
  }

  const selectedGroup = selectedChapter ? groups.find(g => `${g.paper_number}-${g.chapter_number}` === selectedChapter) : null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>🤖 Generation Queue</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Run SOMI Engine on concepts that don&apos;t have Tenglish yet
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center" style={{ background: 'var(--surface)' }}>
            <span className="text-4xl">🎉</span>
            <p className="text-sm font-medium mt-3" style={{ color: 'var(--text)' }}>
              All concepts have been generated!
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Import more concepts or add new ones to see them here
            </p>
          </div>
        ) : (
          <>
            {/* Progress bar during batch */}
            {isRunning && (
              <div className="rounded-xl p-4 mb-5" style={{ background: '#0A2E28' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-semibold">
                    🤖 Generating... {progress.done}/{progress.total}
                  </span>
                  <button
                    onClick={stopBatch}
                    className="text-xs px-3 py-1 rounded-lg bg-red-500 text-white font-medium cursor-pointer hover:bg-red-600"
                  >
                    ⏹ Stop
                  </button>
                </div>
                <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Chapter cards */}
            <div className="space-y-3">
              {groups.map(group => {
                const key = `${group.paper_number}-${group.chapter_number}`
                const isSelected = selectedChapter === key
                const pct = group.total > 0 ? Math.round(((group.total - group.ungenerated) / group.total) * 100) : 0

                return (
                  <div key={key} className="rounded-xl shadow-sm overflow-hidden" style={{ background: 'var(--surface)' }}>
                    {/* Chapter header */}
                    <div
                      className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setSelectedChapter(isSelected ? null : key)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ background: 'var(--primary)' }}
                          >
                            P{group.paper_number}
                          </span>
                          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                            Ch {group.chapter_number}: {group.chapter_title}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                          <span>🤖 {group.ungenerated} ungenerated</span>
                          <span>📝 {group.total} total</span>
                          <span>{pct}% done</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-2" style={{ maxWidth: 200 }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : 'var(--accent)' }}
                          />
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedChapter(key)
                          runBatch(key)
                        }}
                        disabled={isRunning}
                        className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
                        style={{ background: 'var(--accent)' }}
                      >
                        {isRunning && selectedChapter === key ? 'Running...' : `Generate All (${group.ungenerated})`}
                      </button>

                      <span className="text-gray-400 text-xs shrink-0">
                        {isSelected ? '▲' : '▼'}
                      </span>
                    </div>

                    {/* Expanded concept list */}
                    {isSelected && (
                      <div className="border-t border-gray-100 px-5 py-3 max-h-96 overflow-y-auto">
                        {(selectedGroup?.concepts || []).map((concept, i) => {
                          const state = genStates.get(concept.id)
                          return (
                            <div
                              key={concept.id}
                              className="flex items-center gap-3 py-2"
                              style={{ borderTop: i > 0 ? '1px solid #f5f5f0' : undefined }}
                            >
                              {/* Status indicator */}
                              <span className="w-6 text-center shrink-0">
                                {!state || state.status === 'idle' ? (
                                  <span className="text-gray-300">○</span>
                                ) : state.status === 'running' ? (
                                  <span className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin inline-block" />
                                ) : state.status === 'done' ? (
                                  <span className="text-green-500">✓</span>
                                ) : (
                                  <span className="text-red-500">✗</span>
                                )}
                              </span>

                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate" style={{ color: 'var(--text)' }}>
                                  {concept.concept_title || 'Untitled'}
                                </p>
                                <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                                  Page {concept.book_page} · {concept.sub_chapter_id}
                                </p>
                              </div>

                              {state?.error && (
                                <span className="text-xs text-red-500 shrink-0">{state.error}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
