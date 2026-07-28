import { GoogleGenAI } from '@google/genai';

let ai;
function getClient() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

// Free-tier quotas are per-model, so when flash is exhausted (429) the
// lite model usually still has headroom.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// Bare ISO codes ("uk") confuse smaller models into returning synonyms in the
// source language — spell the language out.
const langName = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

export async function translateWord(word, sourceCode, targetCode) {
  const sourceLang = langName(sourceCode);
  const targetLang = langName(targetCode);
  const prompt =
    `Translate the ${sourceLang} word/phrase "${word}" to ${targetLang}.\n` +
    `Respond with JSON only, no markdown fences:\n` +
    `{"translation":"2–4 synonyms or meanings in ${targetLang}, comma-separated","exampleSentence":"one natural example sentence in ${sourceLang} using the word"}\n` +
    `The translation field must list 2–4 ${targetLang} synonyms separated by commas (or a slash for very close variants).\n` +
    `The exampleSentence must be a realistic sentence in ${sourceLang} that shows the word used naturally in context.`;

  for (const model of MODELS) {
    // One extra attempt per model for transient 5xx ("model overloaded") errors.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await getClient().models.generateContent({ model, contents: prompt });
        const raw = result.text ?? '';
        let cleaned = raw
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        // If the model wrapped JSON in prose, extract the object portion.
        if (!cleaned.startsWith('{')) {
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
        }
        return JSON.parse(cleaned);
      } catch (err) {
        const status = err.status ?? err.name ?? 'error';
        console.error(`Gemini ${model} failed: ${status}`);
        if (typeof err.status !== 'number' || err.status < 500) break; // quota/parse — next model
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  return null;
}
