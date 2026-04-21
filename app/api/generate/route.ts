import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
// SOMI ENGINE v2.1 — Base System Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SOMI_SYSTEM_PROMPT = `You are a Senior Solution Architect and Education Mentor for SOMI. Your goal is to simplify complex academic concepts for Indian professional students (CMA, CA, NEET).

TONE & LANGUAGE:
- Use Hyderabad Tenglish (natural mix of English and Telugu)
- Professional yet very casual, like a helpful senior guide
- STRICT: Never use the word "Orey" — use respectful, friendly language
- STRICT: No "AI-sounding" labels like "Hook," "Analogy," or "Template"
- Natural Tenglish words preferred: idi, adi, chala, ayindi, kaabatti, chuddam, konni, anthe, okay na

CONSTRAINT: Keep it "Damn Simple." Use the fewest words possible. Zero fluff.`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROMPT BUILDERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildV1Prompt(icmai_text: string, concept_title: string): string {
  return `${SOMI_SYSTEM_PROMPT}

CONCEPT: ${concept_title}
ICMAI OFFICIAL TEXT: "${icmai_text}"

TASK: Provide a ONE-sentence explanation only.
- Must be the absolute essence of the concept
- No bullets, no headers, no formatting
- Just one clean Tenglish sentence

GOLD STANDARD EXAMPLE (for "Law" concept):
"Society smooth ga run avvadaniki manam create cheskunna Official Rulebook ye Law."

Now generate for the given concept.`
}

function buildV2Prompt(icmai_text: string, concept_title: string): string {
  return `${SOMI_SYSTEM_PROMPT}

CONCEPT: ${concept_title}
ICMAI OFFICIAL TEXT: "${icmai_text}"

TASK: Create a bullet-point revision summary in markdown.

FORMAT:
**Konni important points:**

- **Keyword 1:** Brief explanation in Tenglish
- **Keyword 2:** Brief explanation in Tenglish
(dynamic — 4 to 6 bullets based on content depth)

RULES:
- Bold the core keywords at the start of each bullet
- Each bullet: 1-2 lines maximum
- Total length: 80-150 words

GOLD STANDARD EXAMPLE (for "Law" concept):

**Konni important points:**

- **Official Rulebook:** Society lo manam ela behave cheyyali ani cheppe set of rules idi
- **Dynamic Nature:** Society maarithe, Law kuda daaniki thaggattu evolve avtu untundi
- **H.L.A. Hart's Logic:** Law ante just punishments kaadu — **Primary Rules** (what to do) + **Secondary Rules** (how to change/enforce) combination
- **Governance Tool:** Government society lo order maintain cheyyadaniki use chese main instrument
- **Rights & Limits:** Neeku em powers unnayi, boundaries ekkada — clear ga cheptundi

Now generate for the given concept following this exact quality and style.`
}

function buildV3Prompt(icmai_text: string, concept_title: string): string {
  return `${SOMI_SYSTEM_PROMPT}

CONCEPT: ${concept_title}
ICMAI OFFICIAL TEXT: "${icmai_text}"

TASK: Create a full deep-dive explanation with 5 mandatory sections.

MANDATORY STRUCTURE:

**Asalu vishayam enti ante:**
(One simple sentence — the true essence)

**Konni important points:**
- **Keyword 1:** Explanation
- **Keyword 2:** Explanation
(4 to 7 adaptive bullets covering core logic)

**Manam daily life lo chusthe:**
(ONE relatable Indian example — cricket, traffic, mobile phones, kirana store, Jio/Airtel, Zomato, train tickets, Infosys, Tata, SBI. Show how concept applies. 2-4 sentences.)

**Exam lo gurtunchu kovalsindi:**
(ONE actionable tip — specific phrase/keyword to highlight, memory trick, or scoring strategy.)

**Visualization:**
STRICT RULE: You MUST generate a Mermaid.js diagram if there is ANY classification, hierarchy, process, or categorization involved in the concept. Only skip if the concept is purely abstract with zero structure.

\`\`\`mermaid
graph TD
    A[Main Concept] --> B[Sub-point 1]
    A --> C[Sub-point 2]
\`\`\`

RULES:
- Total length: 400-600 words
- Indian examples only (no American/European references)
- Real names preferred (Infosys, Tata, SBI, Zomato, Jio, etc.)

---

GOLD STANDARD EXAMPLE (for "Law" concept):

**Asalu vishayam enti ante:**
Law ante society smooth ga run avvadaniki manam design cheskunna oka Official Rulebook.

**Konni important points:**
- **Social Control:** Andaru paddhati ga undali ante konni rules avasaram — ave Law
- **Ever-Changing:** 100 years kritham unna rules ippudu pani cheyyavu, so Law constantly update avtu untundi
- **Rights & Limits:** Powers enti, boundaries ekkada — clear ga define chestundi
- **The Union:** H.L.A. Hart prakaram, **Primary Rules** (duty-imposing) + **Secondary Rules** (power-conferring) kalisthene complete legal system
- **Governance Tool:** Order maintain cheyyadaniki, right vs wrong decide cheyyadaniki use avtundi

**Manam daily life lo chusthe:**
Dini oka Cricket Match tho compare cheyyi. Match lo rules lekapothe evadu padithe vadu batting chestadu, boundaries undavu, umpire decisions ki value undadu. Law kuda anthe — adi society ane game smooth ga saagadaniki unde Standard Ground Rules. Umpire = Judge, Rulebook = Constitution, Players = Citizens.

**Exam lo gurtunchu kovalsindi:**
H.L.A. Hart name osthe, **"Union of Primary and Secondary Rules"** ane exact phrase ni highlight cheyyi — marks pakka! Definition write chesetappudu "set of rules for society" + "dynamic nature" rendu mention cheyyi.

**Visualization:**
\`\`\`mermaid
graph TD
    A[H.L.A. Hart: Concept of Law] --> B[Primary Rules]
    A --> C[Secondary Rules]
    B --> B1[Daily Duties / Obligations]
    C --> C1[Rules of Change]
    C --> C2[Rules of Recognition]
    C --> C3[Rules of Adjudication]
    B1 --> D[Mature Legal System]
    C1 --> D
    C2 --> D
    C3 --> D
\`\`\`

Now generate for the given concept following this exact quality, structure, and style.`
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GEMINI CALL — temperature 0.4, plain text
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function callGemini(prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048,
          responseMimeType: 'text/plain',
        }
      })
    }
  )

  const data = await response.json()
  return data.candidates[0].content.parts[0].text as string
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function POST(req: NextRequest) {
  try {
    const { id, icmai_text, concept_title, variation_type } = await req.json()

    if (!icmai_text) {
      return NextResponse.json({ error: 'icmai_text required' }, { status: 400 })
    }

    // Single-variation mode (new — called per tab)
    if (variation_type) {
      let prompt: string
      switch (variation_type) {
        case 'V1':
          prompt = buildV1Prompt(icmai_text, concept_title || 'Unknown')
          break
        case 'V2':
          prompt = buildV2Prompt(icmai_text, concept_title || 'Unknown')
          break
        case 'V3':
          prompt = buildV3Prompt(icmai_text, concept_title || 'Unknown')
          break
        default:
          return NextResponse.json({ error: 'Invalid variation_type. Use V1, V2, or V3.' }, { status: 400 })
      }

      const content = fixTelugu(await callGemini(prompt))

      // Save to DB if id provided
      if (id) {
        const fieldMap: Record<string, string> = {
          V1: 'tenglish',
          V2: 'tenglish_variation_2',
          V3: 'tenglish_variation_3',
        }
        await supabaseAdmin.from('concepts').update({
          [fieldMap[variation_type]]: content,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
      }

      return NextResponse.json({ content, variation_type, concept_title })
    }

    // Batch mode (legacy — generate all 3 at once)
    const [v1, v2, v3] = await Promise.all([
      callGemini(buildV1Prompt(icmai_text, concept_title || 'Unknown')),
      callGemini(buildV2Prompt(icmai_text, concept_title || 'Unknown')),
      callGemini(buildV3Prompt(icmai_text, concept_title || 'Unknown')),
    ])

    const tenglishV1 = fixTelugu(v1)
    const tenglishV2 = fixTelugu(v2)
    const tenglishV3 = fixTelugu(v3)

    // Save to DB if id provided
    if (id) {
      await supabaseAdmin.from('concepts').update({
        tenglish: tenglishV1,
        tenglish_variation_2: tenglishV2,
        tenglish_variation_3: tenglishV3,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
    }

    return NextResponse.json({
      success: true,
      tenglish: tenglishV1,
      tenglish_variation_2: tenglishV2,
      tenglish_variation_3: tenglishV3,
      // Legacy field aliases for content/page.tsx compatibility
      english_variation_2: '',
      english_variation_3: '',
    })

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error'
    console.error('Generate error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// client kept for future Anthropic fallback
void client
