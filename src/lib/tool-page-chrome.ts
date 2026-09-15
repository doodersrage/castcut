import { isLeanWorkspaceMode, type WorkspaceMode } from './workspace-mode';

/** Shared ToolLayout sidebar copy — matches Generate simplified chrome. */
export const TOOL_SIDEBAR_TITLE = 'Settings';

export const TOOL_SIDEBAR_DESCRIPTION =
  'Model and detail for this run. Queue quality and LoRA live under Advanced.';

/** Canonical setup banner labels (align with nav catalog where possible). */
export const TOOL_SETUP_LABELS = {
  generate: 'Generate',
  format: 'Format',
  character: 'Character',
  characters: 'Cast',
  background: 'Background',
  pet: 'Pet',
  fantasy: 'Fantasy',
  refine: 'Refine',
  compose: 'Compose',
  inpaint: 'Inpaint',
  outpaint: 'Outpaint',
  controlnet: 'ControlNet',
  negative: 'Negative',
  imagePrompt: 'Image → Prompt',
  video: 'Video',
  audio: 'Audio',
  mesh: 'Mesh',
  logo: 'Logo',
  lint: 'Lint',
  promptEditor: 'Prompt Editor',
  topics: 'Topics',
  variations: 'Variations',
  gallery: 'Gallery',
  queue: 'Queue',
  workflowEditor: 'Workflow editor',
  settings: 'Settings',
  studio: 'Studio',
  nsfwGenerator: 'Adult generator',
  roleplay: 'Story',
  fitting: 'Outfit',
  day: 'Day',
  moodboard: 'Look',
  dashboard: 'Dashboard',
  profile: 'Profile',
} as const;

/** ToolLayout width rules. */
export const TOOL_PAGE_WIDTH = {
  tool: 'default',
  hubWide: 'wide',
  pluginDetail: 'full',
} as const;

export function descriptionForWorkspace(mode: WorkspaceMode, full: string, simple: string): string {
  return isLeanWorkspaceMode(mode) ? simple : full;
}

/** Hub page descriptions — full vs Simple workspace. */
export const HUB_PAGE_DESCRIPTIONS = {
  gallery: {
    full: 'Browse outputs, review and compare variants, run experiments, and queue follow-up work from one place.',
    simple: 'Browse and review outputs — use search and filters when you need to dig in.',
  },
  queue: {
    full: 'Pending and running jobs across gallery entries. Live ComfyUI queue stats refresh every few seconds.',
    simple: 'Active jobs at a glance — expand sections below for failed runs and recent outputs.',
  },
  dashboard: {
    full: 'Pending ComfyUI jobs, recent outputs, queue status, and your active project — without the generator UI in the way.',
    simple:
      'Queue status and recent outputs at a glance — open Generate when you are ready to create.',
  },
  settings: {
    full: 'Organized by area — browser overrides apply per session; server defaults come from .env.local (see Overview).',
    simple:
      'Essentials for Simple workspace — expand all settings when you need LLM, automation, or admin tools.',
  },
  settingsExpanded: {
    full: 'Organized by area — browser overrides apply per session; server defaults come from .env.local (see Overview).',
    simple: 'All settings visible — switch back to essentials anytime from the sidebar.',
  },
  profile: {
    full: 'Appearance, alerts, account settings, backup, and workspace preferences.',
    simple: 'Appearance and alerts — account essentials without admin clutter.',
  },
} as const;

/** Omit verbose ToolSection descriptions in Simple workspace. */
export function sectionDescriptionForWorkspace(
  mode: WorkspaceMode,
  full: string
): string | undefined {
  return isLeanWorkspaceMode(mode) ? undefined : full;
}
