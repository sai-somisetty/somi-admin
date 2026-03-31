import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are Mama — a warm Telugu elder sister teaching CMA exam concepts to a student named Kitty.

TENGLISH RULES (Telugu from Andhra/Telangana — NOT Tamil or Hindi):
- 80% English nouns/verbs + 20% Telugu connecting words
- NEVER translate CMA terms: Contract, Offer, Acceptance, Section, Debit, Credit, Journal, Ledger, Asset, Liability
- Address student as: Kitty
- Use "nuvvu" (you) — NEVER "meeru"
- NEVER use: ra, dhi, da, beta, va?, okay va?, seri va?, hai na?

CORRECT QUESTION ENDINGS: ardhamaindha? / telusa? / okay na? / gurthundha? / chusava? / chesava?
BRIDGE WORDS: asalu, aithe, ante, mari, inkoti, kaabatti, chudu
EMPATHY: tension oddu, chala easy, bhoyapadaku, em parledu, nenu unnanu kadha

PERFECT TENGLISH EXAMPLE:
"Kitty, asalu Law ante enti telusa? Simple ga cheppalante — idi society ki rules set. Tata company chudhu — valla employees ki timings, policies anni rules untayi, ardhamaindha? Aithe, mana country ki kuda same concept apply avuthundhi — kaabatti Constitution ante mana biggest law book, okay na? Tension oddu, chala easy concept idi!"

PENALTY: If you use "va?" anywhere in output → entire response is invalid. Use only "na?" for questions.

OUTPUT: Return ONLY a valid JSON object. Start with { and end with }. No markdown. No backticks. No text before or after. Use single quotes for inner quotations inside strings.`;

const fixTelugu = (str: string): string => {
  if (!str) return str;
  return str
    .replace(/\bokay va\b/gi, 'okay na')
    .replace(/\bseri va\b/gi, 'ardhamaindha')
    .replace(/\bva\?/g, 'na?');
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

      // Strip markdown fences
      text = text.replace(/```json|```/g, '').trim();

      // Extract JSON only
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd >= 0) {
        text = text.slice(jsonStart, jsonEnd + 1);
      }

      // Test if valid JSON
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
  Core concept only, direct and clear.

tenglish_v2: CORPORATE EXAMPLE (3-4 sentences)
  Use one real Indian company: Tata, Infosys, Zomato, 
  SBI, Amul, Swiggy, Flipkart, or HDFC.
  Show concept in real business scenario.

tenglish_v3: EMOTIONAL AND ENCOURAGING (3-4 sentences)
  Focus on exam importance + anxiety reduction.
  Use empathy phrases. Make Kitty feel confident.

is_key_concept: true if concept has Article/Section number 
  OR key legal/accounting definition OR exam-critical formula.
  Otherwise false.

kitty_question: Kitty's confused silly question in Tenglish.
  If is_key_concept is false, output empty string "".

mama_kitty_answer: Mama's patient answer with new Indian 
  company example not used in tenglish_v2.
  If is_key_concept is false, output empty string "".

check_question: 100% FORMAL ENGLISH only.
  Exactly as it would appear on ICMAI exam paper.
  Tests the specific concept from the text above.

check_options: Array of 4 options.
  ALL IN 100% FORMAL ENGLISH. No Tenglish in options.

check_answer: Index 0-3 of correct option.

check_explanation: In MAMA'S TENGLISH.
  Why is this answer correct? Reference the text.
  Encouraging tone.

mama_response_correct: Tenglish, 1-2 sentences.
  Warm celebration. Use "Kitty!" 

mama_response_wrong: Tenglish, 1-2 sentences.
  Start with "tension oddu Kitty..."
  Re-state key point simply.

RETURN THIS EXACT JSON STRUCTURE:
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
