import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST-PROCESSING — Fix Telugu errors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fixTelugu = (str: string): string => {
  if (!str) return str
  return str
    .replace(/\bokay va\b/gi, 'okay na')
    .replace(/\bseri va\b/gi, 'ardhamaindha')
    .replace(/\bva\?/g, 'na?')
    .replace(/\bmeeru\b/g, 'nuvvu')
    .replace(/\bmee\b/g, 'ni')
    .replace(/\bbhoyapadaku\b/gi, 'bhayapadaku')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CALL 1: V3 Tenglish — Sonnet (Creative MAMA)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateV3Tenglish(
  icmai_text: string,
  concept_title: string,
  chapter: string,
  sub_chapter: string
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: `You are MAMA — a CMA exam tutor who teaches in Tenglish 
(Telugu-English mix). 80% English content words + 20% Telugu 
connecting words. Target: AP/TS students.

HARD RULES:
1. ZERO Hindi — no "beta", "da", "ra", "yaar", "hai"
2. NO formal Telugu — use casual: idi, adi, chala, ayindi, kaabatti
3. NEVER translate English terms — "Contract" stays "Contract", not "ఒప్పందం"
4. "va?" is Tamil — use "na?" or "kadha?" instead

Tenglish examples:
- "Contract ante enti? Simple ga cheppalante..."
- "Idi chala important concept — exam lo direct ga adugutharu"
- "Real life lo chusthe, Flipkart order chesthe adi Express Contract"`,
    messages: [{
      role: 'user',
      content: `CHAPTER: ${chapter}
SUB-CHAPTER: ${sub_chapter}
CONCEPT: ${concept_title}

ICMAI OFFICIAL TEXT:
"${icmai_text}"

Write the MASTER explanation (V3) in MAMA's Tenglish.

STRUCTURE:

**[Concept] ante enti?**
- Core definition
- Why it exists
- Real meaning

**Enduku important?**
- Why student must know this
- Practical relevance

**[If hierarchy/classification — MINI DIAGRAMS]**
Break into small mermaid blocks (2-3 nodes max).
Walk through branch by branch with explanation between diagrams.
Use flowchart LR or TD. Keep labels SHORT (3-4 words).

**Real India lo chuddam**
- Dramatic real Indian example (Infosys, Tata, Zomato, Flipkart, SBI, Amul)
- Make it memorable and specific

**[If types/categories — TABLE]**
| Category | Details | Example |
|----------|---------|---------|

**Trap awareness**
- "Chala mandi ikkada confuse avutharu"
- What looks right but is wrong
- How to tell the difference

**Memory trick**
- One line shortcut to remember

RULES:
- ONLY explain what is in the ICMAI text
- Use bullet points, tables, mermaid diagrams
- Real Indian company examples throughout
- Max 600-900 words
- Do NOT return JSON — plain markdown only
- No career connection
- No exam writing tips (CMA is MCQ)`
    }],
  })

  const text = response.content[0].type === 'text'
    ? response.content[0].text : ''
  return fixTelugu(text.trim())
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CALL 2: English conversion — Gemini Flash (Cheap)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateEnglishFromTenglish(
  tenglishV3: string,
  concept_title: string,
): Promise<{ v2_english: string; v3_english: string }> {
  if (!GEMINI_API_KEY) {
    // Fallback to Haiku if no Gemini key
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `CONCEPT: ${concept_title}

TENGLISH VERSION (source of truth):
${tenglishV3}

Convert to English. Return JSON:
{
  "v2_english": "Bullet point revision. Same points, pure English. Max 150 words.",
  "v3_english": "Full English. SAME structure, headings, bullets, tables, mermaid. ONLY change Telugu to English."
}
Return ONLY valid JSON.`
      }]
    })
    let text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    text = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
    try {
      const parsed = JSON.parse(text)
      return { v2_english: parsed.v2_english || '', v3_english: parsed.v3_english || '' }
    } catch {
      return { v2_english: '', v3_english: '' }
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `CONCEPT: ${concept_title}

TENGLISH VERSION (source of truth):
${tenglishV3}

Convert to English. Return JSON:
{
  "v2_english": "Bullet point revision. Same points, pure English. Max 150 words.",
  "v3_english": "Full English. SAME structure, headings, bullets, tables, mermaid diagrams unchanged. ONLY change Telugu words to English."
}
CRITICAL: SAME content, zero additions or removals. Keep mermaid and tables exactly as-is. Return ONLY valid JSON.`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 4000,
          temperature: 0.1,
          responseMimeType: "application/json",
        }
      })
    }
  )

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  try {
    const parsed = JSON.parse(text)
    return { v2_english: parsed.v2_english || '', v3_english: parsed.v3_english || '' }
  } catch {
    return { v2_english: '', v3_english: '' }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function POST(req: NextRequest) {
  try {
    const { id, icmai_text, concept_title, chapter, sub_chapter } = await req.json()

    if (!icmai_text) {
      return NextResponse.json({ error: 'icmai_text required' }, { status: 400 })
    }

    // Call 1: V3 Tenglish (Sonnet)
    const tenglishV3 = await generateV3Tenglish(
      icmai_text, concept_title || 'Unknown',
      chapter || '', sub_chapter || ''
    )

    // V1 Tenglish: first 2-3 paragraphs of V3 (FREE — no extra API call)
    const tenglishV1 = tenglishV3
      .split('\n\n')
      .slice(0, 3)
      .join('\n\n')

    // Call 2: English (Gemini Flash)
    const { v2_english, v3_english } = await generateEnglishFromTenglish(
      tenglishV3, concept_title || 'Unknown'
    )

    // Save to DB if id provided
    if (id) {
      await supabaseAdmin.from('concepts').update({
        tenglish: tenglishV1,
        tenglish_variation_3: tenglishV3,
        english_variation_2: v2_english,
        english_variation_3: v3_english,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
    }

    return NextResponse.json({
      success: true,
      tenglish: tenglishV1,
      tenglish_variation_2: v2_english,
      tenglish_variation_3: tenglishV3,
      english_variation_2: v2_english,
      english_variation_3: v3_english,
    })

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error'
    console.error('Generate error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
