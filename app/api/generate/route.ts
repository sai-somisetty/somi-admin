import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM PROMPT — MAMA (Tenglish CMA tutor)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SYSTEM_PROMPT = `You are MAMA — a friendly Telugu senior
from AP/TS teaching CMA concepts in Tenglish. Write exactly
like the examples below.

═══ EXAMPLE 1: Quick Mode (V1) ═══

ICMAI Text: "A contract is an agreement enforceable by law.
According to Section 2(h) of the Indian Contract Act, 1872"

MAMA Output:
"Asalu Contract enti ante — two parties between oka agreement
undhi, adi legally enforceable aithe adhi contract. Simple ga
cheppalante, nuvvu Zomato lo biryani order chesthe, Zomato
neku deliver chestham ani promise chesindhi — adi oka contract!

Section 2(h) lo exact ga enti chepthunnaru ante — 'An agreement
enforceable by law is a contract.' Ikkada two words important:
Agreement + Enforceable. Agreement ante mutual understanding,
enforceable ante court lo prove cheyochu.

Nuvvu Deloitte audit team lo join aithe first week lone client
contracts review chestav — ippudu idi clear cheskunte akkada
hero avuthav!"

═══ EXAMPLE 2: Revise Mode (V2) ═══

Same concept, revision format:

"**Contract = Agreement + Enforceability**

| Element | Meaning | Example |
|---|---|---|
| Agreement | Two parties mutual consent | Nuvvu Flipkart lo phone order chesav |
| Enforceable | Court lo enforce cheyochu | Delivery raledu ante court ki vellochu |
| Section | 2(h) Indian Contract Act 1872 | CMA exam lo direct question vasthundhi |

Quick recall: Agreement + Enforceability = Contract.
Enforceability lekunte adi just promise, contract kaadu."

═══ EXAMPLE 3: Master Mode (V3) ═══

Same concept, deep dive:

"Contract ante enti? Idi CMA Foundation lo most important
definition — asalu exam lo minimum 3-4 marks guaranteed
ee topic nundi.

**Real Drama — Satyam Scam:**
Ramalinga Raju 7000 crore fake contracts create chesadu.
Adhi legally enforceable contracts la kanipinchindhi kaani
underlying agreement fraudulent. Court lo prove chesappudu
— contracts void ayyayi. Ikkade nuvvu difference
understand cheyali — agreement genuine undali AND
enforceable undali, appude contract valid.

**Section 2(h) Breakdown:**
Indian Contract Act 1872 lo ee definition undhi.
Exam lo ila adugutharu:
'Which section defines contract?' — Answer: 2(h)
'What makes agreement a contract?' — Answer: Enforceability

**ONGC Real Example:**
ONGC supplier tho crude oil supply contract chestundhi.
Agreement undhi — ONGC pay chestundhi, supplier deliver
chestadu. Enforceable — oka party default aithe court lo
sue cheyochu. Idhe contract.

**Danger Zone:**
Chala mandi confuse avutharu — 'Every agreement is a
contract' ani wrong ga answer rastaru. Correct answer:
'Every contract is an agreement, but every agreement is
not a contract.' Idi reverse lo exam lo trap option ga
vasthundhi — jagratha!"

═══ FOUR HARD RULES ═══
1. NEVER Hindi — no "beta", "yaar", "hai na?", "da", "ra" (Hinglish)
2. NEVER formal Telugu — no "meeru", "mee". Always "nuvvu", "ni", "neku"
3. NEVER translate CMA terms to Telugu — keep in English always
4. NEVER "va?" — this is Tamil, not Telugu. Use "na?", "kadha?", "ah?"
   ✅ "okay na?" / "clear ayyinda na?" / "set ah?" / "telusu kadha?"
   ❌ "okay va?" / "clear va?" / "set va?"

═══ EXAMPLES ═══
Use real Indian company examples that BEST fit the concept.
Pick dramatic, memorable scenarios the student already knows.
Don't repeat the same company across different concepts.
Connect every concept to where CMAs actually work.

═══ MCQ ═══
4 options: 1 correct, 1 trap (looks almost correct), 2 clearly wrong.
Trap patterns: wrong year, swapped terms, partial truth, common misconception.
MAMA responds differently for correct vs wrong vs trap answers.

When the user message asks for pure English fields (english_v1, english_v2, check_question, check_options), write professional exam English with zero Telugu or Hindi. Tenglish fields follow MAMA style above.

═══ DIAGRAMS IN TEACHING ═══
When the ICMAI text contains a flowchart or hierarchy:
- Do NOT dump the whole diagram at once
- Break it into SMALL pieces and teach each piece
- Use mini mermaid blocks (2-3 nodes max) inside your explanation
- Walk through the tree branch by branch

Example — if textbook has a big "Types of Contract" tree:

MAMA should write:

"Asalu Contracts ki types enti ante — rendu main categories:

\`\`\`mermaid
flowchart LR
  A[Contract] --> B[By Formation]
  A --> C[By Execution]
\`\`\`

First 'By Formation' chuddam — ikkada Express and Implied undhi:

\`\`\`mermaid
flowchart LR
  B[By Formation] --> B1[Express]
  B --> B2[Implied]
\`\`\`

Express ante — directly words lo chepparu, written or oral.
Nuvvu Flipkart lo order chesthe — adi Express contract!

Implied ante — actions nundi infer avuthundhi.
Bus ekkesthe ticket teeskondi — words cheppaledu kaani
contract implied ga create ayyindhi.

Now 'By Execution' chuddam:

\`\`\`mermaid
flowchart LR
  C[By Execution] --> C1[Executed]
  C --> C2[Executory]
\`\`\`

Executed = already perform chesaru, done.
Executory = future lo perform cheyali, pending."

Each mini-diagram is MAX 2-3 nodes. Student reads MAMA's
explanation and sees the visual right there. No scrolling
needed. No overwhelming tree dump.

The FULL reference diagram should be in the original
extracted text field — student can expand ICMAI accordion
to see the complete picture with horizontal scroll.

OUTPUT: Return ONLY valid JSON when the user requests JSON. No markdown fences. No prose before or after the JSON object.`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST-PROCESSING — Fix Telugu errors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fixTelugu = (str: string): string => {
  if (!str) return str;
  return str
    .replace(/\bokay va\b/gi, 'okay na')
    .replace(/\bseri va\b/gi, 'ardhamaindha')
    .replace(/\bva\?/g, 'na?')
    .replace(/\bmeeru\b/g, 'nuvvu')
    .replace(/\bmee\b/g, 'ni')
    .replace(/\bbhoyapadaku\b/gi, 'bhayapadaku')
    .replace(/\bAdha rakottav\b/g, 'Adharagottav')
    .replace(/\badha rakottav\b/g, 'adharagottav')
    .replace(/\bcheskodam\b/gi, 'cheskundham')
    .replace(/\bchuskodam\b/gi, 'chuskundham')
    .replace(/\bcheskovadam\b/gi, 'cheskundham')
    .replace(/\bchuskovadam\b/gi, 'chuskundham')
    .replace(/oka saari inkaa/gi, 'inkosari')
    .replace(/\btogether chusundham\b/gi, 'kalisi chuddam')
    .replace(/\btogether chusdam\b/gi, 'kalisi chuddam')
    .replace(/\bchala people\b/gi, 'chala mandi')
    .replace(/\bMain ga chuskunte\b/gi, 'Main ga chusthe')
    .replace(/\braayadhu\b/gi, 'raayakudadhu');
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RETRY LOGIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateWithRetry(
  prompt: string,
  maxTokens: number = 2000,
  retries: number = 2
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: i === 0
            ? prompt
            : prompt + '\n\nCRITICAL: Previous response had invalid JSON. Return ONLY the JSON object starting with { and ending with }. Nothing else.',
        }],
      });

      let text = response.content[0].type === 'text'
        ? response.content[0].text : '';

      // Only strip the outer ```json wrapper, not mermaid fences inside
      if (text.startsWith('```json')) {
        text = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      } else if (text.startsWith('```')) {
        text = text.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd >= 0) {
        text = text.slice(jsonStart, jsonEnd + 1);
      }

      JSON.parse(text);
      return text;

    } catch (e) {
      if (i === retries - 1) throw e;
      console.log(`Retry ${i + 1} due to error:`, e);
    }
  }
  throw new Error('All retries failed');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V3 DEEP DIVE — Full freedom, 8000 tokens
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateDeepDiveV3(
  icmai_text: string,
  concept_title: string,
  chapter: string,
  sub_chapter: string
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `CHAPTER: ${chapter}
SUB-CHAPTER: ${sub_chapter}
CONCEPT: ${concept_title || 'Unknown'}

ICMAI OFFICIAL TEXT:
"${icmai_text}"

Write Mama's MASTER explanation for the student.
This is the deepest level — student reads this
when they want to truly master the concept.

STRICT RULES:
- Explain ONLY what is in the ICMAI text above
- ALWAYS use bullet points — never paragraphs
- Use numbered lists for steps/sequences
- Use markdown TABLES for any comparison,
  classification, or category
- Be specific — real names, numbers, years
- Natural Tenglish throughout
- Total: 400-600 words maximum

STRUCTURE:

**[Concept] ante enti?**

- Core definition bullet point
- What it means practically
- Why it exists

**Enduku important?**

- Reason 1
- Reason 2
- Exam relevance

**[If concept has a hierarchy/classification/flow — MINI DIAGRAMS]**

Break the hierarchy into small pieces. For each branch,
include a mini mermaid block (2-3 nodes max):

\`\`\`mermaid
flowchart LR
  A[Main Type] --> B[Sub Type 1]
  A --> C[Sub Type 2]
\`\`\`

Then explain each branch before showing the next diagram.
Walk through the tree step by step — never dump the full
diagram at once.

If the concept has NO hierarchy/classification, skip diagrams
entirely. Don't force them.

**Real India lo chuddam**

Pick the MOST dramatic and memorable real Indian
example — political events, business drama,
supply chain incidents, CMA employer stories,
local AP/TS examples.
Think freely — Satyam scam, Jio vs Airtel,
Tata Nano Singur, FSSAI Maggi ban,
COVID supply chain, GST implementation,
CBN AP investments, Yes Bank collapse.
Show as bullet points:
- Specific detail with real name/number
- How concept applies exactly here
- Another angle of same example

**[If types/categories exist — TABLE]**

| Category | Details | Example |
|----------|---------|---------|
| Type 1   | Detail  | Real example |
| Type 2   | Detail  | Real example |

**Exam lo ela raayali?**

- Keywords: [exact terms examiner wants]
- Format: [points or paragraph]
- Minimum points: [number]
- Memory trick: [if applicable]
- Best example to use: [company/case]

**Career connection**

- Which CMA employer uses this concept
- Specific situation student will face

Do NOT return JSON — plain markdown only.`
    }],
  });

  const text = response.content[0].type === 'text'
    ? response.content[0].text : '';
  // Strip JSON wrapper if present
  let cleaned = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed.explanation) cleaned = parsed.explanation;
  } catch {
    cleaned = text;
  }
  return fixTelugu(cleaned);
}

/** Master tab — same structure as V3 Tenglish but pure professional English (no Telugu). */
async function generateDeepDiveV3English(
  icmai_text: string,
  concept_title: string,
  chapter: string,
  sub_chapter: string
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: `You are an expert ICMAI CMA tutor. Write ONLY in clear, professional English.
No Telugu, Hindi, or informal mixing. Exam-focused tone. Same structure rules as Telugu deep dives but English only.`,
    messages: [{
      role: 'user',
      content: `CHAPTER: ${chapter}
SUB-CHAPTER: ${sub_chapter}
CONCEPT: ${concept_title || 'Unknown'}

ICMAI OFFICIAL TEXT:
"${icmai_text}"

Write the MASTER explanation in ENGLISH for a serious CMA student.
This is the deepest level — read when they want full mastery.

STRICT RULES:
- Explain ONLY what is in the ICMAI text above
- ALWAYS use bullet points — never long prose paragraphs
- Use numbered lists for steps/sequences
- Use markdown TABLES for any comparison, classification, or category
- Be specific — real names, numbers, years
- Pure English throughout — zero Telugu
- Total: 400-600 words maximum

STRUCTURE:

**What is [Concept]?**

- Core definition bullet point
- What it means practically
- Why it exists

**Why it matters**

- Reason 1
- Reason 2
- Exam relevance

**[If concept has hierarchy — MINI DIAGRAMS]**

Break into small mermaid blocks (2-3 nodes max).
Teach branch by branch, not all at once.

If the concept has NO hierarchy/classification/flow, skip diagrams entirely. Don't force them.

**Real India**

Pick memorable Indian examples — same categories as policy/business curriculum.
Show as bullet points with specifics.

**[If types/categories exist — TABLE]**

| Category | Details | Example |
|----------|---------|---------|
| Type 1   | Detail  | Real example |
| Type 2   | Detail  | Real example |

**How to write this in the exam**

- Keywords the examiner expects
- Format (points vs paragraph)
- Minimum points
- Memory trick if useful
- Best company/example to cite

**Career connection**

- Which employers use this
- Situations a CMA faces

Do NOT return JSON — plain markdown only.`,
    }],
  });

  const text = response.content[0].type === 'text'
    ? response.content[0].text : '';
  let cleaned = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed.explanation) cleaned = parsed.explanation;
  } catch {
    cleaned = text;
  }
  return cleaned.trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN POST HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function POST(req: NextRequest) {
  const {
    icmai_text,
    concept_title,
    chapter,
    sub_chapter,
  } = await req.json();

  if (!icmai_text) {
    return NextResponse.json(
      { error: 'icmai_text required' },
      { status: 400 }
    );
  }

  const fastPrompt = `CHAPTER: ${chapter}
SUB-CHAPTER: ${sub_chapter}
CONCEPT: ${concept_title || 'Unknown'}

ICMAI OFFICIAL TEXT:
"${icmai_text}"

GENERATE:

english_v1: SHORT AND PUNCHY in pure professional English (2-3 sentences max).
  Same points as tenglish_v1. No Telugu. No Hindi.
  Same opening angle family as tenglish_v1 but written in English.

english_v2: POINT-WISE REVISION in pure professional English.
  Same structure and bullets/tables as tenglish_v2 but 100% English.
  Max 150 words. Mirrors the Revise tab content.
  • If concept has a hierarchy or classification →
    ONE small mermaid diagram (max 3 nodes)
\`\`\`mermaid
    flowchart LR
      A[Root] --> B[Type 1]
      A --> C[Type 2]
\`\`\`

english_v3: output empty string ""
  (Master English is generated in a separate pass — leave empty here.)

tenglish_v1: SHORT AND PUNCHY (2-3 sentences max)
  Core concept only. Direct and clear for the student.
  Different opening hook from v2.
  No company example needed.

tenglish_v2: POINT-WISE REVISION SUMMARY
  This is the REVISE tab — student reads this
  before exam to quickly recall key points.

  Format STRICTLY as:
  • Definition in 1 crisp line
  • Key terms/types as bullet points
  • If concept has categories → small table
  • If concept has a hierarchy or classification →
    ONE small mermaid diagram (max 3 nodes)
\`\`\`mermaid
    flowchart LR
      A[Root] --> B[Type 1]
      A --> C[Type 2]
\`\`\`
  • Exam keywords to remember
  • One memory trick if possible

  NO storytelling. NO paragraphs.
  Pure bullet points and tables only.
  Max 150 words. Fast to read in 30 seconds.
  Different from V1 — V1 explains, V2 summarizes.

tenglish_v3: output empty string ""
  (Deep dive generated separately)

is_key_concept: true if concept has Article/Section
  number OR key legal/accounting definition OR
  exam-critical formula. Otherwise false.

kitty_question: output ""

mama_kitty_answer: output ""

check_question: 100% FORMAL ENGLISH only.
  Exactly as ICMAI exam paper.
  Tests specific concept from text above.

check_options: Array of 4 options.
  100% FORMAL ENGLISH. No Tenglish.
  Must include exactly 1 trap option.

check_answer: Index 0-3 of correct option.

trap_option: Index 0-3 of trap option.
  MANDATORY — never output -1.
  Most tempting wrong answer.
  Must differ from check_answer.

check_explanation: MAMA'S TENGLISH.
  Why correct answer is right.
  Reference specific text.
  Encouraging tone.

mama_response_correct: Tenglish 1-2 sentences.
  Pick from HYPE PACK — rotate, never repeat.
  Then reinforce concept in 1 sentence.
  NEVER use same phrase twice.

mama_response_wrong: Tenglish 1-2 sentences.
  CRITICAL: Wrong answer = learning moment NOT failure!
  Sound playful and uplifting — like a game!
  If student hit trap_option use trap phrases.
  Otherwise use safety net phrases.
  NEVER use tension oddu for wrong MCQ answer.
  Then re-explain key point simply.

mamas_tip: Exam strategy in Mama's Tenglish.
  Format as bullet points ONLY. No paragraphs.
  Start with "Exam lo:" then bullet points:
  - What keywords to write
  - How many points to write
  - What format (paragraph/points)
  - Any memory trick
  Maximum 4 bullet points. Each bullet max 1 line. Start each with "•"

exam_rubric: Structured JSON object for exam engine.
  Generate this EXACTLY:
  {
    "must_keywords": [
      "exact keyword 1 examiner expects",
      "exact keyword 2",
      "exact keyword 3",
      "exact keyword 4"
    ],
    "bonus_keywords": [
      "advanced keyword that gets extra marks",
      "another bonus keyword"
    ],
    "min_points": 3,
    "format": "paragraph or points",
    "marks": 5,
    "memory_trick": "Short memory trick if any else empty string",
    "example_company": "Best company to use as example in exam",
    "common_mistakes": [
      "Most common mistake students make",
      "Second common mistake",
      "Third common mistake"
    ],
    "model_answer_hints": [
      "How to START the answer",
      "What to include in MIDDLE",
      "How to END the answer"
    ]
  }

  Rules for exam_rubric:
  - must_keywords: words examiner MUST see to give marks
    Use exact legal/accounting terminology
    Minimum 4, maximum 8 keywords
  - bonus_keywords: advanced terms for extra marks
    Minimum 2 keywords
  - min_points: minimum points student must write
    MCQ concepts: 2-3 points
    Theory concepts: 4-5 points
    Complex concepts: 6-8 points
  - format: "paragraph" for theory
             "points" for lists/classifications
             "both" if either works
  - marks: typical marks in ICMAI exam (1,2,4,5,8,10)
  - memory_trick: catchy trick to remember
    Empty string "" if no good trick exists
  - example_company: best real company for exam answer
    Pick CMA employer if relevant
    (ONGC, GAIL, Cipla, Deloitte, Tata, Reliance etc)
  - common_mistakes: exactly 3 mistakes
  - model_answer_hints: exactly 3 hints
    Start/Middle/End structure

RETURN EXACTLY THIS JSON:
{
  "english_v1": "...",
  "english_v2": "...",
  "english_v3": "",
  "tenglish_v1": "...",
  "tenglish_v2": "...",
  "tenglish_v3": "",
  "is_key_concept": true,
  "kitty_question": "",
  "mama_kitty_answer": "",
  "check_question": "...",
  "check_options": ["option A", "option B", "option C", "option D"],
  "check_answer": 0,
  "trap_option": 1,
  "check_explanation": "...",
  "mama_response_correct": "...",
  "mama_response_wrong": "...",
  "mamas_tip": "...",
  "exam_rubric": {
    "must_keywords": ["...", "...", "...", "..."],
    "bonus_keywords": ["...", "..."],
    "min_points": 4,
    "format": "paragraph",
    "marks": 5,
    "memory_trick": "...",
    "example_company": "...",
    "common_mistakes": ["...", "...", "..."],
    "model_answer_hints": ["...", "...", "..."]
  }
}`;

  try {
    // Run fast prompt and both deep dives (Tenglish + English) in parallel
    const [fastText, deepDiveText, deepDiveEnglish] = await Promise.all([
      generateWithRetry(fastPrompt, 4000),
      generateDeepDiveV3(
        icmai_text,
        concept_title,
        chapter,
        sub_chapter
      ),
      generateDeepDiveV3English(
        icmai_text,
        concept_title,
        chapter,
        sub_chapter
      ),
    ]);

    const data = JSON.parse(fastText);

    const result = {
      english: (data.english_v1 || '').trim(),
      english_variation_2: (data.english_v2 || '').trim(),
      english_variation_3: (deepDiveEnglish || '').trim(),
      tenglish: fixTelugu(data.tenglish_v1 || ''),
      tenglish_variation_2: fixTelugu(data.tenglish_v2 || ''),
      tenglish_variation_3: deepDiveText,
      is_key_concept: data.is_key_concept ?? false,
      kitty_question: fixTelugu(data.kitty_question || ''),
      mama_kitty_answer: fixTelugu(data.mama_kitty_answer || ''),
      check_question: data.check_question || '',
      check_options: data.check_options || ['', '', '', ''],
      check_answer: data.check_answer ?? 0,
      trap_option: data.trap_option ?? 0,
      check_explanation: fixTelugu(data.check_explanation || ''),
      mama_response_correct: fixTelugu(data.mama_response_correct || ''),
      mama_response_wrong: fixTelugu(data.mama_response_wrong || ''),
      mamas_tip: fixTelugu(data.mamas_tip || ''),
      exam_rubric: data.exam_rubric || {
        must_keywords: [],
        bonus_keywords: [],
        min_points: 3,
        format: 'paragraph',
        marks: 5,
        memory_trick: '',
        example_company: '',
        common_mistakes: [],
        model_answer_hints: [],
      },
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      { error: 'Generation failed', details: String(error) },
      { status: 500 }
    );
  }
}
