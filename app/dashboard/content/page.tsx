'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { acquireLock, releaseLock, incrementActivity } from '@/lib/concept-locks'
import type { AuthUser, AdminUser, Course, Paper, Chapter, SubChapter, ContentPage, Concept } from '@/lib/types'

const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

// ─── Types ───────────────────────────────────────────────────────────────────
interface ParagraphForm {
  heading: string
  text: string
  content_type: 'text' | 'image'
  image_url: string
}

const emptyForm: ParagraphForm = { heading: '', text: '', content_type: 'text', image_url: '' }

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ContentPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [userProfile, setUserProfile] = useState<AdminUser | null>(null)

  // Navigation data
  const [courses, setCourses] = useState<Course[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [subChapters, setSubChapters] = useState<SubChapter[]>([])
  const [pages, setPages] = useState<ContentPage[]>([])
  const [loading, setLoading] = useState(true)

  // Current selection
  const [selCourse, setSelCourse] = useState<string | null>(null)
  const [selPaper, setSelPaper] = useState<number | null>(null)
  const [selChapter, setSelChapter] = useState<number | null>(null)
  const [selSubChapter, setSelSubChapter] = useState<string | null>(null)
  const [selBookPage, setSelBookPage] = useState<number | null>(null)

  // Paragraphs
  const [paragraphs, setParagraphs] = useState<Concept[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<ParagraphForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lockHolder, setLockHolder] = useState<string | null>(null)

  // PDF
  const [pdfPageOffset, setPdfPageOffset] = useState(0)
  const [pdfWidth, setPdfWidth] = useState(480)
  const [isDragging, setIsDragging] = useState(false)

  // Image paste
  const [uploadingImage, setUploadingImage] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ─── Load hierarchy ──────────────────────────────────────────────────────
  useEffect(() => {
    const u = getStoredUser()
    setUser(u)
    if (u) {
      supabase.from('admin_users').select('*').eq('id', u.id).single()
        .then(({ data }) => { if (data) setUserProfile(data as AdminUser) })
    }
    loadHierarchy()
  }, [])

  async function loadHierarchy() {
    setLoading(true)
    const [{ data: co }, { data: pp }, { data: ch }, { data: sc }, { data: pg }] = await Promise.all([
      supabase.from('courses').select('*').order('course_id'),
      supabase.from('papers').select('*').order('course_id').order('paper_number'),
      supabase.from('chapters').select('*').order('course_id').order('paper_number').order('chapter_number'),
      supabase.from('sub_chapters').select('*').order('course_id').order('paper_number').order('chapter_number').order('sub_chapter_id'),
      supabase.from('content_pages').select('*').order('course_id').order('paper_number').order('chapter_number').order('book_page'),
    ])
    setCourses(co || [])
    setPapers(pp || [])
    setChapters(ch || [])
    setSubChapters(sc || [])
    setPages(pg || [])
    setLoading(false)

    // Auto-select first course
    if (co && co.length > 0) {
      setSelCourse(co[0].course_id)
    }
  }

  // ─── Filtered lists for dropdowns ────────────────────────────────────────
  const filteredPapers = papers.filter(p =>
    p.course_id === selCourse
  )

  const filteredChapters = chapters.filter(ch =>
    ch.course_id === selCourse &&
    ch.paper_number === selPaper
  )

  const filteredSubChapters = subChapters.filter(sc =>
    sc.course_id === selCourse &&
    sc.paper_number === selPaper &&
    sc.chapter_number === selChapter
  )

  const filteredPages = pages.filter(p =>
    p.course_id === selCourse &&
    p.paper_number === selPaper &&
    p.chapter_number === selChapter &&
    p.sub_chapter_id === selSubChapter
  )

  // Compute page range from CHAPTER start/end (chapter page range is known from index)
  const currentChapter = chapters.find(ch =>
    ch.course_id === selCourse && ch.paper_number === selPaper &&
    ch.chapter_number === selChapter
  )
  const pageRange: number[] = []
  if (currentChapter?.start_book_page && currentChapter?.end_book_page) {
    for (let i = currentChapter.start_book_page; i <= currentChapter.end_book_page; i++) {
      pageRange.push(i)
    }
  }

  // Filter chapters for interns
  const visibleChapters = (() => {
    if (user?.role === 'intern' && userProfile?.assigned_chapters) {
      const assigned = userProfile.assigned_chapters as number[]
      if (assigned.length > 0) return filteredChapters.filter(ch => assigned.includes(ch.chapter_number))
    }
    return filteredChapters
  })()

  // Page navigation
  const currentPageIndex = selBookPage ? pageRange.indexOf(selBookPage) : -1
  const totalPages = pageRange.length
  const hasPrev = currentPageIndex > 0
  const hasNext = currentPageIndex < totalPages - 1

  // ─── Load paragraphs when page changes ───────────────────────────────────
  const loadParagraphs = useCallback(async (courseId: string, paperNum: number, chapterNum: number, subChapterId: string, bookPage: number) => {
    const { data } = await supabase
      .from('concepts')
      .select('*')
      .eq('course_id', courseId)
      .eq('paper_number', paperNum)
      .eq('chapter_number', chapterNum)
      .eq('sub_chapter_id', subChapterId)
      .eq('book_page', bookPage)
      .order('order_index')
    setParagraphs(data || [])
  }, [])

  useEffect(() => {
    if (selCourse && selPaper && selChapter && selSubChapter && selBookPage) {
      loadParagraphs(selCourse, selPaper, selChapter, selSubChapter, selBookPage)
      setPdfPageOffset(0)
      setShowAddForm(false)
      setEditingId(null)
      setExpandedId(null)
    } else {
      setParagraphs([])
    }
  }, [selCourse, selPaper, selChapter, selSubChapter, selBookPage, loadParagraphs])

  // Auto-select first paper when course changes
  useEffect(() => {
    if (selCourse) {
      const pps = papers.filter(p => p.course_id === selCourse)
      if (pps.length > 0) {
        setSelPaper(pps[0].paper_number)
      } else {
        setSelPaper(null)
        setSelChapter(null)
        setSelSubChapter(null)
        setSelBookPage(null)
      }
    }
  }, [selCourse, papers])

  // Auto-select first chapter when paper changes
  useEffect(() => {
    if (selCourse && selPaper) {
      const chs = chapters.filter(ch => ch.course_id === selCourse && ch.paper_number === selPaper)
      if (chs.length > 0) {
        setSelChapter(chs[0].chapter_number)
      } else {
        setSelChapter(null)
        setSelSubChapter(null)
        setSelBookPage(null)
      }
    }
  }, [selPaper, selCourse, chapters])

  // Auto-select first sub-chapter when chapter changes
  useEffect(() => {
    if (selCourse && selPaper && selChapter) {
      const subs = subChapters.filter(sc => sc.course_id === selCourse && sc.paper_number === selPaper && sc.chapter_number === selChapter)
      if (subs.length > 0) {
        setSelSubChapter(subs[0].sub_chapter_id)
      } else {
        setSelSubChapter(null)
        setSelBookPage(null)
      }
    }
  }, [selChapter, selPaper, selCourse, subChapters])

  // Auto-select first page when sub-chapter changes
  useEffect(() => {
    if (selCourse && selPaper && selChapter && selSubChapter) {
      const sc = subChapters.find(s => s.course_id === selCourse && s.paper_number === selPaper && s.chapter_number === selChapter && s.sub_chapter_id === selSubChapter)
      if (sc?.start_book_page) {
        setSelBookPage(sc.start_book_page)
      } else {
        setSelBookPage(null)
      }
    }
  }, [selChapter, selSubChapter, selPaper, selCourse, subChapters])

  // ─── Paragraph actions ───────────────────────────────────────────────────
  async function saveParagraph() {
    if (!selCourse || !selPaper || !selChapter || !selSubChapter || !selBookPage || !user) return
    if (!form.text.trim() && !form.image_url) {
      alert('Enter text or paste an image')
      return
    }
    setSaving(true)
    try {
      // Auto-create content_pages entry if it doesn't exist
      await supabase.from('content_pages').upsert({
        course_id: selCourse,
        paper_number: selPaper,
        chapter_number: selChapter,
        sub_chapter_id: selSubChapter,
        book_page: selBookPage,
        pdf_page: selBookPage + 12,
        status: 'in_progress',
      }, { onConflict: 'course_id,paper_number,chapter_number,book_page' })

      const payload = {
        course_id: selCourse,
        paper_number: selPaper,
        chapter_number: selChapter,
        sub_chapter_id: selSubChapter,
        book_page: selBookPage,
        order_index: editingId
          ? paragraphs.find(p => p.id === editingId)?.order_index || paragraphs.length + 1
          : paragraphs.length + 1,
        concept_title: form.heading || null,
        heading: form.heading || null,
        content_type: form.content_type,
        text: form.content_type === 'image' ? (form.image_url || '') : form.text,
        is_key_concept: false,
        is_verified: false,
        needs_work: false,
        review_status: 'draft',
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        await supabase.from('concepts').update(payload).eq('id', editingId)
        await releaseLock(editingId, user.id)
      } else {
        await supabase.from('concepts').insert(payload)
      }

      await incrementActivity(user.id, 'concepts_entered')
      setForm(emptyForm)
      setEditingId(null)
      setShowAddForm(false)
      reloadCurrentPage()
    } finally {
      setSaving(false)
    }
  }

  function reloadCurrentPage() {
    if (selCourse && selPaper && selChapter && selSubChapter && selBookPage) {
      loadParagraphs(selCourse, selPaper, selChapter, selSubChapter, selBookPage)
    }
  }

  async function startEdit(para: Concept) {
    if (user) {
      const result = await acquireLock(para.id, user.id)
      if (!result.ok) {
        setLockHolder(result.holder || 'Another user')
        setTimeout(() => setLockHolder(null), 4000)
        return
      }
    }
    setForm({
      heading: para.heading || para.concept_title || '',
      text: para.text || '',
      content_type: (para.content_type as 'text' | 'image') || 'text',
      image_url: para.content_type === 'image' ? para.text : '',
    })
    setEditingId(para.id)
    setShowAddForm(true)
    setExpandedId(null)
  }

  function cancelEdit() {
    if (editingId && user) releaseLock(editingId, user.id)
    setForm(emptyForm)
    setEditingId(null)
    setShowAddForm(false)
  }

  async function deleteParagraph(id: string) {
    if (!confirm('Delete this paragraph?')) return
    await supabase.from('concepts').delete().eq('id', id)
    reloadCurrentPage()
  }

  async function moveParagraph(id: string, direction: 'up' | 'down') {
    const idx = paragraphs.findIndex(p => p.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= paragraphs.length) return
    const a = paragraphs[idx], b = paragraphs[swapIdx]
    await Promise.all([
      supabase.from('concepts').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('concepts').update({ order_index: a.order_index }).eq('id', b.id),
    ])
    reloadCurrentPage()
  }

  async function moveToPage(id: string) {
    const newPage = prompt('Move to which book page number?')
    if (!newPage || parseInt(newPage) <= 0) return
    await supabase.from('concepts').update({
      book_page: parseInt(newPage),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    reloadCurrentPage()
  }

  // ─── Image paste handler ─────────────────────────────────────────────────
  async function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return

        setUploadingImage(true)
        try {
          const filename = `screenshots/${Date.now()}_${Math.random().toString(36).slice(2)}.png`
          const { error } = await supabase.storage
            .from('textbooks')
            .upload(filename, file, { contentType: file.type })

          if (error) {
            alert('Image upload failed: ' + error.message)
            return
          }

          const { data: urlData } = supabase.storage
            .from('textbooks')
            .getPublicUrl(filename)

          setForm(prev => ({
            ...prev,
            content_type: 'image',
            image_url: urlData.publicUrl,
            text: '',
          }))
        } finally {
          setUploadingImage(false)
        }
      }
    }
  }

  // ─── Page navigation ─────────────────────────────────────────────────────
  function goToPage(direction: 'prev' | 'next') {
    const newIdx = direction === 'prev' ? currentPageIndex - 1 : currentPageIndex + 1
    if (newIdx >= 0 && newIdx < pageRange.length) {
      setSelBookPage(pageRange[newIdx])
    }
  }

  // ─── Drag handle for PDF resize ──────────────────────────────────────────
  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = pdfWidth
    const onMove = (ev: MouseEvent) => {
      setPdfWidth(Math.min(Math.max(startWidth + (startX - ev.clientX), 280), 800))
    }
    const onUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ─── Get current sub-chapter + chapter info ──────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const displayBookPage = selBookPage ? selBookPage + pdfPageOffset : 0

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', userSelect: isDragging ? 'none' : 'auto' }}>

      {/* ═══ LEFT: Content Entry Panel ═══ */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 400 }}>

        {/* ── Navigation Bar ── */}
        <div style={{
          padding: '10px 16px',
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {/* Row 1: Dropdowns */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Course dropdown */}
            <select
              value={selCourse || ''}
              onChange={e => setSelCourse(e.target.value || null)}
              style={{ ...dropdownStyle, maxWidth: 180 }}
            >
              <option value="">Course</option>
              {courses.map(c => (
                <option key={c.course_id} value={c.course_id}>
                  {c.title}
                </option>
              ))}
            </select>

            {/* Paper/Subject dropdown */}
            <select
              value={selPaper || ''}
              onChange={e => setSelPaper(parseInt(e.target.value) || null)}
              style={dropdownStyle}
              disabled={!selCourse}
            >
              <option value="">Select Subject</option>
              {filteredPapers.map(p => (
                <option key={p.paper_number} value={p.paper_number}>
                  Paper {p.paper_number}: {p.title}
                </option>
              ))}
            </select>

            {/* Chapter dropdown */}
            <select
              value={selChapter || ''}
              onChange={e => setSelChapter(parseInt(e.target.value) || null)}
              style={dropdownStyle}
              disabled={!selPaper}
            >
              <option value="">Chapter</option>
              {visibleChapters.map(ch => (
                <option key={ch.chapter_number} value={ch.chapter_number}>
                  Ch {ch.chapter_number}: {ch.title}
                </option>
              ))}
            </select>

            {/* Sub-chapter dropdown */}
            <select
              value={selSubChapter || ''}
              onChange={e => setSelSubChapter(e.target.value || null)}
              style={dropdownStyle}
              disabled={!selChapter}
            >
              <option value="">Sub-chapter</option>
              {filteredSubChapters.map(sc => (
                <option key={sc.sub_chapter_id} value={sc.sub_chapter_id}>
                  {sc.sub_chapter_id} {sc.title}
                </option>
              ))}
            </select>

            {/* Page dropdown */}
            <select
              value={selBookPage || ''}
              onChange={e => setSelBookPage(parseInt(e.target.value) || null)}
              style={{ ...dropdownStyle, width: 120 }}
              disabled={!selSubChapter}
            >
              <option value="">Page</option>
              {pageRange.map(pg => (
                <option key={pg} value={pg}>Page {pg}</option>
              ))}
            </select>
          </div>

          {/* Row 2: Page nav + breadcrumb */}
          {selBookPage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => goToPage('prev')} disabled={!hasPrev} style={navBtnStyle} className="disabled:opacity-30">
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                Page {selBookPage} of {pageRange.length > 0 ? `${pageRange[0]}–${pageRange[pageRange.length - 1]}` : '—'}
                <span style={{ marginLeft: 8, color: 'var(--text)', fontWeight: 600 }}>
                  {currentChapter ? `Ch ${currentChapter.chapter_number}: ${currentChapter.title}` : ''}
                </span>
              </span>
              <button onClick={() => goToPage('next')} disabled={!hasNext} style={navBtnStyle} className="disabled:opacity-30">
                Next →
              </button>
            </div>
          )}
        </div>

        {/* ── Paragraph List ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--bg)' }}>
          {!selBookPage ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 48 }}>📄</span>
                <p style={{ color: 'var(--text)', fontWeight: 500, marginTop: 12 }}>Select a chapter, sub-chapter, and page to start</p>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Use the dropdowns above to navigate</p>
              </div>
            </div>
          ) : (
            <>
              {/* Lock warning */}
              {lockHolder && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🔒</span>
                  <span style={{ fontSize: 13, color: '#92400E' }}><strong>{lockHolder}</strong> is editing this paragraph</span>
                </div>
              )}

              {/* Paragraph count */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {paragraphs.length} paragraph{paragraphs.length !== 1 ? 's' : ''} on this page
                </span>
              </div>

              {/* Paragraphs */}
              {paragraphs.map((para, idx) => {
                const isExpanded = expandedId === para.id
                const isImage = para.content_type === 'image'
                return (
                  <div key={para.id} style={{
                    background: 'white',
                    border: isExpanded ? '1px solid var(--accent)' : '1px solid #e5e7eb',
                    borderRadius: 8,
                    marginBottom: 4,
                    overflow: 'hidden',
                  }}>
                    {/* Compact row */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : para.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#0A2E28', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        {para.order_index}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {para.heading || para.concept_title || `Paragraph ${para.order_index}`}
                      </span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f0f0ec', color: 'var(--muted)', flexShrink: 0 }}>
                        {para.sub_chapter_id}
                      </span>
                      {isImage && <span title="Image" style={{ fontSize: 12 }}>📷</span>}
                      {para.tenglish && <span title="Generated" style={{ fontSize: 12 }}>🤖</span>}
                      <StatusBadge concept={para} />
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #f0f0ec', padding: 12 }}>
                        {/* Text preview */}
                        <div style={{ background: '#f9fafb', borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={para.text} alt="Screenshot" style={{ maxWidth: '100%', borderRadius: 6 }} />
                          ) : (
                            para.text
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button onClick={() => startEdit(para)} style={actionBtn('#E67E22', 'white')}>✏️ Edit</button>
                          <button onClick={() => moveParagraph(para.id, 'up')} disabled={idx === 0} style={actionBtn('#f3f4f6', 'var(--text)')}>↑</button>
                          <button onClick={() => moveParagraph(para.id, 'down')} disabled={idx === paragraphs.length - 1} style={actionBtn('#f3f4f6', 'var(--text)')}>↓</button>
                          <button onClick={() => moveToPage(para.id)} style={actionBtn('#eff6ff', '#2563eb')}>📄 Move</button>
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>pg {para.book_page}</span>
                          <button onClick={() => deleteParagraph(para.id)} style={actionBtn('#fef2f2', '#dc2626')}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add / Edit Form */}
              {showAddForm ? (
                <div style={{ background: 'white', border: '2px solid var(--accent)', borderRadius: 10, padding: 16, marginTop: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
                    {editingId ? '✏️ Edit Paragraph' : '➕ New Paragraph'}
                  </p>

                  {/* Heading */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Heading</label>
                    <input
                      value={form.heading}
                      onChange={e => setForm(p => ({ ...p, heading: e.target.value }))}
                      placeholder="e.g. Sources of Law, Introduction..."
                      style={inputStyle}
                      autoFocus
                    />
                  </div>

                  {/* Content type toggle */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    <button
                      onClick={() => setForm(p => ({ ...p, content_type: 'text', image_url: '' }))}
                      style={{
                        padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: form.content_type === 'text' ? 'var(--accent)' : '#f3f4f6',
                        color: form.content_type === 'text' ? 'white' : 'var(--text)',
                        border: 'none',
                      }}
                    >
                      📝 Text
                    </button>
                    <button
                      onClick={() => setForm(p => ({ ...p, content_type: 'image', text: '' }))}
                      style={{
                        padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: form.content_type === 'image' ? 'var(--accent)' : '#f3f4f6',
                        color: form.content_type === 'image' ? 'white' : 'var(--text)',
                        border: 'none',
                      }}
                    >
                      📷 Image
                    </button>
                  </div>

                  {/* Text area or Image paste zone */}
                  {form.content_type === 'text' ? (
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>Text (paste with formatting — lists/points preserved)</label>
                      <textarea
                        ref={textareaRef}
                        value={form.text}
                        onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
                        onPaste={handlePaste}
                        placeholder="Paste textbook content here...&#10;• Point 1&#10;• Point 2&#10;• Point 3"
                        rows={8}
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                      />
                    </div>
                  ) : (
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>Screenshot (Ctrl+V to paste image from clipboard)</label>
                      <div
                        onPaste={handlePaste}
                        tabIndex={0}
                        style={{
                          border: '2px dashed #d1d5db', borderRadius: 8, padding: 24,
                          textAlign: 'center', cursor: 'pointer', minHeight: 120,
                          background: form.image_url ? 'white' : '#f9fafb',
                          outline: 'none',
                        }}
                      >
                        {uploadingImage ? (
                          <div>
                            <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" style={{ margin: '0 auto 8px' }} />
                            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Uploading...</p>
                          </div>
                        ) : form.image_url ? (
                          <div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={form.image_url} alt="Pasted" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 6 }} />
                            <button
                              onClick={() => setForm(p => ({ ...p, image_url: '' }))}
                              style={{ marginTop: 8, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              Remove image
                            </button>
                          </div>
                        ) : (
                          <div>
                            <span style={{ fontSize: 32 }}>📋</span>
                            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Click here, then Ctrl+V to paste screenshot</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={cancelEdit} style={actionBtn('#f3f4f6', 'var(--text)')}>Cancel</button>
                    <button
                      onClick={saveParagraph}
                      disabled={saving || (!form.text.trim() && !form.image_url)}
                      style={{
                        ...actionBtn('var(--accent)', 'white'),
                        opacity: saving || (!form.text.trim() && !form.image_url) ? 0.5 : 1,
                      }}
                    >
                      {saving ? 'Saving...' : editingId ? 'Update Paragraph' : 'Save Paragraph'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setForm(emptyForm); setEditingId(null); setShowAddForm(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 16px', marginTop: 8,
                    background: 'var(--accent)', color: 'white',
                    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  + Add Paragraph
                </button>
              )}

              {/* Bottom nav */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
                <button onClick={() => goToPage('prev')} disabled={!hasPrev} style={{ ...navBtnStyle, opacity: hasPrev ? 1 : 0.3 }}>
                  ← Previous Page
                </button>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Page {selBookPage}
                </span>
                <button onClick={() => goToPage('next')} disabled={!hasNext} style={{ ...navBtnStyle, opacity: hasNext ? 1 : 0.3, background: hasNext ? 'var(--accent)' : '#f3f4f6', color: hasNext ? 'white' : 'var(--text)' }}>
                  Next Page →
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ Drag Handle ═══ */}
      <div
        onMouseDown={handleDragStart}
        style={{
          width: 6, cursor: 'col-resize', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: isDragging ? 'none' : 'background 0.2s',
        }}
        onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = '#d1d5db' }}
        onMouseLeave={e => { if (!isDragging) e.currentTarget.style.background = '#e5e7eb' }}
      >
        <div style={{ width: 2, height: 40, background: '#9ca3af', borderRadius: 2 }} />
      </div>

      {/* ═══ RIGHT: PDF Viewer ═══ */}
      <div style={{ width: pdfWidth, flexShrink: 0, overflow: 'auto', borderLeft: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
        {selBookPage ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
              <button
                onClick={() => setPdfPageOffset(p => p - 1)}
                disabled={displayBookPage <= 1}
                style={{ ...navBtnStyle, opacity: displayBookPage <= 1 ? 0.3 : 1, fontSize: 12 }}
              >
                ← Prev Page
              </button>
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                Book Page {displayBookPage}
                {pdfPageOffset !== 0 && (
                  <button
                    onClick={() => setPdfPageOffset(0)}
                    style={{ marginLeft: 4, fontSize: 10, color: '#E67E22', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Reset
                  </button>
                )}
              </span>
              <button onClick={() => setPdfPageOffset(p => p + 1)} style={{ ...navBtnStyle, fontSize: 12 }}>
                Next Page →
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <PDFViewer bookPage={displayBookPage} />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 14 }}>
            Select a page to see PDF
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ concept }: { concept: Concept }) {
  if (concept.is_verified || concept.review_status === 'approved')
    return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>Verified</span>
  if (concept.review_status === 'submitted')
    return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#dbeafe', color: '#2563eb', fontWeight: 600 }}>Submitted</span>
  if (concept.needs_work || concept.review_status === 'rejected')
    return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>Needs Work</span>
  return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#fef3c7', color: '#d97706', fontWeight: 600 }}>Draft</span>
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const dropdownStyle: React.CSSProperties = {
  flex: 1, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6,
  fontSize: 12, color: '#1A1208', background: 'white', outline: 'none', cursor: 'pointer',
  minWidth: 0,
}

const navBtnStyle: React.CSSProperties = {
  padding: '5px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb',
  borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6,
  fontSize: 13, outline: 'none', color: 'var(--text)', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4,
}

function actionBtn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '5px 12px', background: bg, color, border: 'none',
    borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}
