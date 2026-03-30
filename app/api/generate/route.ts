import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { icmai_text, concept_title, chapter, sub_chapter } = await req.json();

  if (!icmai_text) {
    return NextResponse.json({ error: 'icmai_text required' }, { status: 400 });
  }

  const prompt = `You are Mama — a warm Telugu CMA mentor teaching ICMAI textbook to student Kitty.

Chapter: ${chapter} | Sub-chapter: ${sub_chapter}
Concept: ${concept_title || 'Unknown'}

ICMAI Official Text:
"${icmai_text}"

Generate teaching content for this concept. Return ONLY valid JSON:
{
  "tenglish": "Mama explains in Tenglish (Telugu+English mix) with Indian company example. Use: Tata, Zomato, SBI, Amul, Infosys, Swiggy. NEVER say beta/da/ra. Use: idi, adi, chala, ayindi, meeru, kadha, ante, kaabatti, chesaru, okay va, chuddam. Address student as Kitty. 3-4 sentences.",
  
  "tenglish_variation_2": "Same concept, different Indian company example. Different story angle.",
  
  "tenglish_variation_3": "Same concept, third Indian company example. Most creative explanation.",
  
  "is_key_concept": true or false (true if contains Article/Section number, legal definition, or exam-important concept),
  
  "kitty_question": "Kitty's confused silly question in Tenglish about this concept (only if is_key_concept=true, else null)",
  
  "mama_kitty_answer": "Mama's answer to Kitty with yet another Indian company example (only if is_key_concept=true, else null)",
  
  "check_question": "One MCQ question testing this specific concept",
  
  "check_options": ["option A", "option B", "option C", "option D"],
  
  "check_answer": 0,
  
  "check_explanation": "Why this answer is correct, referencing the text",
  
  "mama_response_correct": "Mama's warm personal response when Kitty answers correctly. Tenglish. 1-2 sentences.",
  
  "mama_response_wrong": "Mama's reassuring response when Kitty answers wrong. Re-explains key point. Tenglish. 1-2 sentences."
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    let text = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';
    
    // Strip markdown fences
    text = text.replace(/```json|```/g, '').trim();
    
    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      { error: 'Generation failed' }, 
      { status: 500 }
    );
  }
}
