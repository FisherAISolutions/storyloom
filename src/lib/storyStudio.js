import * as charactersService from '@/services/characters';
import * as aiService from '@/services/ai';

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
];

export const LANGUAGE_NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese' };

export function buildCharactersPrompt(characters = []) {
  return characters.filter(Boolean).map((c, i) => {
    const name = c.name && c.name.trim();
    const desc = c.description && c.description.trim();
    if (name && desc) return `Character ${i + 1}: ${name}. ${desc}`;
    if (name) return `Character ${i + 1}: ${name}.`;
    if (desc) return `Character ${i + 1}: ${desc} (invent a fitting, consistent appearance)`;
    return '';
  }).filter(Boolean).join('\n');
}

export async function resolveStoryCharacters(story) {
  const chars = [];
  const seen = new Set();
  if (story.child_character_id && !seen.has(story.child_character_id)) {
    try {
      const c = await charactersService.get(story.child_character_id);
      chars.push({ name: c.name, description: c.description });
      seen.add(story.child_character_id);
    } catch {}
  }
  const secondary = Array.isArray(story.secondary_characters) ? story.secondary_characters : [];
  for (const s of secondary) {
    if (s.character_id && !seen.has(s.character_id)) {
      try {
        const c = await charactersService.get(s.character_id);
        chars.push({ name: c.name, description: c.description });
        seen.add(s.character_id);
      } catch {}
    } else if (s.quick_description) chars.push({ name: '', description: s.quick_description });
  }
  return chars;
}

export const generateStoryContent = (input) => aiService.generateStory(input);

export async function generatePageImage({ storyId, pageNumber, text }) {
  const result = await aiService.generatePageImage({ storyId, pageNumber, text });
  return result.image_path;
}

export async function suggestContinuation({ storyId }) {
  const result = await aiService.suggestContinuation(storyId);
  return result.suggestion;
}

export const generateContinuation = ({ storyId, pageCount, continuationPrompt }) =>
  aiService.continueStory(storyId, pageCount, continuationPrompt);

export async function translateStory({ storyId, language }) {
  const result = await aiService.translateStory(storyId, language);
  return result.translations;
}

export async function analyzeChildCharacter(characterId) {
  const result = await aiService.analyzeCharacter(characterId);
  return result.description;
}

export async function generateCharacterImage(characterId, description) {
  const result = await aiService.generateCharacterImage(characterId, description);
  return result.character_image_path;
}
