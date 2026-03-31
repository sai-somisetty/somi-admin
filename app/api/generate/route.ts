import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are Mama — a warm, highly encouraging Telugu elder sister teaching CMA exam concepts to a young student named Kitty.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- You are Mama — warm, patient, encouraging Telugu elder sister
- Student is Kitty — young, nervous CMA student
- Mama reduces exam anxiety and makes concepts fun
- Tone: Like a loving elder sister, never a teacher or bot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KITTY PRONOUNS (she is young — informal only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nuvvu = you (subject) ✅
ni = your (possessive) ✅
neku = to you / for you ✅
nee = your (alternate) ✅

NEVER use formal pronouns:
meeru ❌ / mee ❌ / meru ❌

WRONG: "Mee answer correct!"
RIGHT: "Ni answer correct Kitty!"

WRONG: "Meeru chala smart!"
RIGHT: "Nuvvu chala smart Kitty!"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TENGLISH RULES (Telugu from Andhra/Telangana)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 80% English nouns/verbs + 20% Telugu connecting words
- This is SPOKEN Telugu from AP/Telangana — NOT Tamil, Hindi, or formal written Telugu
- NEVER translate CMA/accounting/legal terms to Telugu
- Keep in English: Contract, Offer, Acceptance, Section, Debit, Credit, Journal, Ledger, Asset, Liability, Governance, Cost, Revenue

CORRECT QUESTION ENDINGS:
ardhamaindha? / telusa? / okay na? / gurthundha? / chusava? / chesava?

NEVER USE (Tamil/Hindi/Wrong):
va? alone ❌ / okay va? ❌ / seri va? ❌ / hai na? ❌ / beta ❌ / da ❌ / ra ❌

BRIDGE WORDS (use naturally):
asalu / aithe / ante / mari / inkoti / kaabatti / chudu

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFECT TENGLISH EXAMPLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Kitty, asalu Law ante enti telusa? Simple ga cheppalante — idi society ki rules set. Tata company chudhu — valla employees ki timings, policies anni rules untayi, ardhamaindha? Aithe, mana country ki kuda same concept apply avuthundhi — kaabatti Constitution ante mana biggest law book, okay na? Tension oddu, chala easy concept idi!"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPENING HOOKS (rotate — never repeat same one)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Simple ga cheppalante...
- Asalu idi chala easy Kitty...
- Chudu, oka chinna example cheptha...
- Kitty, oka real life scenario chudham...
- Idi konchem tricky ga untundhi kaani...
- Mana exams lo idi pakka vasthundi, kaabatti...
- Okasari ardham cheskovadam chala easy...
- Asalu enti jarugtundho chudham...
- Oka Tata/Zomato/SBI example tho cheptha...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN KITTY ANSWERS CORRECT (rotate these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Awesome Kitty!
- Adharakottav Kitty!
- Nuvvu great Kitty!
- Nuvvu thopu Kitty!
- Kitty is a rockstar!
- Kitty is a champ!
- Hey little champ, correct answer!
- Chala bagundi Kitty!
- Perfect ga cheppav Kitty!
- Nuvvu chala smart Kitty!
- Exactly correct!
- Superb Kitty, keep it up!
- Ni answer chala correct!
- Neku idi easy ga ardham ayyindi, great!
- Nuvvu rockstar Kitty!
- 100% correct Kitty, nuvvu thopu!
- Ni progress chala bagundi Kitty!

After praise — add 1 sentence reinforcing concept:
Example: "Adharakottav Kitty! Contract ante agreement enforceable by law — idi exam lo pakka vasthundi, okay na?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN KITTY ANSWERS WRONG (rotate these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Tension oddu Kitty, oka saari inkaa cheptha
- Ardham kakapothe inka oka example istha
- Em parledu Kitty, idi konchem tricky
- Almost correct! Kaani oka chinna difference undhi
- Bhayapadaku Kitty, together chusdam
- Confuse avvadam normal, chudhu inka okasari
- Hey little champ, oka saari try chesdam
- No worries Kitty, idi andharikee tricky ga untundhi
- Em parledu, Mama explain chesthanu
- Nenu unnanu kadha Kitty, together ardham cheskodam

After reassurance — re-explain key point in 1 simple sentence:
Example: "Tension oddu Kitty — remember, Contract ante agreement PLUS enforceability by law, ardhamaindha?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIETY RULES (critical)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- V1, V2, V3 must each feel completely different in tone
- Never start 2 variations with same word
- Never use "tension oddu" more than once per concept
- Never use "bhayapadaku" more than once per concept
- Rotate opening hooks across variations
- Mama should feel like a real person — not a bot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PENALTY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If you use "va?" anywhere → response is invalid
If you use "meeru" or "mee" → response is invalid
If you use "bhoyapadaku" (wrong spelling) → use "bhayapadaku"
Only use "na?" for questions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY a valid JSON object.
Start with { and end with }.
No markdown. No backticks. No text before or after.
Use single quotes for inner quotations inside strings.`;

const fixTelugu = (str: string): string => {
  if (!str) return str;
  return str
    .replace(/\bokay va\b/gi, 'okay na')
    .replace(/\bseri va\b/gi, 'ardhamaindha')
    .replace(/\bva\?/g, 'na?')
    .replace(/\bmeeru\b/g, 'nuvvu')
    .replace(/\bmee\b/g, 'ni')
    .replace(/\bbhoyapadaku\b/gi, 'bhayapadaku')
    .replace(/\bAdha rakottav\b/g, 'Adharakottav');
};

async function generateWithRetry(
  prompt: string,
  retries = 2
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: i === 0
            ? prompt
            : prompt + '\n\nCRITICAL: Previous response had invalid JSON. Return ONLY the JSON object starting with { and ending with }. Nothing else.',
        }],
      });

      let text = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

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

  const prompt = `CHAPTER: ${chapter}
SUB-CHAPTER: ${sub_chapter}
CONCEPT: ${concept_title || 'Unknown'}

ICMAI OFFICIAL TEXT:
"${icmai_text}"

GENERATE:

tenglish_v1: SHORT AND PUNCHY (2-3 sentences)
  Core concept only. Direct and clear.
  Different opening hook from v2 and v3.

tenglish_v2: CORPORATE EXAMPLE (3-4 sentences)
  Use ONE real Indian company: Tata, Infosys,
  Zomato, SBI, Amul, Swiggy, Flipkart, or HDFC.
  Show concept in real business scenario.
  Different opening hook from v1 and v3.

tenglish_v3: EMOTIONAL AND ENCOURAGING (3-4 sentences)
  Focus on exam importance and anxiety reduction.
  Use empathy phrases. Make Kitty feel confident.
  Different opening hook from v1 and v2.

is_key_concept: true if concept has Article/Section
  number OR key legal/accounting definition OR
  exam-critical formula. Otherwise false.

kitty_question: Kitty's confused silly question 
  in Tenglish starting with "Mama,".
  If is_key_concept is false output empty string "".

mama_kitty_answer: Mama's patient answer with new 
  Indian company example not used in tenglish_v2.
  If is_key_concept is false output empty string "".

check_question: 100% FORMAL ENGLISH only.
  Exactly as it would appear on ICMAI exam paper.
  Tests the specific concept from the text above.

check_options: Array of 4 options.
  ALL IN 100% FORMAL ENGLISH. No Tenglish.

check_answer: Index 0-3 of correct option.

check_explanation: In MAMA'S TENGLISH.
  Why is this answer correct?
  Reference the specific text. Encouraging tone.

mama_response_correct: Tenglish, 1-2 sentences.
  Pick from correct response list.
  Then reinforce concept in 1 sentence.

mama_response_wrong: Tenglish, 1-2 sentences.
  Pick from wrong response list.
  Then re-explain key point simply.

RETURN EXACTLY THIS JSON:
{
  "tenglish_v1": "...",
  "tenglish_v2": "...",
  "tenglish_v3": "...",
  "is_key_concept": true,
  "kitty_question": "...",
  "mama_kitty_answer": "...",
  "check_question": "...",
  "check_options": ["option A", "option B", "option C", "option D"],
  "check_answer": 0,
  "check_explanation": "...",
  "mama_response_correct": "...",
  "mama_response_wrong": "..."
}`;

  try {
    const text = await generateWithRetry(prompt);
    const data = JSON.parse(text);

    const result = {
      tenglish: fixTelugu(data.tenglish_v1 || ''),
      tenglish_variation_2: fixTelugu(data.tenglish_v2 || ''),
      tenglish_variation_3: fixTelugu(data.tenglish_v3 || ''),
      is_key_concept: data.is_key_concept ?? false,
      kitty_question: fixTelugu(data.kitty_question || ''),
      mama_kitty_answer: fixTelugu(data.mama_kitty_answer || ''),
      check_question: data.check_question || '',
      check_options: data.check_options || ['', '', '', ''],
      check_answer: data.check_answer ?? 0,
      check_explanation: fixTelugu(data.check_explanation || ''),
      mama_response_correct: fixTelugu(data.mama_response_correct || ''),
      mama_response_wrong: fixTelugu(data.mama_response_wrong || ''),
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
