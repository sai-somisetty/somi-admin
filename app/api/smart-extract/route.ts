import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

    const prompt = `You are extracting structured lesson paragraphs from a textbook PDF page screenshot.

Book page (index label): ${book_page ?? 'unknown'}

Context:
- Paper: ${context.paper_title ?? ''}
- Chapter: ${context.chapter_title ?? ''}
- Sub-chapter: ${context.sub_chapter_title ?? ''}

Return ONLY valid JSON (no markdown code fences) with exactly this shape:
{"paragraphs":[{"concept_title":string|null,"heading":string|null,"content_type":"text"|"list"|"table"|"definition"|"image","text":string,"is_key_concept":boolean}]}

Rules:
- Each paragraph is one distinct teaching block, top-to-bottom reading order.
- Use content_type "text" unless the block is clearly a list, table, definition block, or image description.
- Put the full readable body in "text".
- If nothing readable is on the page, return {"paragraphs":[]}.`

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
    let parsed: { paragraphs?: unknown[] }
    try {
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      parsed = JSON.parse(cleaned) as { paragraphs?: unknown[] }
    } catch {
      return NextResponse.json(
        { error: 'Model did not return valid JSON', preview: text.slice(0, 400) },
        { status: 422 }
      )
    }

    const paragraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : []
    return NextResponse.json({ paragraphs })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
