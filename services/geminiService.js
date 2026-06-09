import { GoogleGenAI } from '@google/genai';

let ai;
function getClient() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

export async function translateWord(word, sourceLang, targetLang) {
  try {
    const client = getClient();
    const prompt =
      `Translate the ${sourceLang} word/phrase "${word}" to ${targetLang}.\n` +
      `Respond with JSON only, no markdown fences:\n` +
      `{"translation":"2–4 synonyms or meanings in ${targetLang}, comma-separated","exampleSentence":"one natural example sentence in ${sourceLang} using the word"}\n` +
      `The translation field must list 2–4 ${targetLang} synonyms separated by commas (or a slash for very close variants).\n` +
      `The exampleSentence must be a realistic sentence in ${sourceLang} that shows the word used naturally in context.`;

    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const raw = result.text ?? '';
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
