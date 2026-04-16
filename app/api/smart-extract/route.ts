import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const EXTRACT_PROMPT = `You are extracting content from an ICMAI CMA Foundation textbook page for a study app called SOMI.

TASK: Look at this textbook page image and extract content as CONCEPTS — not individual paragraphs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT IS A "CONCEPT"?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A concept is ONE complete idea that a student would study as a unit. Examples:
- "Essential Elements of a Valid Contract" (heading + 6 points under it = ONE concept)
- "Difference between Void and Voidable Agreements" (comparison table = ONE concept)
- "Section 10 of Indian Contract Act" (definition + explanation = ONE concept)
- "Types of Consideration" (heading + 3 types with descriptions = ONE concept)

A concept is NOT:
- A single sentence
- One bullet point from a list
- A heading by itself without content
- A page header or footer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GROUPING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. If a heading has points/paragraphs under it → GROUP them as ONE concept
2. If a definition is followed by its explanation → ONE concept
3. If a comparison lists multiple items → ONE concept (include all items)
4. If numbered points (1, 2, 3...) explain ONE topic → ONE concept
5. If a table explains a topic → the table + any intro text = ONE concept
6. If a formula is followed by an example → ONE concept

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPT TITLES — THIS IS CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each concept MUST have a clear, meaningful title that a student would recognize.

GOOD titles:
- "Essential Elements of a Valid Contract"
- "Difference between Offer and Invitation to Offer"
- "Rights of an Unpaid Seller under Sale of Goods Act"
- "Section 10 — What Agreements are Contracts"
- "Types of Consideration with Examples"
- "Rules for Communication of Acceptance"

BAD titles:
- "Introduction" (too vague)
- "Points" (meaningless)
- "Paragraph 3" (not a concept)
- "Continued..." (not helpful)
- "Table 1" (describe WHAT the table shows)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CROSS-PAGE CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- If the page STARTS mid-sentence or mid-concept (no heading at top), 
  mark the first concept with "continues_from_previous": true
  and title it based on what the content is about (read and understand it)
- If the page ENDS mid-concept, mark the last concept with 
  "continues_on_next": true

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEXT EXTRACTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Extract EXACT text — do NOT summarize or paraphrase
- For tables: convert to markdown table format
- For formulas: write as plain text (e.g., "Prime Cost = Direct Material + Direct Labour + Direct Expenses")
- For diagrams/flowcharts: describe as "[DIAGRAM: Flowchart showing classification of contracts into Express, Implied, and Quasi contracts]"
- Keep Section references (Section 2, Section 10, etc.)
- Keep legal citations exactly as written
- Include examples if present on the page
- Do NOT include page headers, footers, or page numbers

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — respond ONLY with this JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "concepts": [
    {
      "order": 1,
      "concept_title": "Essential Elements of a Valid Contract",
      "heading": "section heading if this starts a new section, else null",
      "content_type": "text|definition|table|formula|list|example",
      "text": "the complete extracted text for this concept — include ALL related paragraphs, points, and examples as one block",
      "is_key_concept": true,
      "continues_from_previous": false,
      "continues_on_next": false
    }
  ]
}

IMPORTANT: Fewer, richer concepts is BETTER than many tiny paragraphs. 
A page typically has 2-5 concepts, NOT 10-15 paragraphs.`

type ExtractContext = {
  paper_title?: string
  chapter_title?: string
  sub_chapter_title?: string
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
    }

    const body = await req.json()
    const image_base64 = body.image_base64 as string | undefined
    const media_type = (body.media_type as string) || 'image/png'
    const book_page = body.book_page as number | undefined
    const context = (body.context || {}) as ExtractContext

    if (!image_base64) {
      return NextResponse.json({ error: 'image_base64 is required' }, { status: 400 })
    }

    const contextBlock = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE CONTEXT (for disambiguation only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Book page number: ${book_page ?? 'unknown'}
Paper: ${context.paper_title ?? ''}
Chapter: ${context.chapter_title ?? ''}
Sub-chapter: ${context.sub_chapter_title ?? ''}
`

    const prompt = EXTRACT_PROMPT + contextBlock

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: media_type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
                data: image_base64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const textItem = msg.content.find(c => c.type === 'text')
    const text =
      textItem && 'text' in textItem && typeof (textItem as { text?: unknown }).text === 'string'
        ? String((textItem as { text: string }).text).trim()
        : ''

    let parsed: {
      concepts?: unknown[]
      paragraphs?: unknown[]
      page_number?: number
    }
    try {
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      parsed = JSON.parse(cleaned) as typeof parsed
    } catch {
      return NextResponse.json(
        { error: 'Model did not return valid JSON', preview: text.slice(0, 400) },
        { status: 422 }
      )
    }

    const concepts = Array.isArray(parsed.concepts)
      ? parsed.concepts
      : Array.isArray(parsed.paragraphs)
        ? parsed.paragraphs
        : []

    const pageNumber =
      typeof parsed.page_number === 'number' && !Number.isNaN(parsed.page_number)
        ? parsed.page_number
        : book_page ?? null

    return NextResponse.json({
      success: true,
      page_number: pageNumber,
      concepts,
      paragraphs: concepts,
      raw_response: text,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
