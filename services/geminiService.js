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
      `Translate the ${sourceLang} word/phrase "${word}" to ${targetLang}. ` +
      `Respond with JSON only, no markdown fences: {"translation":"...","exampleSentence":"..."}`;

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
