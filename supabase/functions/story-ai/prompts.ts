import { ART_STYLE_PROMPTS, LANGUAGE_NAMES } from './config.ts';

type Character = { key?: string; name?: string; description?: string };
export function buildCharactersPrompt(characters: Character[] = []) {
  return characters.filter(Boolean).map((c, i) => {
    const name = c.name?.trim(); const desc = c.description?.trim();
    const key = c.key ? ` [key: ${c.key}]` : '';
    if (name && desc) return `Character ${i + 1}${key}: ${name}. ${desc}`;
    if (name) return `Character ${i + 1}${key}: ${name}.`;
    if (desc) return `Character ${i + 1}${key}: ${desc} (invent a fitting, consistent appearance)`;
    return '';
  }).filter(Boolean).join('\n');
}

export const storyPrompt = (premise: string, theme: string, characters: Character[], pageCount: number) => {
  const block = buildCharactersPrompt(characters);
  return `You are a beloved children's book author writing for ages 4-8.
Theme: ${theme}
Premise: ${premise}
${block ? `Characters to include (keep them consistent across every page):\n${block}` : 'Invent a charming main character.'}
Return generated_characters only for recurring visual characters that were not supplied above, using stable keys such as generated:1 and a complete locked appearance bible. Keep the total recurring cast to no more than three characters. If every recurring character was supplied, return an empty generated_characters array.

Write a gentle, imaginative picture book with exactly ${pageCount} pages.
Each page should have 1-2 short, vivid sentences of reader-visible story text (read-aloud friendly).

Also design a Story World Bible and a small set of reusable named locations. For every page, separately provide the visual scene, active location key, environment state, previous-page continuity notes, explicit location transition, character keys present, and their actions. Keep every page in its established environment until an explicit transition changes locations. Return character_changes only when the prose intentionally introduces a lasting outfit change, transformation, or return to the baseline appearance; otherwise return an empty array. Do not repeat visual instructions inside reader-visible text. Return the complete structured story package requested by the schema.`;
};
export const pageImagePrompt = (scene: string, theme: string, characters: Character[], style: string, illustrationInstructions = '', worldBlock = '', characterActions = '', styleSnapshot = '') => {
  const block = buildCharactersPrompt(characters);
  return `A children's picture book illustration.
Scene: ${scene}
Mood/theme: ${theme}.
${worldBlock}
${block ? `Include the character(s) matching:\n${block}` : ''}
${characterActions ? `Character actions and composition: ${characterActions}` : ''}
${illustrationInstructions ? `Additional visual-only instructions: ${illustrationInstructions}` : ''}
Style: ${styleSnapshot || ART_STYLE_PROMPTS[style]}. No words or text in the image.`;
};
export const continuationSuggestionPrompt = (title: string, summary: string, lastPages: string[]) => `You are helping continue a children's picture book.
Title: ${title}
Summary: ${summary || ''}
Last pages:
${lastPages.map((value) => `— ${value}`).join('\n') || '(no pages yet)'}

Suggest ONE continuation premise (1-2 sentences) for what could happen next, keeping the same gentle tone. Return JSON.`;
export const continuationPrompt = (title: string, summary: string, characters: Character[], count: number, premise: string, worldContext = '') => {
  const block = buildCharactersPrompt(characters);
  return `Continue the children's picture book "${title}".
Summary so far: ${summary || ''}
Continuation premise: ${premise}
${block ? `Characters (keep them consistent):\n${block}` : ''}
${worldContext}

Write exactly ${count} NEW pages continuing the story naturally. Each page needs separate reader-visible text and visual scene metadata. Preserve the last known location, environment, and continuity unless the story explicitly travels; every changed location requires a transition. Return character_changes only when the prose intentionally introduces a lasting outfit change, transformation, or return to the baseline appearance; otherwise return an empty array. Return any newly introduced or reused location definitions plus the structured pages requested by the schema.`;
};
export const translationPrompt = (texts: string[], language: string) => `Translate the following children's storybook page texts into ${LANGUAGE_NAMES[language]}.
Keep the gentle, read-aloud-friendly tone. Translate each page independently.
Return a JSON object with a "translations" array of translated strings in the SAME ORDER as the input.

Texts:
${texts.map((value, index) => `${index + 1}. ${value}`).join('\n')}`;
export const characterAnalysisPrompt = (kind: string, species: string) => `Analyze this photo as visual reference for a ${kind} children's book character${species ? ` described as ${species}` : ''}.
Return concise, literal visual traits for hair, eyes, skin/fur/scales/surface, body features, and distinguishing features. Use an empty string when a trait is not visible. Do not invent clothing, accessories, species anatomy, or colors that are not visible.`;
export const characterImagePrompt = (description: string, kind = 'character') => `A warm, friendly watercolor portrait of a ${kind} character for a children's book.
${description}
Style: soft hand-painted watercolor, whimsical, gentle pastel colors, storybook illustration. No text.`;
