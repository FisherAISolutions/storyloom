import { ART_STYLE_PROMPTS, LANGUAGE_NAMES } from './config.ts';

type Character = { name?: string; description?: string };
export function buildCharactersPrompt(characters: Character[] = []) {
  return characters.filter(Boolean).map((c, i) => {
    const name = c.name?.trim(); const desc = c.description?.trim();
    if (name && desc) return `Character ${i + 1}: ${name}. ${desc}`;
    if (name) return `Character ${i + 1}: ${name}.`;
    if (desc) return `Character ${i + 1}: ${desc} (invent a fitting, consistent appearance)`;
    return '';
  }).filter(Boolean).join('\n');
}

export const storyPrompt = (premise: string, theme: string, characters: Character[], pageCount: number) => {
  const block = buildCharactersPrompt(characters);
  return `You are a beloved children's book author writing for ages 4-8.
Theme: ${theme}
Premise: ${premise}
${block ? `Characters to include (keep them consistent across every page):\n${block}` : 'Invent a charming main character.'}

Write a gentle, imaginative picture book with exactly ${pageCount} pages.
Each page should have 1-2 short, vivid sentences of story text (read-aloud friendly).
Return a JSON object with a title, a one-sentence summary, and the pages array.`;
};
export const pageImagePrompt = (scene: string, theme: string, characters: Character[], style: string) => {
  const block = buildCharactersPrompt(characters);
  return `A children's picture book illustration.
Scene: ${scene}
Mood/theme: ${theme}.
${block ? `Include the character(s) matching:\n${block}` : ''}
Style: ${ART_STYLE_PROMPTS[style]}. No words or text in the image.`;
};
export const continuationSuggestionPrompt = (title: string, summary: string, lastPages: string[]) => `You are helping continue a children's picture book.
Title: ${title}
Summary: ${summary || ''}
Last pages:
${lastPages.map((value) => `— ${value}`).join('\n') || '(no pages yet)'}

Suggest ONE continuation premise (1-2 sentences) for what could happen next, keeping the same gentle tone. Return JSON.`;
export const continuationPrompt = (title: string, summary: string, characters: Character[], count: number, premise: string) => {
  const block = buildCharactersPrompt(characters);
  return `Continue the children's picture book "${title}".
Summary so far: ${summary || ''}
Continuation premise: ${premise}
${block ? `Characters (keep them consistent):\n${block}` : ''}

Write exactly ${count} NEW pages continuing the story naturally. Each page 1-2 short vivid sentences (read-aloud friendly). Return JSON with a pages array.`;
};
export const translationPrompt = (texts: string[], language: string) => `Translate the following children's storybook page texts into ${LANGUAGE_NAMES[language]}.
Keep the gentle, read-aloud-friendly tone. Translate each page independently.
Return a JSON object with a "translations" array of translated strings in the SAME ORDER as the input.

Texts:
${texts.map((value, index) => `${index + 1}. ${value}`).join('\n')}`;
export const characterAnalysisPrompt = "Look at this child's photo and describe their appearance for a children's book illustrator: hair color and style, eye color, skin tone, and any distinctive features. Keep it warm, concise, and friendly (2-3 sentences).";
export const characterImagePrompt = (description: string) => `A warm, friendly watercolor portrait of a child character for a children's book.
${description}
Style: soft hand-painted watercolor, whimsical, gentle pastel colors, storybook illustration. No text.`;
