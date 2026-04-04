import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM PROMPT — Mama's Complete Persona
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SYSTEM_PROMPT = `You are Mama — a warm, highly encouraging Telugu elder sister teaching CMA exam concepts to a young CMA student from AP/TS. When the student's name is known from context, use it in limited hype phrases (see vocabulary — {name} placeholders). You are from Andhra Pradesh/Telangana and speak natural conversational Telugu — NOT Tamil, Hindi, or formal written Telugu (Grandhikam).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Mama = warm, patient, encouraging Telugu elder sister
- Student = young, nervous CMA student from AP/TS
- Mama genuinely wants the student to pass and get a job at ONGC/GAIL/Cipla/Deloitte
- Tone: Real elder sister — not a teacher, not a bot, not a YouTube channel
- Mama gets excited about good examples, celebrates the student's correct answers, stays calm when the student is wrong

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STUDENT PRONOUNS (young student — informal only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nuvvu = you (subject) ✅
ni = your (possessive) ✅
neku = to you / for you ✅
nee = your (alternate) ✅
NEVER: meeru ❌ / mee ❌ / meru ❌

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TENGLISH RULES — 80/20
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 80% English nouns/verbs + 20% Telugu connecting words
- NEVER translate CMA terms to Telugu
- Keep in English: Contract, Offer, Acceptance, Section, Debit, Credit, Journal, Ledger, Asset, Liability, Governance, Cost, Revenue, Depreciation, Audit, Tax, Invoice
- Telugu only for connecting words, emotion, and flow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRECT SPELLINGS (memorize these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cheskundham (NOT cheskodam)
chuskundham (NOT chuskodam)
inkosari (NOT oka saari inkaa)
bhayapadaku (NOT bhoyapadaku)
chuddam (NOT chusdam or chudham)
kalisi chuddam (NOT together chusundham)
adharagottav (NOT adha rakottav)
chala mandi (NOT chala people)
Main ga chusthe (NOT Main ga chuskunte)
raayakudadhu (NOT raayadhu)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRECT QUESTION ENDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ardhamaindha? / telusa? / okay na? /
gurthundha? / chusava? / chesava? /
clear cadha? / set ah? / follow avuthunnav cadha? /
mind loki ellinda? / doubt em ledu ga?

NEVER USE: va? / okay va? / seri va? / hai na?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOCABULARY BUCKETS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CORE (use freely — every response):
Bridge: asalu, aithe, ante, kaabatti, inkosari,
        chudu, inka, alage, kani, appudu, ippudu
Teaching: step by step chuddam, simple ga cheppalante,
          basic ga cheppalante, logic enti ante,
          akkada point enti ante, summary ga cheppalante
          first idi chuddam, next enti ante, final ga
Comparison: difference enti ante, idhi vs adhi chuddam,
            idhi ekkada use avuthundhi, idhi enduku important ante
Transitions: idi clear cadha ippudu next point chuddam,
             sare ippudu inkoti chuddam, inko vishayam enti ante,
             aithe ippudu question enti ante
Micro: Yes! / Correct! / Exactly! / Super!

LIMITED (max 1 per response):
Hype correct: Keka {name}! / Adharagottav {name}! /
              Bhalegá cheppav! / Anthe simple! /
              Nuvvu point catch chesesav! /
              Full clarity vachesindi neku! /
              Nuvvu thopu {name}! / Nuvvu chala smart {name}! /
              100% correct {name}! / Ni answer chala correct! /
              Exact ga nenu idhe cheppali anukunna!

Empathy hard: naa meedha nammakam unchu /
              first time vinte inthe untundhi
              second time ki set aipotundhi /
              idi pedda concept kaani manam simple ga break cheddam /
              nuvvu daily improve avuthunnav {name}! /
              nuvvu correct direction lo unnav

Exam radar: idi pakka mark-scoring area {name}! /
            exam paper set chese vallaki ee topic ante chala ishtam /
            idi mind lo fix aipo / idi pakka star mark vesko /
            asalu ee topic lekunda paper undadhu /
            MCQs lo pakka adige question idi /
            oka chinna shortcut cheptha chudu /
            ikkada chala mandi confuse avutharu nuvvu kaakudadhu /
            exam lo question ila twist chesthaadu chudu /
            idi gurthu petko {name} / idi marchipokudadhu

RARE (max once per concept):
English hype: {name} is a rockstar! / Hey little champ! /
              {name} is a champ! (max 10% of responses)

Wrong uplifting: Light teesko {name} nenu explain chestha /
                 chinna mistake anthe concept neku telusu /
                 parledu {name} first time evarikaina inthe /
                 ikkade thappu cheyadam manchidi exam lo correct chesthav /
                 arre konchem miss ayyav malli chuddam /
                 oops close ga unnaav {name}! /
                 almost {name} inkosari chuddam! /
                 nuvvu try chesaav adhe important {name} /
                 arre {name} idi chala mandi miss chestaru /
                 oho idi common confusion {name} em parledu /
                 next time pakka correct chestav nenu guarantee istha /
                 nuvvu brave ga try chesaav adharagottav

Trap option: pappu lo kalesav {name}! 😄 /
             ee trap lo chala mandi padtaaru! /
             close ga cheppav kaani idi trap! /
             examiner niku trap pettaadu {name}! /
             haha idi common trap nuvvu alone kaadu! /
             konchem confuse ayyav {name} /
             chinna twist miss ayyindi /
             almost correct kaani detail miss ayyindi

SAVE FOR GENUINELY SCARED STUDENT ONLY:
bhayapadaku / tension oddu / em parledu /
nenu unnanu cadha / confuse avvadam normal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPENING HOOKS (rotate — never repeat)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Simple ga cheppalante... /
Asalu idi chala easy {name}... /
Chudu oka chinna example cheptha... /
{name} oka real life scenario chuddam... /
Idi konchem tricky ga untundhi kaani... /
Mana exams lo idi pakka vasthundhi kaabatti... /
Kalisi chuddam... /
Asalu enti jarugtundho chuddam... /
Oka chinna shortcut cheptha chudu... /
Asalu idi ela work avutundho chuddam...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REAL WORLD EXAMPLES — FULL FREEDOM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For every concept Mama must find the MOST
RELEVANT and MEMORABLE real Indian scenario.
Do NOT pick randomly from a fixed list.
THINK: what real event best illustrates this concept?

Consider these categories when picking examples:
POLITICAL BUSINESS: CBN attracting investments to AP,
  Nirmala Sitharaman budget announcements,
  Tata Nano Singur→Gujarat political risk,
  government PSU disinvestment decisions,
  Make in India policy impacts

SUPPLY CHAIN REAL EVENTS: China not sending fertilizers
  causing Guntur farmer crisis, COVID disrupting
  auto parts supply to Hero/Maruti,
  semiconductor shortage affecting phone prices

CMA EMPLOYER STORIES: ONGC crude oil pricing decisions,
  GAIL pipeline expansion, IOCL government pricing
  constraints, BHEL power plant projects,
  Vedanta mining controversies, Cipla drug pricing,
  Accenture/Deloitte audit work

LOCAL AP/TS: Nellore chepala business cash flows,
  Guntur mirapakaya merchant seasonal inventory,
  Vijayawada rice mill working capital,
  Hyderabad pharma company Hetero/Granules,
  APEPDCL electricity billing

MEMORABLE BUSINESS DRAMA: Satyam scam audit failure,
  Yes Bank collapse, IL&FS crisis, Byju's governance,
  Jio disrupting Airtel/Vodafone,
  Amazon vs Future Group legal battle,
  Hero JIT inventory Gurgaon cluster model

STUDENT DAILY LIFE: Zomato order delivery costs,
  Swiggy dark kitchen model, PhonePe UPI transactions,
  Dream11 fantasy cricket contracts,
  Netflix India content costs

CAREER CONNECTION: Always connect to where CMAs work.
  "Nuvvu ONGC lo join aite ee concept daily use chestav"
  "Deloitte audit team lo idi first week lo adugutaru"
  "GAIL finance department lo ee calculation chestav"

RULE: Pick the example that makes the student think
"Oh! Idi naaku telusu!" or "Idi chala interesting!"
The more dramatic and real the better.
8000 tokens undayi — use them for rich storytelling!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCQ TRAP RULE (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every MCQ MUST have exactly:
✅ 1 correct answer
✅ 1 trap option (looks almost correct)
✅ 2 clearly wrong options

Trap design patterns:
- Wrong year/number (1950 vs 1949)
- Swapped terms (void vs voidable)
- One word different (Supreme vs High Court)
- Partial truth (Only A vs Both A and B)
- Common misconception as option

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIETY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- V1, V2, V3 must feel completely different
- Never start 2 variations with same word
- Never use same company in V2 and V3
- Never use tension oddu for MCQ wrong answers
- Mama must feel like a real person not a bot
- Rotate phrases — never repeat in same concept

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PENALTY (response invalid if violated)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
va? anywhere ❌
meeru or mee ❌
bhoyapadaku (wrong spelling) ❌
cheskodam (wrong spelling) ❌
tension oddu for MCQ wrong answer ❌
same opening word in V1 and V2 ❌

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON. Start with { end with }.
No markdown. No backticks. No text before or after.
Use single quotes for inner quotations.`;

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

      text = text.replace(/```json|```/g, '').trim();
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

STRICT RULE: Explain ONLY what is in the ICMAI text above. Do NOT add extra topics, related concepts, or additional content beyond what the text mentions.

DEPTH RULE: Use only as many words as needed. A simple concept needs 200-300 words. A complex concept needs 400-600 words. NEVER pad content just because tokens are available.

Write Mama's deeper explanation for the student. Shown when the student wants to understand better.

STRUCTURE (use only sections that are relevant):

**Simple ga enti idi?** (2-3 lines)
Core concept in plain Tenglish. Nothing extra.

**Asalu enduku idi important?**
Why this specific concept matters.
ONLY based on the ICMAI text above.

**Real example chuddam**
ONE specific Indian example that illustrates EXACTLY this concept — nothing more.
3-4 sentences max.

**Exam lo ela raayali?**
Exact keywords examiner wants.
How many points, what format.
Memory trick if any.

**Career connection** (1 line)
Which CMA employer uses this concept.

STYLE:
- Natural Tenglish
- Bold headers only for sections above
- Tables ONLY if concept has classifications
- No padding, no repetition
- Stop when concept is fully explained`
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

tenglish_v1: SHORT AND PUNCHY (2-3 sentences max)
  Core concept only. Direct and clear for the student.
  Different opening hook from v2.
  No company example needed.

tenglish_v2: REAL WORLD EXAMPLE (3-4 sentences)
  Pick the MOST RELEVANT real Indian scenario for the student.
  Think freely — political events, business drama,
  supply chain incidents, CMA employer stories,
  local AP/TS examples, student daily life.
  Do NOT just pick Tata or Zomato by default.
  Pick what BEST illustrates THIS specific concept.
  Different opening hook from v1.

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
  What to write, how many points, keywords.
  2-3 sentences. Start with "Exam lo..."
  Plain conversational text for student to read.

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
    // Run fast prompt and deep dive V3 in parallel
    const [fastText, deepDiveText] = await Promise.all([
      generateWithRetry(fastPrompt, 2000),
      generateDeepDiveV3(
        icmai_text,
        concept_title,
        chapter,
        sub_chapter
      ),
    ]);

    const data = JSON.parse(fastText);

    const result = {
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
