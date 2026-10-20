import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';

export type HistoryEntryNavigation = {
  path: string;
  mode?: 'solo' | 'duo' | 'compose';
};

const TOOL_PATHS: Record<string, string> = {
  pet: '/pet',
  fantasy: '/fantasy',
  roleplay: '/story',
  'nsfw-generator': '/plugins/nsfw-generator',
  background: '/background',
  character: '/character',
  compose: '/compose',
  generate: '/',
  randomScene: '/',
  topics: '/topics',
  variations: '/variations',
  refine: '/refine',
  inpaint: '/inpaint',
  outpaint: '/outpaint',
  video: '/video',
  controlnet: '/controlnet',
  imagePrompt: '/image-prompt',
  audio: '/audio',
  mesh: '/mesh',
  lint: '/lint',
  format: '/format',
  'prompt-editor': '/prompt',
  promptEditor: '/prompt',
  'workflow-editor': '/workflow-editor',
  workflowEditor: '/workflow-editor',
  negative: '/negative',
};

export function resolveHistoryEntryNavigation(entry: PromptHistoryEntry): HistoryEntryNavigation {
  // Character “with background” mode (legacy tool id was also "compose").
  if (entry.tool === 'scene-compose') {
    return { path: '/character', mode: 'compose' };
  }

  // Multi-image Compose / Transfer tool.
  if (entry.tool === 'compose') {
    return { path: '/compose' };
  }

  const sceneMode =
    entry.tool === 'duo' || entry.diagnostics?.inferred.duoMode
      ? 'duo'
      : entry.tool === 'character'
        ? 'solo'
        : null;

  if (sceneMode !== null) {
    return { path: '/character', mode: sceneMode };
  }

  return { path: TOOL_PATHS[entry.tool] ?? '/' };
}

export function extractHintsFromHistoryEntry(entry: PromptHistoryEntry): string {
  if (entry.hints?.trim()) {
    return entry.hints.trim();
  }
  if (
    entry.tool === 'generate' ||
    entry.tool === 'randomScene' ||
    entry.tool === 'nsfw-generator'
  ) {
    return entry.prompt.slice(0, 500);
  }
  return entry.prompt.slice(0, 400);
}
