import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ImportConcept {
  paper?: number
  paper_number?: number
  chapter?: number
  chapter_number?: number
  sub_chapter?: string
  sub_chapter_id?: string
  book_page: number
  concept_title: string
  text: string
  heading?: string
  content_type?: 'text' | 'list' | 'table' | 'definition'
  is_key_concept?: boolean
  order_index?: number
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { concepts, created_by, course_id = 'cma' } = body as {
      concepts: ImportConcept[]
      created_by: string
      course_id?: string
    }

    if (!concepts || !Array.isArray(concepts) || concepts.length === 0) {
      return NextResponse.json({ error: 'No concepts provided' }, { status: 400 })
    }

    if (!created_by) {
      return NextResponse.json({ error: 'created_by is required' }, { status: 400 })
    }

    // Validate each concept
    const errors: string[] = []
    const rows = concepts.map((c, i) => {
      const paper = c.paper ?? c.paper_number
      const chapter = c.chapter ?? c.chapter_number
      const subChapter = c.sub_chapter ?? c.sub_chapter_id

      if (!paper) errors.push(`Row ${i + 1}: missing paper number`)
      if (!chapter) errors.push(`Row ${i + 1}: missing chapter number`)
      if (!subChapter) errors.push(`Row ${i + 1}: missing sub_chapter`)
      if (!c.book_page) errors.push(`Row ${i + 1}: missing book_page`)
      if (!c.text?.trim()) errors.push(`Row ${i + 1}: missing text`)

      return {
        course_id,
        paper_number: paper,
        chapter_number: chapter,
        sub_chapter_id: subChapter,
        book_page: c.book_page,
        order_index: c.order_index || i + 1,
        concept_title: c.concept_title || null,
        heading: c.heading || null,
        content_type: c.content_type || 'text',
        text: c.text,
        is_key_concept: c.is_key_concept || false,
        is_verified: false,
        needs_work: false,
        review_status: 'draft',
        created_by,
        updated_at: new Date().toISOString(),
      }
    })

    if (errors.length > 0) {
      return NextResponse.json({
        error: 'Validation failed',
        details: errors.slice(0, 20), // Show first 20 errors
        total_errors: errors.length,
      }, { status: 400 })
    }

    // Ensure content_pages exist for each unique page
    const uniquePages = new Map<string, { course_id: string; paper_number: number; chapter_number: number; sub_chapter_id: string; book_page: number }>()
    for (const row of rows) {
      const key = `${row.course_id}|${row.paper_number}|${row.chapter_number}|${row.sub_chapter_id}|${row.book_page}`
      if (!uniquePages.has(key)) {
        uniquePages.set(key, {
          course_id: row.course_id!,
          paper_number: row.paper_number!,
          chapter_number: row.chapter_number!,
          sub_chapter_id: row.sub_chapter_id!,
          book_page: row.book_page!,
        })
      }
    }

    // Upsert content_pages (ignore if already exists)
    for (const page of uniquePages.values()) {
      await supabase.from('content_pages').upsert({
        ...page,
        pdf_page: page.book_page + 8,
        status: 'in_progress',
      }, {
        onConflict: 'course_id,paper_number,chapter_number,book_page',
      })
    }

    // Batch insert concepts (in chunks of 50)
    const CHUNK_SIZE = 50
    let inserted = 0
    let failed = 0
    const insertErrors: string[] = []

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE)
      const { error } = await supabase.from('concepts').insert(chunk)
      if (error) {
        failed += chunk.length
        insertErrors.push(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`)
      } else {
        inserted += chunk.length
      }
    }

    // Update content_pages total_concepts counts
    for (const page of uniquePages.values()) {
      const { count } = await supabase
        .from('concepts')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', page.course_id)
        .eq('paper_number', page.paper_number)
        .eq('chapter_number', page.chapter_number)
        .eq('sub_chapter_id', page.sub_chapter_id)
        .eq('book_page', page.book_page)

      if (count !== null) {
        await supabase
          .from('content_pages')
          .update({ total_concepts: count })
          .eq('course_id', page.course_id)
          .eq('paper_number', page.paper_number)
          .eq('chapter_number', page.chapter_number)
          .eq('book_page', page.book_page)
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      failed,
      total: rows.length,
      pages_created: uniquePages.size,
      errors: insertErrors.length > 0 ? insertErrors : undefined,
    })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Import failed',
    }, { status: 500 })
  }
}
