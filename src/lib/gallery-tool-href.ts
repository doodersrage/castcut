/**
 * Map a gallery entry's queue-time `tool` id onto an in-app route.
 * Unknown / missing tools fall back to Generate.
 */

const TOOL_HREF: Record<string, string> = {
  generate: '/',
  randomScene: '/',
  character: '/character',
  duo: '/character?mode=duo',
  'scene-compose': '/character?mode=compose',
  background: '/background',
  pet: '/pet',
  fantasy: '/fantasy',
  roleplay: '/story',
  day: '/day',
  fitting: '/fitting',
  moodboard: '/moodboard',
  refine: '/refine',
  inpaint: '/inpaint',
  outpaint: '/outpaint',
  compose: '/compose',
  controlnet: '/controlnet',
  video: '/video',
  variations: '/variations',
  topics: '/topics',
  imagePrompt: '/image-prompt',
  'image-prompt': '/image-prompt',
  format: '/format',
  lint: '/lint',
  negative: '/negative',
  audio: '/audio',
  mesh: '/mesh',
  'prompt-editor': '/prompt',
  'nsfw-generator': '/plugins/nsfw-generator',
  upload: '/gallery',
  portfolio: '/studio?tab=portfolio',
};

const TOOL_LABEL: Record<string, string> = {
  generate: 'Generate',
  randomScene: 'Generate',
  character: 'Character',
  duo: 'Character',
  'scene-compose': 'Character',
  background: 'Background',
  pet: 'Pet',
  fantasy: 'Fantasy',
  roleplay: 'Story',
  day: 'Day',
  fitting: 'Outfit',
  moodboard: 'Look',
  refine: 'Refine',
  inpaint: 'Inpaint',
  outpaint: 'Outpaint',
  compose: 'Compose',
  controlnet: 'ControlNet',
  video: 'Video',
  variations: 'Variations',
  topics: 'Topics',
  imagePrompt: 'Image → Prompt',
  'image-prompt': 'Image → Prompt',
  format: 'Format',
  lint: 'Lint',
  negative: 'Negative',
  audio: 'Audio',
  mesh: '3D Mesh',
  'prompt-editor': 'Prompt Editor',
  'nsfw-generator': 'Adult generator',
  upload: 'Upload',
  studio: 'Studio',
  portfolio: 'Studio',
};

export function galleryToolHref(tool?: string): string {
  const key = tool?.trim();
  if (!key) {
    return '/';
  }
  return TOOL_HREF[key] ?? '/';
}

/** Play tools that open on a Cast (`?character=`). */
const CAST_TOOLS = new Set(['day', 'fitting', 'moodboard', 'roleplay']);

/** Route for an entry — Play tools open on the entry's Cast when it has one. */
export function galleryToolHrefForEntry(entry: { tool?: string; characterId?: string }): string {
  const href = galleryToolHref(entry.tool);
  const castId = entry.characterId?.trim();
  if (!castId || !CAST_TOOLS.has(entry.tool?.trim() ?? '')) {
    return href;
  }
  return `${href}${href.includes('?') ? '&' : '?'}character=${encodeURIComponent(castId)}`;
}

export function galleryToolLabel(tool?: string): string {
  const key = tool?.trim();
  if (!key) {
    return 'Generate';
  }
  return TOOL_LABEL[key] ?? 'Generate';
}
