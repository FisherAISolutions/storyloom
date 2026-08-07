export const MODELS = Object.freeze({
  TEXT: Deno.env.get('OPENAI_TEXT_MODEL') || 'gpt-5.6-sol',
  VISION: Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-5.6-sol',
  IMAGE: Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2',
});

export const STORY_PAGE_COUNTS = new Set([6, 10, 15]);
export const CONTINUATION_PAGE_COUNTS = new Set([3, 5, 10]);
export const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese',
};
export const ART_STYLE_PROMPTS: Record<string, string> = {
  watercolor: 'soft hand-painted watercolor, whimsical, warm pastel palette, gentle brush texture, dreamy storybook lighting',
  cartoon: 'bold flat cartoon illustration, clean vector outlines, bright saturated colors, playful modern kids cartoon style',
  crayon: "children's crayon drawing, textured wax crayon strokes, visible paper grain, colorful and handmade",
  pencil: 'soft colored pencil sketch, gentle shading, light paper texture, warm and cozy',
  claymation: 'cute 3D claymation style, rounded soft clay shapes, soft studio lighting, animation still',
  collage: 'cut-paper collage illustration, layered textured paper, craft scissors look, storybook collage',
};

export const LIMITS = Object.freeze({
  PROMPT: 4_000,
  TEXT: 4_000,
  SUMMARY: 2_000,
  CHARACTERS: 3,
  TRANSLATION_PAGES: 25,
  IMAGE_BYTES: 20 * 1024 * 1024,
});
