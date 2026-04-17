'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { acquireLock, releaseLock, incrementActivity } from '@/lib/concept-locks'
import type { AuthUser, AdminUser, Course, Paper, Chapter, SubChapter, ContentPage, Concept } from '@/lib/types'

declare global {
  interface Window {
    pdfjsLib: any
  }
}

const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

/** Same offset as `components/PDFViewer.tsx` — book display page → PDF.js page index */
const PDF_JS_OFFSET = 8

// ─── Types ───────────────────────────────────────────────────────────────────
interface ParagraphForm {
  heading: string
  text: string
  content_type: 'text' | 'image'
  image_url: string
}

const emptyForm: ParagraphForm = { heading: '', text: '', content_type: 'text', image_url: '' }

/** Smart-extract API row (concepts or legacy paragraphs key) */
interface SmartExtractConcept {
  concept_title?: string | null
  heading?: string | null
  content_type?: string
  text?: string
  is_key_concept?: boolean
  continues_from_previous?: boolean
  continues_on_next?: boolean
  order?: number
  book_page?: number | null
  image_url?: string | null
}

/** Preview row (editable before save) */
interface PreviewConcept extends SmartExtractConcept {
  id: string
  book_page?: number
  saved?: boolean
  needs_expert_review?: boolean
  escalation_note?: string | null
}

const DB_CONTENT_TYPES = new Set(['text', 'list', 'table', 'definition', 'image'])

function normalizeContentType(t: string | undefined): 'text' | 'list' | 'table' | 'definition' | 'image' {
  const s = String(t || 'text')
  if (s === 'diagram') return 'text'
  if (DB_CONTENT_TYPES.has(s)) return s as 'text' | 'list' | 'table' | 'definition' | 'image'
  if (s === 'formula' || s === 'example') return 'text'
  return 'text'
}

function previewNeedsImageUpload(c: PreviewConcept): boolean {
  const t = c.text || ''
  return c.content_type === 'image' || t.includes('[IMAGE_NEEDED')
}

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
  const [extractingPdf, setExtractingPdf] = useState(false)
  const extractCanvasRef = useRef<HTMLCanvasElement>(null)
  const [extractedPreview, setExtractedPreview] = useState<PreviewConcept[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [previewUploadingId, setPreviewUploadingId] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<'page' | 'escalated'>('page')
  const [escalatedConcepts, setEscalatedConcepts] = useState<(Concept & { creator_name?: string | null })[]>([])
  const [escalatedCount, setEscalatedCount] = useState(0)
  const [loadingEscalated, setLoadingEscalated] = useState(false)

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

  async function loadEscalated() {
    setLoadingEscalated(true)
    const { data, count } = await supabase
      .from('concepts')
      .select('*', { count: 'exact' })
      .eq('needs_expert_review', true)
      .order('escalated_at', { ascending: false })

    const rows = (data || []) as Concept[]
    const creatorIds = [...new Set(rows.map(c => c.created_by).filter(Boolean))] as string[]
    let nameMap: Record<string, string> = {}
    if (creatorIds.length > 0) {
      const { data: users } = await supabase.from('admin_users').select('id, name').in('id', creatorIds)
      if (users) nameMap = Object.fromEntries(users.map(u => [u.id as string, u.name as string]))
    }
    setEscalatedConcepts(
      rows.map(c => ({
        ...c,
        creator_name: c.created_by ? nameMap[c.created_by] ?? null : null,
      }))
    )
    setEscalatedCount(typeof count === 'number' ? count : rows.length)
    setLoadingEscalated(false)
  }

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'expert') {
      void supabase
        .from('concepts')
        .select('id', { count: 'exact', head: true })
        .eq('needs_expert_review', true)
        .then(({ count }) => setEscalatedCount(count ?? 0))
    }
  }, [user])

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

      const editedPara = editingId ? paragraphs.find(p => p.id === editingId) : null
      const clearingRejection =
        !!editedPara && (editedPara.needs_work || editedPara.review_status === 'rejected')

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
        text: form.content_type === 'image' ? (form.text.trim() || form.image_url || '') : form.text,
        image_url: form.content_type === 'image' ? (form.image_url || null) : null,
        is_key_concept: false,
        is_verified: false,
        needs_work: false,
        review_status: 'draft' as const,
        created_by: user.id,
        updated_at: new Date().toISOString(),
        ...(clearingRejection ? { rejection_note: null as string | null } : {}),
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

  function patchParagraph(id: string, patch: Partial<Pick<Concept, 'concept_title' | 'heading' | 'text' | 'content_type'>>) {
    setParagraphs(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)))
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
    const legacyImgUrl =
      para.content_type === 'image' && para.text?.startsWith('http') ? para.text : ''
    setForm({
      heading: para.heading || para.concept_title || '',
      text:
        para.content_type === 'image'
          ? para.image_url
            ? para.text && !para.text.startsWith('http')
              ? para.text
              : ''
            : para.text || ''
          : para.text || '',
      content_type: (para.content_type as 'text' | 'image') || 'text',
      image_url: para.image_url || legacyImgUrl || '',
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

  async function uploadPreviewConceptImage(conceptId: string, file: File | null | undefined) {
    if (!file?.type.startsWith('image/')) return
    setPreviewUploadingId(conceptId)
    try {
      const rawExt = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '')
      const ext = rawExt.slice(0, 5) || 'png'
      const path = `admin/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`
      const { error } = await supabase.storage
        .from('concept-images')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (error) {
        alert('Image upload failed: ' + error.message)
        return
      }
      const { data: urlData } = supabase.storage.from('concept-images').getPublicUrl(path)
      updatePreview(conceptId, 'image_url', urlData.publicUrl)
    } finally {
      setPreviewUploadingId(null)
    }
  }

  async function onPreviewCardPaste(conceptId: string, e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const f = item.getAsFile()
        if (f) await uploadPreviewConceptImage(conceptId, f)
        return
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

  function updatePreview(id: string, field: string, value: unknown) {
    setExtractedPreview(prev => prev.map(c => (c.id === id ? { ...c, [field]: value } : c)))
  }

  function deletePreview(id: string) {
    setExtractedPreview(prev => prev.filter(c => c.id !== id))
  }

  function movePreview(idx: number, direction: number) {
    setExtractedPreview(prev => {
      const arr = [...prev]
      const targetIdx = idx + direction
      if (targetIdx < 0 || targetIdx >= arr.length) return arr
      const temp = arr[idx]
      arr[idx] = arr[targetIdx]!
      arr[targetIdx] = temp!
      return arr
    })
  }

  function mergePreview(idx: number) {
    setExtractedPreview(prev => {
      const arr = [...prev]
      if (idx >= arr.length - 1) return arr
      const current = arr[idx]!
      const next = arr[idx + 1]!
      const merged: PreviewConcept = {
        ...current,
        text: `${current.text || ''}\n\n${next.text || ''}`,
        concept_title: current.concept_title || next.concept_title || null,
        is_key_concept: Boolean(current.is_key_concept || next.is_key_concept),
        image_url: current.image_url || next.image_url || null,
        id: `preview_merge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      }
      arr.splice(idx, 2, merged)
      return arr
    })
  }

  function splitPreview(idx: number) {
    setExtractedPreview(prev => {
      const arr = [...prev]
      const concept = arr[idx]
      if (!concept) return arr
      const text = concept.text || ''

      const matches = [...text.matchAll(/\n\n/g)]
      const newlines = matches.map(m => m.index).filter((i): i is number => typeof i === 'number')

      if (newlines.length === 0) {
        alert('No paragraph break found to split at. Add a blank line where you want to split, then try again.')
        return arr
      }

      const mid = Math.floor(text.length / 2)
      let bestSplit = newlines[0]!
      let bestDist = Math.abs(newlines[0]! - mid)
      for (const nl of newlines) {
        const dist = Math.abs(nl - mid)
        if (dist < bestDist) {
          bestDist = dist
          bestSplit = nl
        }
      }

      const part1 = text.slice(0, bestSplit).trim()
      const part2 = text.slice(bestSplit + 2).trim()

      const concept1: PreviewConcept = {
        ...concept,
        text: part1,
        id: `${concept.id}_a`,
      }
      const concept2: PreviewConcept = {
        ...concept,
        text: part2,
        concept_title: '',
        image_url: null,
        id: `${concept.id}_b`,
      }

      arr.splice(idx, 1, concept1, concept2)
      return arr
    })
  }

  async function saveAllPreviewed() {
    if (!selCourse || !selPaper || selChapter == null || !selSubChapter || !user) return

    setSaving(true)
    setSaveMsg('')

    try {
      const pendingPreview = extractedPreview.filter(c => !c.saved)
      const bookPages = [...new Set(pendingPreview.map(c => c.book_page ?? selBookPage ?? 0).filter(bp => bp > 0))]
      const nextOrder = new Map<number, number>()

      for (const bp of bookPages) {
        const { data: existingRows } = await supabase
          .from('concepts')
          .select('order_index')
          .eq('course_id', selCourse)
          .eq('paper_number', selPaper)
          .eq('chapter_number', selChapter)
          .eq('sub_chapter_id', selSubChapter)
          .eq('book_page', bp)
          .order('order_index', { ascending: false })
          .limit(1)
        nextOrder.set(bp, existingRows?.[0]?.order_index ?? 0)
      }

      let savedCount = 0
      for (const c of pendingPreview) {
        const bp = c.book_page ?? selBookPage
        if (bp == null) continue
        const cur = (nextOrder.get(bp) ?? 0) + 1
        nextOrder.set(bp, cur)
        const ct = normalizeContentType(c.content_type)
        const flagged = Boolean(c.needs_expert_review)
        const { error } = await supabase.from('concepts').insert({
          course_id: selCourse,
          paper_number: selPaper,
          chapter_number: selChapter,
          sub_chapter_id: selSubChapter,
          book_page: bp,
          order_index: cur,
          concept_title: c.concept_title || null,
          heading: c.heading || null,
          content_type: ct,
          text: c.text || '',
          image_url: c.image_url || null,
          is_key_concept: c.is_key_concept || false,
          is_verified: false,
          needs_work: false,
          review_status: flagged ? 'escalated' : 'draft',
          needs_expert_review: flagged,
          escalation_note: flagged ? (c.escalation_note || null) : null,
          escalated_by: flagged ? user.id : null,
          escalated_at: flagged ? new Date().toISOString() : null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        })
        if (!error) savedCount++
      }

      if (savedCount > 0) await incrementActivity(user.id, 'concepts_entered', savedCount)

      if (selBookPage) {
        await loadParagraphs(selCourse, selPaper, selChapter, selSubChapter, selBookPage)
      }
      setExtractedPreview([])
      setShowPreview(false)
      setBulkProgress('')
      setSaveMsg(`Saved ${savedCount} concepts!`)
    } catch (err: unknown) {
      setSaveMsg('Error: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function extractFromPdf() {
    if (!selBookPage || !selCourse || !selPaper || selChapter == null || !selSubChapter || !user) return
    setExtractingPdf(true)

    try {
      const paper = papers.find(p => p.course_id === selCourse && p.paper_number === selPaper)
      if (!paper?.pdf_url) throw new Error('No PDF URL for this paper')

      if (!window.pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
          script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
            resolve()
          }
          script.onerror = reject
          document.head.appendChild(script)
        })
      }

      const doc = await window.pdfjsLib.getDocument(paper.pdf_url).promise
      const displayed = selBookPage + pdfPageOffset
      const pdfPageNum = Math.min(Math.max(1, displayed + PDF_JS_OFFSET), doc.numPages)
      const page = await doc.getPage(pdfPageNum)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = extractCanvasRef.current
      if (!canvas) throw new Error('Canvas not ready')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context missing')
      await page.render({ canvasContext: ctx, viewport }).promise
      const base64 = canvas.toDataURL('image/png').split(',')[1]

      const res = await fetch('/api/smart-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          media_type: 'image/png',
          book_page: selBookPage,
          context: {
            paper_title: paper.title,
            chapter_title: currentChapter?.title,
            sub_chapter_title: subChapters.find(
              sc =>
                sc.sub_chapter_id === selSubChapter &&
                sc.course_id === selCourse &&
                sc.paper_number === selPaper &&
                sc.chapter_number === selChapter
            )?.title,
          },
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error || 'Extraction failed')
      }

      const data = (await res.json()) as {
        success?: boolean
        page_number?: number | null
        concepts?: SmartExtractConcept[]
        paragraphs?: SmartExtractConcept[]
      }

      const rows = [...(data.concepts ?? data.paragraphs ?? [])]
      if (rows.length === 0) {
        alert('No content found on this page')
        return
      }

      const baseId = Date.now()
      const concepts: PreviewConcept[] = rows.map((p, i) => ({
        ...p,
        order: i + 1,
        book_page: selBookPage,
        id: `preview_${baseId}_${i}`,
        text: p.text ?? '',
      }))

      setExtractedPreview(prev => [...prev, ...concepts])
      setShowPreview(true)
      setBulkProgress('')
    } catch (err: unknown) {
      alert('Extract failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExtractingPdf(false)
    }
  }

  async function extractSubChapter() {
    if (!selCourse || !selPaper || selChapter == null || !selSubChapter || !user) return
    setExtractingPdf(true)
    setBulkProgress('Starting…')
    setSaveMsg('')

    try {
      const paper = papers.find(p => p.course_id === selCourse && p.paper_number === selPaper)
      if (!paper?.pdf_url) throw new Error('No PDF URL for this paper')

      if (!window.pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
          script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
            resolve()
          }
          script.onerror = reject
          document.head.appendChild(script)
        })
      }

      const doc = await window.pdfjsLib.getDocument(paper.pdf_url).promise
      const sc = subChapters.find(
        s =>
          s.course_id === selCourse &&
          s.paper_number === selPaper &&
          s.chapter_number === selChapter &&
          s.sub_chapter_id === selSubChapter
      )

      let pagesLoop = [...pageRange]
      if (sc?.start_book_page != null && sc?.end_book_page != null) {
        const startPg = sc.start_book_page
        const endPg = sc.end_book_page
        pagesLoop = pageRange.filter(pg => pg >= startPg && pg <= endPg)
      }
      if (pagesLoop.length === 0) {
        alert('No pages in range for this sub-chapter')
        return
      }

      const canvas = extractCanvasRef.current
      if (!canvas) throw new Error('Canvas not ready')

      let acc: PreviewConcept[] = [...extractedPreview]
      let globalOrder = acc.length

      for (const pg of pagesLoop) {
        setBulkProgress(`Reading page ${pg}…`)

        const displayed = pg + pdfPageOffset
        const pdfPageNum = Math.min(Math.max(1, displayed + PDF_JS_OFFSET), doc.numPages)
        const pdfPage = await doc.getPage(pdfPageNum)
        const viewport = pdfPage.getViewport({ scale: 2 })
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context missing')
        await pdfPage.render({ canvasContext: ctx, viewport }).promise
        const base64 = canvas.toDataURL('image/png').split(',')[1]

        const res = await fetch('/api/smart-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: base64,
            media_type: 'image/png',
            book_page: pg,
            context: {
              paper_title: paper.title,
              chapter_title: currentChapter?.title,
              sub_chapter_title: sc?.title,
            },
          }),
        })

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error((errBody as { error?: string }).error || `Extraction failed for page ${pg}`)
        }

        const data = (await res.json()) as {
          concepts?: SmartExtractConcept[]
          paragraphs?: SmartExtractConcept[]
        }
        const raw = [...(data.concepts ?? data.paragraphs ?? [])]

        let batchConcepts: PreviewConcept[] = raw.map((c, i) => ({
          ...c,
          order: globalOrder + i + 1,
          book_page: c.book_page ?? pg,
          id: `preview_${Date.now()}_${pg}_${i}_${Math.random().toString(36).slice(2, 9)}`,
          text: c.text ?? '',
        }))

        if (batchConcepts[0]?.continues_from_previous && acc.length > 0) {
          const last = { ...acc[acc.length - 1]! }
          last.text = `${last.text || ''}\n\n${batchConcepts[0].text || ''}`
          last.concept_title = last.concept_title || batchConcepts[0].concept_title || null
          acc = [...acc.slice(0, -1), last, ...batchConcepts.slice(1)]
        } else {
          acc = [...acc, ...batchConcepts]
        }
        globalOrder = acc.length
      }

      setExtractedPreview(acc)
      setShowPreview(true)
      setBulkProgress(`Extracted ${acc.length} concepts — review below`)
    } catch (err: unknown) {
      alert('Sub-chapter extract failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExtractingPdf(false)
    }
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
      <canvas ref={extractCanvasRef} style={{ display: 'none' }} />

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

        {(user?.role === 'admin' || user?.role === 'expert') && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, paddingLeft: 16, paddingRight: 16, paddingTop: 4, background: 'white', borderBottom: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={() => setViewMode('page')}
              style={{
                padding: '6px 16px', borderRadius: 6, fontSize: 12,
                fontWeight: viewMode === 'page' ? 700 : 400,
                background: viewMode === 'page' ? '#071739' : '#f3f4f6',
                color: viewMode === 'page' ? '#E3C39D' : '#6b7280',
                border: 'none', cursor: 'pointer',
              }}
            >
              Page View
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('escalated')
                void loadEscalated()
              }}
              style={{
                padding: '6px 16px', borderRadius: 6, fontSize: 12,
                fontWeight: viewMode === 'escalated' ? 700 : 400,
                background: viewMode === 'escalated' ? '#D97706' : '#f3f4f6',
                color: viewMode === 'escalated' ? '#fff' : '#6b7280',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              ⚠ COE Review
              {escalatedCount > 0 && (
                <span style={{
                  background: 'rgba(255,255,255,0.3)', padding: '1px 6px',
                  borderRadius: 10, fontSize: 10, fontWeight: 700,
                }}>
                  {escalatedCount}
                </span>
              )}
            </button>
          </div>
        )}

        {viewMode === 'page' ? (
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
                const isRejected = !!(para.needs_work || para.review_status === 'rejected')
                const isEscalated = !!para.needs_expert_review
                return (
                  <div key={para.id} style={{
                    background: isRejected ? '#FFFBFB' : isEscalated ? '#FFFDF5' : 'white',
                    border: isExpanded ? '1px solid var(--accent)' : '1px solid #e5e7eb',
                    borderLeft: isRejected ? '4px solid #DC2626' : isEscalated ? '4px solid #D97706' : 'none',
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
                      <button
                        type="button"
                        onClick={async e => {
                          e.stopPropagation()
                          const row = paragraphs.find(p => p.id === para.id) ?? para
                          const { error } = await supabase.from('concepts').update({
                            concept_title: row.concept_title,
                            text: row.text,
                            heading: row.heading,
                            content_type: row.content_type,
                            updated_at: new Date().toISOString(),
                          }).eq('id', para.id)
                          if (!error) alert('Saved!')
                          else alert('Save failed: ' + error.message)
                        }}
                        style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 10,
                          fontWeight: 600, cursor: 'pointer',
                          background: '#071739', color: '#E3C39D', border: 'none',
                          flexShrink: 0,
                        }}
                      >
                        Save
                      </button>
                      {!para.needs_expert_review && (
                        <button
                          type="button"
                          onClick={async e => {
                            e.stopPropagation()
                            const note = window.prompt('What needs expert review?')
                            if (!note || !user) return
                            await supabase.from('concepts').update({
                              needs_expert_review: true,
                              escalation_note: note,
                              escalated_by: user.id,
                              escalated_at: new Date().toISOString(),
                              review_status: 'escalated',
                            }).eq('id', para.id)
                            if (selCourse && selPaper != null && selChapter != null && selSubChapter && selBookPage != null) {
                              await loadParagraphs(selCourse, selPaper, selChapter, selSubChapter, selBookPage)
                            }
                          }}
                          style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 10,
                            fontWeight: 600, cursor: 'pointer',
                            background: '#FEF3C7', color: '#D97706', border: 'none',
                            flexShrink: 0,
                          }}
                        >
                          ⚠
                        </button>
                      )}
                      <StatusBadge concept={para} />
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #f0f0ec', padding: 12 }}>
                        {isRejected && (
                          <div style={{
                            padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                            background: '#FEF2F2', border: '1.5px solid #FECACA',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>
                                ✗ Rejected by reviewer
                              </span>
                            </div>
                            {para.rejection_note && (
                              <p style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.5 }}>
                                {para.rejection_note}
                              </p>
                            )}
                            <p style={{ fontSize: 10, color: '#DC2626', opacity: 0.6, marginTop: 4 }}>
                              Compare with PDF on the right → Edit → Resubmit
                            </p>
                          </div>
                        )}
                        {isEscalated && (
                          <div style={{
                            padding: '6px 10px', borderRadius: 6, marginBottom: 10,
                            background: '#FEF3C7', border: '1px solid #FDE68A',
                            fontSize: 11, color: '#92400E',
                          }}>
                            <strong>⚠ Flagged for expert review</strong>
                            {para.escalation_note && (
                              <span style={{ marginLeft: 6, opacity: 0.8 }}>
                                — {para.escalation_note}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Inline edit fields */}
                        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div>
                            <label style={{ ...labelStyle, marginBottom: 2 }}>Concept title</label>
                            <input
                              value={para.concept_title || ''}
                              onChange={e => patchParagraph(para.id, { concept_title: e.target.value })}
                              onClick={e => e.stopPropagation()}
                              placeholder="Concept title"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={{ ...labelStyle, marginBottom: 2 }}>Heading</label>
                            <input
                              value={para.heading || ''}
                              onChange={e => patchParagraph(para.id, { heading: e.target.value })}
                              onClick={e => e.stopPropagation()}
                              placeholder="Section heading (optional)"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={{ ...labelStyle, marginBottom: 2 }}>Content type</label>
                            <select
                              value={para.content_type || 'text'}
                              onChange={e =>
                                patchParagraph(para.id, {
                                  content_type: e.target.value as Concept['content_type'],
                                })}
                              onClick={e => e.stopPropagation()}
                              style={inputStyle}
                            >
                              <option value="text">text</option>
                              <option value="list">list</option>
                              <option value="table">table</option>
                              <option value="definition">definition</option>
                              <option value="image">image</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ ...labelStyle, marginBottom: 2 }}>Text / body</label>
                            {isImage ? (
                              <div onClick={e => e.stopPropagation()}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={para.image_url || para.text}
                                  alt="Concept"
                                  style={{ maxWidth: '100%', borderRadius: 6, marginBottom: 8 }}
                                />
                                <textarea
                                  value={para.text}
                                  onChange={e => patchParagraph(para.id, { text: e.target.value })}
                                  onClick={e => e.stopPropagation()}
                                  placeholder="Image URL or caption"
                                  rows={3}
                                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                />
                              </div>
                            ) : (
                              <textarea
                                value={para.text}
                                onChange={e => patchParagraph(para.id, { text: e.target.value })}
                                onClick={e => e.stopPropagation()}
                                rows={8}
                                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Actions — Edit | ↑ | ↓ | Move | Delete (Save + ⚠ live in collapsed header) */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button type="button" onClick={e => { e.stopPropagation(); startEdit(para) }} style={actionBtn('#E67E22', 'white')}>✎ Edit</button>
                          <button type="button" onClick={e => { e.stopPropagation(); void moveParagraph(para.id, 'up') }} disabled={idx === 0} style={actionBtn('#f3f4f6', 'var(--text)')}>↑</button>
                          <button type="button" onClick={e => { e.stopPropagation(); void moveParagraph(para.id, 'down') }} disabled={idx === paragraphs.length - 1} style={actionBtn('#f3f4f6', 'var(--text)')}>↓</button>
                          <button type="button" onClick={e => { e.stopPropagation(); void moveToPage(para.id) }} style={actionBtn('#eff6ff', '#2563eb')}>↪ Move</button>
                          <button type="button" onClick={e => { e.stopPropagation(); void deleteParagraph(para.id) }} style={actionBtn('#fef2f2', '#dc2626')}>✕ Delete</button>
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>pg {para.book_page}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {saveMsg && (
                <div style={{ fontSize: 12, color: saveMsg.startsWith('Error') ? '#dc2626' : '#059669', marginBottom: 8 }}>
                  {saveMsg}
                </div>
              )}

              {bulkProgress && (
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{bulkProgress}</div>
              )}

              {showPreview && extractedPreview.length > 0 && (
                <div style={{
                  marginTop: 16, padding: 16, background: '#f8f7f4',
                  borderRadius: 12, border: '2px solid #071739',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#071739', marginBottom: 2 }}>
                        Review Extracted Content
                      </h3>
                      <p style={{ fontSize: 11, color: '#6b7280' }}>
                        {extractedPreview.length} concepts · Edit titles, text, or delete before saving
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => { setExtractedPreview([]); setShowPreview(false); setBulkProgress(''); setSaveMsg('') }}
                        style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}
                      >
                        Discard All
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveAllPreviewed()}
                        disabled={saving}
                        style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#071739', color: '#E3C39D', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
                      >
                        Save All ({extractedPreview.length}) to DB
                      </button>
                    </div>
                  </div>

                  {extractedPreview.map((concept, idx) => (
                    <div
                      key={concept.id}
                      onPaste={e => { void onPreviewCardPaste(concept.id, e) }}
                      style={{
                        padding: 14, marginBottom: 10, borderRadius: 10,
                        background: '#fff', border: '1px solid #e5e7eb',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: '#071739', opacity: 0.12, minWidth: 28, fontFamily: 'Georgia, serif' }}>
                          {idx + 1}
                        </span>
                        <div style={{ flex: 1 }}>
                          <input
                            value={concept.concept_title || ''}
                            onChange={e => updatePreview(concept.id, 'concept_title', e.target.value)}
                            placeholder="Concept title — make it meaningful for students"
                            style={{
                              width: '100%', fontSize: 14, fontWeight: 600, border: 'none',
                              outline: 'none', color: '#071739', background: 'transparent',
                              borderBottom: '1.5px solid #e5e7eb', paddingBottom: 4,
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>Pg {concept.book_page ?? '—'}</span>
                            <select
                              value={concept.content_type || 'text'}
                              onChange={e => updatePreview(concept.id, 'content_type', e.target.value)}
                              style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #e5e7eb', color: '#6b7280', background: '#fff' }}
                            >
                              <option value="text">Text</option>
                              <option value="definition">Definition</option>
                              <option value="list">List</option>
                              <option value="table">Table</option>
                              <option value="diagram">Diagram (Mermaid)</option>
                              <option value="formula">Formula</option>
                              <option value="example">Example</option>
                              <option value="image">Image</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => updatePreview(concept.id, 'is_key_concept', !concept.is_key_concept)}
                              style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                                background: concept.is_key_concept ? '#fef3c7' : '#f3f4f6',
                                color: concept.is_key_concept ? '#d97706' : '#9ca3af',
                                border: 'none', fontWeight: 600,
                              }}
                            >
                              {concept.is_key_concept ? '★ Key' : '☆ Key'}
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!selCourse || selPaper == null || selChapter == null || !selSubChapter || !user || selBookPage == null) return
                              const c = concept
                              if (c.saved) return
                              const existingCount = paragraphs.length
                              const ct = normalizeContentType(c.content_type)
                              const flagged = Boolean(c.needs_expert_review)
                              const { error } = await supabase.from('concepts').insert({
                                course_id: selCourse,
                                paper_number: selPaper,
                                chapter_number: selChapter,
                                sub_chapter_id: selSubChapter,
                                book_page: c.book_page ?? selBookPage,
                                order_index: existingCount + 1,
                                concept_title: c.concept_title || null,
                                heading: c.heading || null,
                                content_type: ct,
                                text: c.text || '',
                                is_key_concept: c.is_key_concept || false,
                                image_url: c.image_url || null,
                                created_by: user.id,
                                is_verified: false,
                                needs_work: false,
                                review_status: flagged ? 'escalated' : 'draft',
                                needs_expert_review: flagged,
                                escalation_note: flagged ? (c.escalation_note || null) : null,
                                escalated_by: flagged ? user.id : null,
                                escalated_at: flagged ? new Date().toISOString() : null,
                                updated_at: new Date().toISOString(),
                              })
                              if (!error) {
                                updatePreview(concept.id, 'saved', true)
                                await loadParagraphs(selCourse, selPaper, selChapter, selSubChapter, selBookPage)
                              } else {
                                alert('Save failed: ' + error.message)
                              }
                            }}
                            disabled={!!concept.saved}
                            title="Save this concept"
                            style={{
                              padding: '4px 10px', height: 26, borderRadius: 6,
                              border: concept.saved ? '1px solid #16a34a' : '1px solid #071739',
                              background: concept.saved ? '#f0fdf4' : '#071739',
                              cursor: concept.saved ? 'default' : 'pointer',
                              fontSize: 9, fontWeight: 700,
                              color: concept.saved ? '#16a34a' : '#E3C39D',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {concept.saved ? '✓ Saved' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const note = window.prompt('Flag note:')
                              if (note) {
                                setExtractedPreview(prev =>
                                  prev.map(x =>
                                    x.id === concept.id
                                      ? { ...x, needs_expert_review: true, escalation_note: note }
                                      : x
                                  )
                                )
                              }
                            }}
                            title="Flag for expert review"
                            style={{
                              width: 26, height: 26, borderRadius: 6,
                              border: '1px solid #FDE68A',
                              background: concept.needs_expert_review ? '#FEF3C7' : '#fff',
                              cursor: 'pointer', fontSize: 11, color: '#D97706',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            ⚠
                          </button>
                          <button type="button" onClick={() => movePreview(idx, -1)} disabled={idx === 0}
                            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 11, opacity: idx === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↑</button>
                          <button type="button" onClick={() => movePreview(idx, 1)} disabled={idx === extractedPreview.length - 1}
                            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 11, opacity: idx === extractedPreview.length - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↓</button>
                          {idx < extractedPreview.length - 1 && (
                            <button type="button" onClick={() => mergePreview(idx)}
                              title="Merge with next concept"
                              style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⊕</button>
                          )}
                          <button type="button" onClick={() => splitPreview(idx)}
                            title="Split at cursor position"
                            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✂</button>
                          <button type="button" onClick={() => deletePreview(concept.id)}
                            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer', fontSize: 11, color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>
                      </div>

                      {(previewNeedsImageUpload(concept) || concept.image_url) && (
                        <div
                          style={{
                            marginBottom: 10,
                            padding: 10,
                            borderRadius: 8,
                            background: '#f0f4ff',
                            border: '1px dashed #4B6382',
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#071739', marginBottom: 6 }}>
                            Concept image
                          </div>
                          <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 8px' }}>
                            Paste an image here or choose a file — uploads to Supabase bucket <code style={{ fontSize: 9 }}>concept-images</code>
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <label
                              style={{
                                padding: '6px 12px',
                                borderRadius: 6,
                                background: '#071739',
                                color: '#E3C39D',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: previewUploadingId === concept.id ? 'wait' : 'pointer',
                                opacity: previewUploadingId === concept.id ? 0.6 : 1,
                              }}
                            >
                              {previewUploadingId === concept.id ? 'Uploading…' : 'Choose image'}
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                disabled={previewUploadingId === concept.id}
                                onChange={e => {
                                  const f = e.target.files?.[0]
                                  if (f) void uploadPreviewConceptImage(concept.id, f)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>or paste while this card is focused</span>
                          </div>
                          {concept.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={concept.image_url}
                              alt={concept.concept_title || 'Uploaded concept'}
                              style={{
                                width: '100%',
                                maxHeight: 220,
                                objectFit: 'contain',
                                borderRadius: 8,
                                marginTop: 10,
                                border: '1px solid rgba(7,23,57,0.08)',
                                background: '#fff',
                              }}
                            />
                          ) : null}
                        </div>
                      )}

                      <textarea
                        value={concept.text}
                        onChange={e => updatePreview(concept.id, 'text', e.target.value)}
                        rows={Math.min(10, Math.max(3, (concept.text || '').split('\n').length + 1))}
                        style={{
                          width: '100%', fontSize: 12, lineHeight: 1.7, color: '#1f2937',
                          border: '1px solid #f3f4f6', borderRadius: 8, padding: 10,
                          resize: 'vertical', outline: 'none', background: '#fafaf8',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      {extractedPreview.length} concepts ready to save
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => { setExtractedPreview([]); setShowPreview(false); setBulkProgress(''); setSaveMsg('') }}
                        style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer' }}
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveAllPreviewed()}
                        disabled={saving}
                        style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#071739', color: '#E3C39D', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
                      >
                        Save All to Database
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => { setForm(emptyForm); setEditingId(null); setShowAddForm(true) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 16px',
                      background: 'var(--accent)', color: 'white',
                      border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    + Add Paragraph
                  </button>
                  <button
                    type="button"
                    onClick={() => void extractFromPdf()}
                    disabled={!selBookPage || extractingPdf}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 16px',
                      background: '#071739', color: '#E3C39D',
                      border: 'none', borderRadius: 8, fontSize: 13,
                      fontWeight: 600, cursor: 'pointer',
                      opacity: !selBookPage || extractingPdf ? 0.4 : 1,
                    }}
                  >
                    {extractingPdf ? 'Claude is reading...' : 'Extract from PDF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void extractSubChapter()}
                    disabled={!selSubChapter || extractingPdf}
                    title="Extract every page in this sub-chapter into the review panel"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 16px',
                      background: '#0A2E28', color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 12,
                      fontWeight: 600, cursor: 'pointer',
                      opacity: !selSubChapter || extractingPdf ? 0.4 : 1,
                    }}
                  >
                    {extractingPdf ? '…' : 'Extract sub-chapter'}
                  </button>
                </div>
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
        ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--bg)' }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#D97706' }}>
              ⚠ COE Review — Escalated Concepts
            </h2>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Concepts flagged by interns that need expert/admin decision
            </p>
          </div>

          {loadingEscalated ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
              Loading...
            </div>
          ) : escalatedConcepts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>
                No escalated concepts
              </p>
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                All clear — no items need expert review
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {escalatedConcepts.map(concept => (
                <div key={concept.id} style={{
                  padding: 16, borderRadius: 12,
                  background: '#FFFDF5',
                  border: '1.5px solid #FDE68A',
                  borderLeft: '4px solid #D97706',
                }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#071739', color: '#E3C39D', fontWeight: 600 }}>
                      P{concept.paper_number}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280', fontWeight: 500 }}>
                      Ch {concept.chapter_number}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280', fontWeight: 500 }}>
                      {concept.sub_chapter_id}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280', fontWeight: 500 }}>
                      Pg {concept.book_page}
                    </span>
                    <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>
                      by {concept.creator_name || 'Unknown'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 14, fontWeight: 600, color: '#071739', marginBottom: 4 }}>
                    {concept.concept_title || 'Untitled'}
                  </h3>

                  <div style={{ padding: '8px 12px', borderRadius: 8, background: '#FEF3C7', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706' }}>INTERN NOTE: </span>
                    <span style={{ fontSize: 12, color: '#92400E' }}>{concept.escalation_note || '—'}</span>
                  </div>

                  <div style={{
                    fontSize: 12, color: '#374151', lineHeight: 1.7,
                    maxHeight: 120, overflow: 'hidden',
                    background: '#fff', padding: 10, borderRadius: 8,
                    border: '1px solid #f3f4f6',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {concept.text}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelCourse(concept.course_id)
                        setSelPaper(concept.paper_number)
                        setSelChapter(concept.chapter_number)
                        setSelSubChapter(concept.sub_chapter_id)
                        setSelBookPage(concept.book_page)
                        setViewMode('page')
                      }}
                      style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151' }}
                    >
                      View with PDF →
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) return
                        await supabase.from('concepts').update({
                          needs_expert_review: false,
                          escalation_note: null,
                          escalated_by: null,
                          escalated_at: null,
                          is_verified: true,
                          verified_by: user.id,
                          verified_at: new Date().toISOString(),
                          review_status: 'approved',
                        }).eq('id', concept.id)
                        void loadEscalated()
                      }}
                      style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer' }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const note = window.prompt('Rejection reason:')
                        if (!note) return
                        await supabase.from('concepts').update({
                          needs_expert_review: false,
                          escalation_note: null,
                          escalated_by: null,
                          escalated_at: null,
                          needs_work: true,
                          rejection_note: note,
                          review_status: 'rejected',
                        }).eq('id', concept.id)
                        void loadEscalated()
                      }}
                      style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer' }}
                    >
                      ✗ Reject
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase.from('concepts').update({
                          needs_expert_review: false,
                          escalation_note: null,
                          escalated_by: null,
                          escalated_at: null,
                          review_status: 'draft',
                        }).eq('id', concept.id)
                        void loadEscalated()
                      }}
                      style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#6b7280' }}
                    >
                      Clear Flag
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
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
              <PDFViewer bookPage={displayBookPage} pdfUrl={papers.find(p => p.course_id === selCourse && p.paper_number === selPaper)?.pdf_url || undefined} />
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
  if (concept.needs_expert_review)
    return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#FEF3C7', color: '#D97706', fontWeight: 600 }}>Escalated</span>
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
