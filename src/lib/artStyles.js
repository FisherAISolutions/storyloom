export const ART_STYLES = [
  { id: 'watercolor', label: 'Watercolor', prompt: 'soft hand-painted watercolor, whimsical, warm pastel palette, gentle brush texture, dreamy storybook lighting' },
  { id: 'cartoon', label: 'Cartoon', prompt: 'bold flat cartoon illustration, clean vector outlines, bright saturated colors, playful modern kids cartoon style' },
  { id: 'crayon', label: 'Crayon', prompt: "children's crayon drawing, textured wax crayon strokes, visible paper grain, colorful and handmade" },
  { id: 'pencil', label: 'Colored pencil', prompt: 'soft colored pencil sketch, gentle shading, light paper texture, warm and cozy' },
  { id: 'claymation', label: '3D claymation', prompt: 'cute 3D claymation style, rounded soft clay shapes, soft studio lighting, animation still' },
  { id: 'collage', label: 'Paper collage', prompt: 'cut-paper collage illustration, layered textured paper, craft scissors look, storybook collage' },
];

export const DEFAULT_ART_STYLE = 'watercolor';

export const getStylePrompt = (id) => (ART_STYLES.find((s) => s.id === id) || ART_STYLES[0]).prompt;

export const getStyleLabel = (id) => (ART_STYLES.find((s) => s.id === id) || ART_STYLES[0]).label;