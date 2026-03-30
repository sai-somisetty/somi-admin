'use client'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import type { AuthUser, Chapter, SubChapter, ContentPage, Concept } from '@/lib/types'

const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

interface TreeNode {
  chapter: Chapter
  subChapters: (SubChapter & { pages: ContentPage[] })[]
  expanded: boolean
}

interface AddPageTarget {
  course_id: string
  paper_number: number
  chapter_number: number
  sub_chapter_id: string
  sub_chapter_title: string
}

interface GeneratedData {
  tenglish: string
  tenglish_variation_2: string
  tenglish_variation_3: string
  is_key_concept: boolean
  kitty_question: string | null
  mama_kitty_answer: string | null
  check_question: string
  check_options: string[]
  check_answer: number
  check_explanation: string
  mama_response_correct: string
  mama_response_wrong: string
}

const emptyAddPageForm = {
  bookPage: '',
  hasDiagram: false,
  hasTable: false,
}

const emptyForm = {
  concept_title: '',
  content_type: 'text' as 'text' | 'list' | 'table' | 'definition',
  heading: '',
  text: '',
  tenglish: '',
  tenglish_variation_2: '',
  tenglish_variation_3: '',
  is_key_concept: false,
  kitty_question: '',
  mama_kitty_answer: '',
  check_question: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  check_answer: 0,
  check_explanation: '',
  mama_response_correct: '',
  mama_response_wrong: '',
}

type FormState = typeof emptyForm

export default function ContentPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set([1]))
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set())
  const [selectedPage, setSelectedPage] = useState<ContentPage | null>(null)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedSubChapter, setSelectedSubChapter] = useState<AddPageTarget | null>(null)
  const [addPageTarget, setAddPageTarget] = useState<AddPageTarget | null>(null)
  const [addPageForm, setAddPageForm] = useState(emptyAddPageForm)
  const [savingPage, setSavingPage] = useState(false)
  const [addPageError, setAddPageError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedData, setGeneratedData] = useState<GeneratedData | null>(null)
  const [currentVariation, setCurrentVariation] = useState<1 | 2 | 3>(1)
  const [showPageSelector, setShowPageSelector] = useState(false)

  useEffect(() => {
    const u = getStoredUser()
    setUser(u)
    loadTree()
  }, [])

  async function loadTree() {
    setLoading(true)
    const [{ data: chapters }, { data: subChapters }, { data: pages }] =
      await Promise.all([
        supabase.from('chapters').select('*').eq('course_id', 'cma').eq('paper_number', 1).order('chapter_number'),
        supabase.from('sub_chapters').select('*').eq('course_id', 'cma').eq('paper_number', 1).order('chapter_number').order('sub_chapter_id'),
        supabase.from('content_pages').select('*').eq('course_id', 'cma').eq('paper_number', 1).order('book_page'),
      ])

    const nodes: TreeNode[] = (chapters || []).map(ch => ({
      chapter: ch,
      expanded: ch.chapter_number === 1,
      subChapters: (subChapters || [])
        .filter(sc => sc.chapter_number === ch.chapter_number)
        .map(sc => ({
          ...sc,
          pages: (pages || []).filter(
            p => p.chapter_number === ch.chapter_number && p.sub_chapter_id === sc.sub_chapter_id
          ),
        })),
    }))
    setTree(nodes)
    setLoading(false)
  }

  async function saveNewPage() {
    if (!addPageTarget) return
    const bookPage = parseInt(addPageForm.bookPage)
    if (!bookPage || bookPage <= 0) {
      setAddPageError('Please enter a valid book page number.')
      return
    }
    setSavingPage(true)
    setAddPageError('')
    try {
      const { error } = await supabase.from('content_pages').insert({
        course_id: addPageTarget.course_id,
        paper_number: addPageTarget.paper_number,
        chapter_number: addPageTarget.chapter_number,
        sub_chapter_id: addPageTarget.sub_chapter_id,
        book_page: bookPage,
        pdf_page: bookPage + 8,
        has_diagram: addPageForm.hasDiagram,
        has_table: addPageForm.hasTable,
      })
      if (error) throw error
      setAddPageTarget(null)
      setAddPageForm(emptyAddPageForm)
      loadTree()
    } catch (e: unknown) {
      setAddPageError(e instanceof Error ? e.message : 'Failed to save page.')
    } finally {
      setSavingPage(false)
    }
  }

  function openAddPage(target: AddPageTarget, e?: React.MouseEvent) {
    e?.stopPropagation()
    setAddPageForm(emptyAddPageForm)
    setAddPageError('')
    setAddPageTarget(target)
  }

  const loadConcepts = useCallback(async (page: ContentPage) => {
    const { data } = await supabase
      .from('concepts')
      .select('*')
      .eq('course_id', page.course_id)
      .eq('paper_number', page.paper_number)
      .eq('chapter_number', page.chapter_number)
      .eq('sub_chapter_id', page.sub_chapter_id)
      .eq('book_page', page.book_page)
      .order('order_index')
    setConcepts(data || [])
  }, [])

  function selectPage(page: ContentPage) {
    setSelectedPage(page)
    loadConcepts(page)
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setGeneratedData(null)
    setCurrentVariation(1)
    const parentSub = tree
      .flatMap(n => n.subChapters)
      .find(s => s.chapter_number === page.chapter_number && s.sub_chapter_id === page.sub_chapter_id)
    if (parentSub) {
      setSelectedSubChapter({
        course_id: page.course_id,
        paper_number: page.paper_number,
        chapter_number: page.chapter_number,
        sub_chapter_id: page.sub_chapter_id,
        sub_chapter_title: `${parentSub.sub_chapter_id} ${parentSub.title}`,
      })
    }
  }

  function toggleChapter(chNum: number) {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(chNum) ? next.delete(chNum) : next.add(chNum)
      return next
    })
  }

  function toggleSub(key: string) {
    setExpandedSubs(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function startEdit(concept: Concept) {
    const opts = concept.check_options as string[] | null
    setForm({
      concept_title: concept.concept_title || '',
      content_type: concept.content_type,
      heading: concept.heading || '',
      text: concept.text,
      tenglish: concept.tenglish || '',
      tenglish_variation_2: '',
      tenglish_variation_3: '',
      is_key_concept: concept.is_key_concept,
      kitty_question: concept.kitty_question || '',
      mama_kitty_answer: concept.mama_kitty_answer || '',
      check_question: concept.check_question || '',
      option_a: opts?.[0] || '',
      option_b: opts?.[1] || '',
      option_c: opts?.[2] || '',
      option_d: opts?.[3] || '',
      check_answer: concept.check_answer ?? 0,
      check_explanation: concept.check_explanation || '',
      mama_response_correct: concept.mama_response_correct || '',
      mama_response_wrong: concept.mama_response_wrong || '',
    })
    setEditingId(concept.id)
    setGeneratedData(null)
    setCurrentVariation(1)
    setShowForm(true)
  }

  async function deleteConcept(id: string) {
    if (!confirm('Delete this concept?')) return
    await supabase.from('concepts').delete().eq('id', id)
    if (selectedPage) loadConcepts(selectedPage)
  }

  async function generateWithAI() {
    if (!form.text.trim()) {
      alert('Please paste ICMAI text first.')
      return
    }
    const chapterNode = selectedPage
      ? tree.find(n => n.chapter.chapter_number === selectedPage.chapter_number)?.chapter
      : null
    const subNode = selectedPage
      ? tree.flatMap(n => n.subChapters).find(s => s.chapter_number === selectedPage.chapter_number && s.sub_chapter_id === selectedPage.sub_chapter_id)
      : null

    setGenerating(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          icmai_text: form.text,
          concept_title: form.concept_title,
          chapter: chapterNode ? `${chapterNode.chapter_number} — ${chapterNode.title}` : '',
          sub_chapter: subNode ? `${subNode.sub_chapter_id} ${subNode.title}` : '',
        }),
      })
      const data: GeneratedData = await res.json()
      setGeneratedData(data)
      setCurrentVariation(1)
      setForm(prev => ({
        ...prev,
        tenglish: data.tenglish || '',
        tenglish_variation_2: data.tenglish_variation_2 || '',
        tenglish_variation_3: data.tenglish_variation_3 || '',
        is_key_concept: data.is_key_concept ?? prev.is_key_concept,
        kitty_question: data.kitty_question || '',
        mama_kitty_answer: data.mama_kitty_answer || '',
        check_question: data.check_question || '',
        option_a: data.check_options?.[0] || '',
        option_b: data.check_options?.[1] || '',
        option_c: data.check_options?.[2] || '',
        option_d: data.check_options?.[3] || '',
        check_answer: data.check_answer ?? 0,
        check_explanation: data.check_explanation || '',
        mama_response_correct: data.mama_response_correct || '',
        mama_response_wrong: data.mama_response_wrong || '',
      }))
    } catch (e) {
      console.error(e)
      alert('AI generation failed. Check your API key.')
    } finally {
      setGenerating(false)
    }
  }

  function switchVariation(v: 1 | 2 | 3) {
    setForm(prev => {
      const updated = { ...prev }
      if (currentVariation === 1) updated.tenglish = prev.tenglish
      else if (currentVariation === 2) updated.tenglish_variation_2 = prev.tenglish_variation_2
      else updated.tenglish_variation_3 = prev.tenglish_variation_3
      return updated
    })
    setCurrentVariation(v)
  }

  function getCurrentVariationText() {
    if (currentVariation === 1) return form.tenglish
    if (currentVariation === 2) return form.tenglish_variation_2
    return form.tenglish_variation_3
  }

  function setCurrentVariationText(val: string) {
    if (currentVariation === 1) setForm(p => ({ ...p, tenglish: val }))
    else if (currentVariation === 2) setForm(p => ({ ...p, tenglish_variation_2: val }))
    else setForm(p => ({ ...p, tenglish_variation_3: val }))
  }

  async function saveConcept(submitForReview: boolean) {
    if (!selectedPage || !user) return
    setSaving(true)
    try {
      const payload = {
        course_id: selectedPage.course_id,
        paper_number: selectedPage.paper_number,
        chapter_number: selectedPage.chapter_number,
        sub_chapter_id: selectedPage.sub_chapter_id,
        book_page: selectedPage.book_page,
        order_index: editingId
          ? concepts.find(c => c.id === editingId)?.order_index || 1
          : concepts.length + 1,
        concept_title: form.concept_title || null,
        content_type: form.content_type,
        heading: form.heading || null,
        text: form.text,
        tenglish: form.tenglish || null,
        is_key_concept: form.is_key_concept,
        kitty_question: form.is_key_concept ? form.kitty_question || null : null,
        mama_kitty_answer: form.is_key_concept ? form.mama_kitty_answer || null : null,
        check_question: form.check_question || null,
        check_options: [form.option_a, form.option_b, form.option_c, form.option_d].filter(Boolean).length > 0
          ? [form.option_a, form.option_b, form.option_c, form.option_d]
          : null,
        check_answer: form.check_answer,
        check_explanation: form.check_explanation || null,
        mama_response_correct: form.mama_response_correct || null,
        mama_response_wrong: form.mama_response_wrong || null,
        is_verified: false,
        needs_work: false,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        await supabase.from('concepts').update(payload).eq('id', editingId)
      } else {
        await supabase.from('concepts').insert(payload)
      }

      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      setGeneratedData(null)
      loadConcepts(selectedPage)
    } finally {
      setSaving(false)
    }
  }

  const selectedSub = selectedPage
    ? tree
        .flatMap(n => n.subChapters)
        .find(s => s.sub_chapter_id === selectedPage.sub_chapter_id && s.chapter_number === selectedPage.chapter_number)
    : null
  const selectedChapter = selectedPage
    ? tree.find(n => n.chapter.chapter_number === selectedPage.chapter_number)?.chapter
    : null

  const labelCls = 'block text-xs font-semibold mb-1'
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all'
  const textareaCls = `${inputCls} resize-none`

  return (
    <>
    <PanelGroup
      direction="horizontal"
      style={{ height: 'calc(100vh - 48px)', display: 'flex' }}
    >
      {/* PANE 1 — Center workspace */}
      <Panel defaultSize={55} minSize={40}>
      <div className="flex h-full flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>

        {/* Breadcrumb bar */}
        <div className="px-5 py-2.5 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between gap-4">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--muted)' }}>
            {selectedPage ? (
              <>
                Chapter {selectedChapter?.chapter_number} ›{' '}
                {selectedSub?.sub_chapter_id} {selectedSub?.title} ›{' '}
                <span style={{ color: 'var(--accent)' }}>Page {selectedPage.book_page}</span>
              </>
            ) : (
              <span>No page selected — click &ldquo;Change Page&rdquo; to browse</span>
            )}
          </p>
          <button
            onClick={() => setShowPageSelector(true)}
            className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
            style={{ color: 'var(--text)' }}
          >
            📂 Change Page
          </button>
        </div>

        {!selectedPage ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="text-4xl">📄</span>
              <p className="mt-3 font-medium" style={{ color: 'var(--text)' }}>
                Select a page to start adding concepts
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Click &ldquo;Change Page&rdquo; above to browse chapters and pages
              </p>
              <button
                onClick={() => setShowPageSelector(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)', boxShadow: '0 4px 20px rgba(230,126,34,0.35)' }}
              >
                📂 Browse Pages
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Concepts list + form */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {concepts.length === 0 && !showForm && (
                <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>No concepts yet on this page</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Click &quot;Add Concept&quot; to start</p>
                </div>
              )}

              {concepts.map(concept => (
                <div
                  key={concept.id}
                  className="rounded-xl shadow-sm p-4 mb-3"
                  style={{ background: 'var(--surface)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: '#0A2E28', color: 'white' }}
                        >
                          #{concept.order_index}
                        </span>
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {concept.concept_title || 'Untitled concept'}
                        </span>
                        <ConceptStatusBadge concept={concept} />
                      </div>
                      <p className="text-xs line-clamp-2" style={{ color: 'var(--muted)' }}>
                        {concept.text}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(concept)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                        style={{ color: 'var(--text)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteConcept(concept.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {!showForm && (
                <button
                  onClick={() => {
                    setForm(emptyForm)
                    setEditingId(null)
                    setGeneratedData(null)
                    setCurrentVariation(1)
                    setShowForm(true)
                  }}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white mt-2 cursor-pointer"
                  style={{ background: 'var(--accent)' }}
                >
                  <span>+</span> Add Concept to Page {selectedPage.book_page}
                </button>
              )}

              {/* ── Concept Form ── */}
              {showForm && (
                <div
                  className="rounded-xl shadow-sm p-5 mt-3"
                  style={{ background: 'var(--surface)' }}
                >
                  <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>
                    {editingId ? 'Edit Concept' : 'New Concept'}
                  </h3>

                  <div className="space-y-5">
                    {/* ── Section 1: CONTENT ── */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--accent)' }}>
                        📖 Content
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className={labelCls} style={{ color: 'var(--text)' }}>
                            📖 ICMAI Official Text <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            className={textareaCls}
                            rows={6}
                            value={form.text}
                            onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
                            placeholder="Copy exact text from PDF →"
                          />
                          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                            Tip: Select text from PDF viewer on the right
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls} style={{ color: 'var(--muted)' }}>Concept Title</label>
                            <input
                              className={inputCls}
                              value={form.concept_title}
                              onChange={e => setForm(p => ({ ...p, concept_title: e.target.value }))}
                              placeholder="e.g. Definition of Law"
                            />
                          </div>
                          <div>
                            <label className={labelCls} style={{ color: 'var(--muted)' }}>Content Type</label>
                            <select
                              className={inputCls}
                              value={form.content_type}
                              onChange={e => setForm(p => ({ ...p, content_type: e.target.value as FormState['content_type'] }))}
                            >
                              <option value="text">Text</option>
                              <option value="list">List</option>
                              <option value="table">Table</option>
                              <option value="definition">Definition</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className={labelCls} style={{ color: 'var(--muted)' }}>Heading (optional)</label>
                          <input
                            className={inputCls}
                            value={form.heading}
                            onChange={e => setForm(p => ({ ...p, heading: e.target.value }))}
                            placeholder="Section heading"
                          />
                        </div>

                        <button
                          onClick={generateWithAI}
                          disabled={generating || !form.text.trim()}
                          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
                          style={{ background: generating ? '#6B7280' : '#0D9488' }}
                        >
                          {generating ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                              Generating...
                            </>
                          ) : (
                            '✨ Generate with AI'
                          )}
                        </button>
                      </div>
                    </div>

                    {/* ── Section 2: MAMA'S EXPLANATION ── */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--accent)' }}>
                        🧠 Mama&apos;s Explanation
                      </p>
                      <label className={labelCls} style={{ color: 'var(--text)' }}>
                        🧠 Mama&apos;s Tenglish
                      </label>
                      <div className="flex gap-1 mb-2">
                        {([1, 2, 3] as const).map(v => (
                          <button
                            key={v}
                            onClick={() => switchVariation(v)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer"
                            style={{
                              background: currentVariation === v ? 'var(--accent)' : '#F3F4F6',
                              color: currentVariation === v ? 'white' : 'var(--muted)',
                            }}
                          >
                            Variation {v}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className={textareaCls}
                        rows={4}
                        value={getCurrentVariationText()}
                        onChange={e => setCurrentVariationText(e.target.value)}
                        placeholder={generatedData ? '' : "Click 'Generate with AI' above first"}
                      />
                    </div>

                    {/* ── Section 3: KITTY INTERACTION ── */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--accent)' }}>
                        😺 Kitty Interaction
                      </p>
                      <div className="flex items-center gap-3 mb-3">
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, is_key_concept: !p.is_key_concept }))}
                          className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer"
                          style={{ background: form.is_key_concept ? 'var(--accent)' : '#d1d5db' }}
                        >
                          <span
                            className="inline-block w-3.5 h-3.5 bg-white rounded-full transition-transform shadow-sm"
                            style={{ transform: form.is_key_concept ? 'translateX(18px)' : 'translateX(2px)' }}
                          />
                        </button>
                        <label
                          className="text-sm font-medium cursor-pointer"
                          style={{ color: 'var(--text)' }}
                          onClick={() => setForm(p => ({ ...p, is_key_concept: !p.is_key_concept }))}
                        >
                          Is Key Concept?
                        </label>
                      </div>

                      {form.is_key_concept && (
                        <div className="space-y-3 pl-4 border-l-2 border-orange-200">
                          <div>
                            <label className={labelCls} style={{ color: 'var(--muted)' }}>😺 Kitty&apos;s Question</label>
                            <textarea
                              className={textareaCls}
                              rows={2}
                              value={form.kitty_question}
                              onChange={e => setForm(p => ({ ...p, kitty_question: e.target.value }))}
                              placeholder="What question would Kitty ask?"
                            />
                          </div>
                          <div>
                            <label className={labelCls} style={{ color: 'var(--muted)' }}>🧠 Mama&apos;s Answer to Kitty</label>
                            <textarea
                              className={textareaCls}
                              rows={3}
                              value={form.mama_kitty_answer}
                              onChange={e => setForm(p => ({ ...p, mama_kitty_answer: e.target.value }))}
                              placeholder="Mama's warm explanation..."
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Section 4: CHECK QUESTION ── */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--accent)' }}>
                        ❓ Check Question
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className={labelCls} style={{ color: 'var(--text)' }}>
                            ❓ Check Question
                          </label>
                          <textarea
                            className={textareaCls}
                            rows={2}
                            value={form.check_question}
                            onChange={e => setForm(p => ({ ...p, check_question: e.target.value }))}
                            placeholder="MCQ question text..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {(['a', 'b', 'c', 'd'] as const).map((opt) => (
                            <div key={opt}>
                              <label className={labelCls} style={{ color: 'var(--muted)' }}>Option {opt.toUpperCase()}</label>
                              <input
                                className={inputCls}
                                value={form[`option_${opt}` as keyof FormState] as string}
                                onChange={e => setForm(p => ({ ...p, [`option_${opt}`]: e.target.value }))}
                                placeholder={`Option ${opt.toUpperCase()}`}
                              />
                            </div>
                          ))}
                        </div>

                        <div>
                          <label className={labelCls} style={{ color: 'var(--muted)' }}>Correct Answer</label>
                          <div className="flex gap-4">
                            {['A', 'B', 'C', 'D'].map((opt, i) => (
                              <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm" style={{ color: 'var(--text)' }}>
                                <input
                                  type="radio"
                                  name="check_answer"
                                  checked={form.check_answer === i}
                                  onChange={() => setForm(p => ({ ...p, check_answer: i }))}
                                  className="accent-orange-500"
                                />
                                {opt}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className={labelCls} style={{ color: 'var(--muted)' }}>Explanation</label>
                          <textarea
                            className={textareaCls}
                            rows={2}
                            value={form.check_explanation}
                            onChange={e => setForm(p => ({ ...p, check_explanation: e.target.value }))}
                            placeholder="Why is this the correct answer?"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── Section 5: MAMA RESPONSES ── */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--accent)' }}>
                        💬 Mama Responses
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls} style={{ color: 'var(--muted)' }}>✅ When Correct</label>
                          <textarea
                            className={textareaCls}
                            rows={3}
                            value={form.mama_response_correct}
                            onChange={e => setForm(p => ({ ...p, mama_response_correct: e.target.value }))}
                            placeholder="Mama's warm response when correct..."
                          />
                        </div>
                        <div>
                          <label className={labelCls} style={{ color: 'var(--muted)' }}>❌ When Wrong</label>
                          <textarea
                            className={textareaCls}
                            rows={3}
                            value={form.mama_response_wrong}
                            onChange={e => setForm(p => ({ ...p, mama_response_wrong: e.target.value }))}
                            placeholder="Mama's reassuring response when wrong..."
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── Action buttons ── */}
                    <div className="flex gap-3 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); setGeneratedData(null) }}
                        className="rounded-lg px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                        style={{ color: 'var(--text)' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveConcept(false)}
                        disabled={saving || !form.text}
                        className="rounded-lg px-4 py-2 text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                        style={{ color: 'var(--text)' }}
                      >
                        {saving ? 'Saving...' : 'Save as Draft'}
                      </button>
                      <button
                        onClick={() => saveConcept(true)}
                        disabled={saving || !form.text}
                        className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50 cursor-pointer"
                        style={{ background: 'var(--accent)' }}
                      >
                        {saving ? 'Saving...' : 'Submit for Review'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </Panel>

      <PanelResizeHandle className="resize-handle">
        <div style={{
          width: 8,
          height: '100%',
          background: '#e5e7eb',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s',
        }}>
          <div style={{
            width: 3,
            height: 48,
            background: '#9ca3af',
            borderRadius: 4,
          }} />
        </div>
      </PanelResizeHandle>

      {/* PANE 2 — PDF Viewer */}
      <Panel defaultSize={45} minSize={30} maxSize={60}>
        <div className="flex flex-col h-full border-l border-gray-200" style={{ background: '#f5f5f5' }}>
          {selectedPage ? (
            <div style={{ height: '100%' }}>
              <PDFViewer bookPage={selectedPage.book_page} />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center h-full">
              <p className="text-sm text-center px-4" style={{ color: '#aaa' }}>
                Select a page to see PDF
              </p>
            </div>
          )}
        </div>
      </Panel>
    </PanelGroup>

      {/* ── Modals (fixed-position, outside panel layout) ── */}
      {/* ── Add Page Modal ── */}
      {addPageTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setAddPageTarget(null); setAddPageError('') } }}
        >
          <div className="rounded-2xl p-7 w-96 shadow-2xl" style={{ background: 'var(--surface)' }}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
                  Add Page to {addPageTarget.sub_chapter_title}
                </h2>
              </div>
              <button
                onClick={() => { setAddPageTarget(null); setAddPageError('') }}
                className="rounded-lg w-7 h-7 flex items-center justify-center text-base cursor-pointer hover:bg-gray-100 transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                ×
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
                Book Page Number
              </label>
              <input
                type="number"
                min={1}
                autoFocus
                value={addPageForm.bookPage}
                onChange={(e) => setAddPageForm(f => ({ ...f, bookPage: e.target.value }))}
                placeholder="e.g. 42"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
                style={{ color: 'var(--text)' }}
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
                PDF Page <span className="font-normal">(book page + 8, auto-calculated)</span>
              </label>
              <div
                className="rounded-lg px-3 py-2.5 text-sm font-semibold"
                style={{
                  background: '#F5F0E8',
                  color: parseInt(addPageForm.bookPage) > 0 ? 'var(--accent)' : '#C5B9A8',
                  border: '1px solid #E5E0D8',
                }}
              >
                {parseInt(addPageForm.bookPage) > 0 ? parseInt(addPageForm.bookPage) + 8 : '—'}
              </div>
            </div>

            <div className="flex gap-6 mb-5">
              {([
                { key: 'hasDiagram', label: 'Has Diagram?' },
                { key: 'hasTable', label: 'Has Table?' },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={addPageForm[key]}
                    onChange={(e) => setAddPageForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="w-4 h-4 cursor-pointer accent-orange-500"
                  />
                  {label}
                </label>
              ))}
            </div>

            {addPageError && (
              <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                {addPageError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setAddPageTarget(null); setAddPageError('') }}
                className="flex-1 rounded-xl py-2.5 text-sm border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                style={{ color: 'var(--text)' }}
              >
                Cancel
              </button>
              <button
                onClick={saveNewPage}
                disabled={savingPage}
                className="flex-[2] rounded-xl py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60 cursor-pointer"
                style={{ background: 'var(--accent)' }}
              >
                {savingPage ? 'Saving…' : 'Add Page'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Selector Modal ── */}
      {showPageSelector && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPageSelector(false) }}
        >
          <div
            className="rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ background: 'white', width: 600, maxHeight: '80vh' }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Select Page</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>CMA Foundation · Paper 1 — Business Laws</p>
              </div>
              <button
                onClick={() => setShowPageSelector(false)}
                className="rounded-lg w-8 h-8 flex items-center justify-center text-lg cursor-pointer hover:bg-gray-100 transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                ×
              </button>
            </div>

            {/* Tree */}
            <div className="overflow-y-auto flex-1 py-2">
              {loading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                tree.map(node => (
                  <div key={node.chapter.chapter_number}>
                    <button
                      onClick={() => toggleChapter(node.chapter.chapter_number)}
                      className="flex items-center gap-2 w-full px-5 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {expandedChapters.has(node.chapter.chapter_number) ? '▼' : '►'}
                      </span>
                      <span className="text-sm font-semibold flex-1 leading-tight" style={{ color: 'var(--text)' }}>
                        Ch {node.chapter.chapter_number} — {node.chapter.title}
                      </span>
                      <StatusDot status={node.chapter.status} />
                    </button>

                    {expandedChapters.has(node.chapter.chapter_number) &&
                      node.subChapters.map(sc => {
                        const subKey = `${sc.chapter_number}-${sc.sub_chapter_id}`
                        const subExpanded = expandedSubs.has(subKey)
                        return (
                          <div key={sc.sub_chapter_id}>
                            <div className="flex items-center group">
                              <button
                                onClick={() => toggleSub(subKey)}
                                className="flex items-center gap-2 flex-1 pl-10 pr-2 py-2 text-left hover:bg-gray-50 transition-colors"
                              >
                                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                  {subExpanded ? '▼' : '►'}
                                </span>
                                <span className="text-sm flex-1 leading-tight" style={{ color: 'var(--muted)' }}>
                                  {sc.sub_chapter_id} {sc.title}
                                </span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShowPageSelector(false)
                                  openAddPage({
                                    course_id: sc.course_id,
                                    paper_number: sc.paper_number,
                                    chapter_number: sc.chapter_number,
                                    sub_chapter_id: sc.sub_chapter_id,
                                    sub_chapter_title: `${sc.sub_chapter_id} ${sc.title}`,
                                  })
                                }}
                                title="Add a page to this sub-chapter"
                                className="shrink-0 mr-4 text-xs px-2 py-1 rounded font-semibold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                style={{ background: '#FEF3E8', color: 'var(--accent)' }}
                              >
                                + Add Page
                              </button>
                            </div>

                            {subExpanded && sc.pages.map(pg => {
                              const isActive = selectedPage?.id === pg.id
                              return (
                                <button
                                  key={pg.id}
                                  onClick={() => {
                                    selectPage(pg)
                                    setShowPageSelector(false)
                                  }}
                                  className="flex items-center gap-2 w-full pl-16 pr-5 py-2 text-left transition-colors hover:bg-orange-50"
                                  style={{
                                    background: isActive ? '#FEF3E8' : undefined,
                                    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                                  }}
                                >
                                  <span className="text-xs">📄</span>
                                  <span
                                    className="text-sm flex-1"
                                    style={{ color: isActive ? 'var(--accent)' : 'var(--text)', fontWeight: isActive ? 600 : 400 }}
                                  >
                                    Page {pg.book_page}
                                  </span>
                                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                    {pg.total_concepts > 0 ? `${pg.total_concepts} concepts` : '0 concepts'}
                                  </span>
                                </button>
                              )
                            })}
                            {subExpanded && sc.pages.length === 0 && (
                              <p className="pl-16 pr-5 py-2 text-xs" style={{ color: 'var(--muted)' }}>
                                No pages yet — hover sub-chapter to add
                              </p>
                            )}
                          </div>
                        )
                      })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: '#9ca3af',
    in_progress: '#f59e0b',
    verified: '#16a34a',
  }
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0"
      style={{ background: colors[status] || '#9ca3af' }}
    />
  )
}

function ConceptStatusBadge({ concept }: { concept: Concept }) {
  if (concept.is_verified) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
        Verified
      </span>
    )
  }
  if (concept.needs_work) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
        Needs Work
      </span>
    )
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">
      Draft
    </span>
  )
}
