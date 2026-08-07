import { base44 } from '@/api/base44Client';
import { getStylePrompt, DEFAULT_ART_STYLE } from '@/lib/artStyles';

/**
 * Story Studio — shared AI helpers.
 * Uses the platform's built-in LLM + image generation.
 * Swap these calls for OpenAI / Supabase via env vars later without changing the UI.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
];

export const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ja: 'Japanese',
  zh: 'Chinese',
};

/**
 * Build a combined character block for AI prompts.
 * Each character: { name?: string, description?: string }.
 * For unnamed/quick characters, the AI is asked to invent a fitting appearance.
 */
export function buildCharactersPrompt(characters = []) {
  const list = characters.filter(Boolean);
  if (!list.length) return '';
  return list
    .map((c, i) => {
      const name = c.name && c.name.trim();
      const desc = c.description && c.description.trim();
      if (name && desc) return `Character ${i + 1}: ${name}. ${desc}`;
      if (name) return `Character ${i + 1}: ${name}.`;
      if (desc) return `Character ${i + 1}: ${desc} (invent a fitting, consistent appearance)`;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Resolve the full characters array for a stored Story (primary + secondary).
 */
export async function resolveStoryCharacters(story) {
  const chars = [];
  const seen = new Set();

  if (story.child_character_id && !seen.has(story.child_character_id)) {
    try {
      const c = await base44.entities.ChildCharacter.get(story.child_character_id);
      chars.push({ name: c.name, description: c.description });
      seen.add(story.child_character_id);
    } catch {}
  }

  const secondary = Array.isArray(story.secondary_characters) ? story.secondary_characters : [];
  for (const s of secondary) {
    if (s.character_id && !seen.has(s.character_id)) {
      try {
        const c = await base44.entities.ChildCharacter.get(s.character_id);
        chars.push({ name: c.name, description: c.description });
        seen.add(s.character_id);
      } catch {}
    } else if (s.quick_description) {
      chars.push({ name: '', description: s.quick_description });
    }
  }

  return chars;
}

export async function generateStoryContent({ prompt, theme, characters = [], pageCount = 6 }) {
  const charBlock = buildCharactersPrompt(characters);
  const fullPrompt = `You are a beloved children's book author writing for ages 4-8.
Theme: ${theme}
Premise: ${prompt}
${charBlock ? `Characters to include (keep them consistent across every page):\n${charBlock}` : 'Invent a charming main character.'}

Write a gentle, imaginative picture book with exactly ${pageCount} pages.
Each page should have 1-2 short, vivid sentences of story text (read-aloud friendly).
Return a JSON object with a title, a one-sentence summary, and the pages array.`;

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
    },
    required: ['title', 'summary', 'pages'],
  };

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: fullPrompt,
    response_json_schema: schema,
  });
  return res;
}

export async function generatePageImage({ text, theme, characters = [], artStyle = DEFAULT_ART_STYLE }) {
  const stylePrompt = getStylePrompt(artStyle);
  const charBlock = buildCharactersPrompt(characters);
  const prompt = `A children's picture book illustration.
Scene: ${text}
Mood/theme: ${theme}.
${charBlock ? `Include the character(s) matching:\n${charBlock}` : ''}
Style: ${stylePrompt}. No words or text in the image.`;
  const { url } = await base44.integrations.Core.GenerateImage({ prompt });
  return url;
}

/**
 * Suggest a continuation prompt based on the existing story's last pages.
 */
export async function suggestContinuation({ title, summary, lastPages = [] }) {
  const prompt = `You are helping continue a children's picture book.
Title: ${title}
Summary: ${summary || ''}
Last pages:
${lastPages.map((t, i) => `— ${t}`).join('\n') || '(no pages yet)'}

Suggest ONE continuation premise (1-2 sentences) for what could happen next, keeping the same gentle tone. Return JSON.`;
  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: { suggestion: { type: 'string' } },
      required: ['suggestion'],
    },
  });
  return res.suggestion;
}

/**
 * Generate continuation pages that append to an existing story.
 */
export async function generateContinuation({ title, summary, theme, characters = [], pageCount, continuationPrompt }) {
  const charBlock = buildCharactersPrompt(characters);
  const fullPrompt = `Continue the children's picture book "${title}".
Summary so far: ${summary || ''}
Continuation premise: ${continuationPrompt}
${charBlock ? `Characters (keep them consistent):\n${charBlock}` : ''}

Write exactly ${pageCount} NEW pages continuing the story naturally. Each page 1-2 short vivid sentences (read-aloud friendly). Return JSON with a pages array.`;

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: fullPrompt,
    response_json_schema: {
      type: 'object',
      properties: {
        pages: {
          type: 'array',
          items: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
      },
      required: ['pages'],
    },
  });
  return res;
}

/**
 * Translate all page texts into a target language. Returns an array in order.
 */
export async function translateStory({ texts, language }) {
  const langName = LANGUAGE_NAMES[language] || language;
  const prompt = `Translate the following children's storybook page texts into ${langName}.
Keep the gentle, read-aloud-friendly tone. Translate each page independently.
Return a JSON object with a "translations" array of translated strings in the SAME ORDER as the input.

Texts:
${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        translations: { type: 'array', items: { type: 'string' } },
      },
      required: ['translations'],
    },
  });
  return res.translations;
}

export async function analyzeChildCharacter(photoUrl) {
  const prompt = `Look at this child's photo and describe their appearance for a children's book illustrator: hair color and style, eye color, skin tone, and any distinctive features. Keep it warm, concise, and friendly (2-3 sentences).`;
  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    file_urls: [photoUrl],
    response_json_schema: {
      type: 'object',
      properties: { description: { type: 'string' } },
      required: ['description'],
    },
  });
  return res.description;
}

export async function generateCharacterImage(description, photoUrl) {
  const prompt = `A warm, friendly watercolor portrait of a child character for a children's book.
${description}
Style: soft hand-painted watercolor, whimsical, gentle pastel colors, storybook illustration. No text.`;
  const { url } = await base44.integrations.Core.GenerateImage({
    prompt,
    existing_image_urls: photoUrl ? [photoUrl] : null,
  });
  return url;
}