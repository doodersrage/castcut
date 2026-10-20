import { getLogoStylePreset, type LogoMotifId, type LogoStylePresetId } from '../app/logo-presets';
import { runSpecializedPrompt } from './runner';
import type { LogoOptions, ToolGenerateResult } from './types';

function buildLogoTemplate(options: LogoOptions): string {
  const preset = getLogoStylePreset(options.stylePreset);
  const brand = options.brandName?.trim() || 'Brand';
  const industry = options.industry?.trim();
  const tagline = options.tagline?.trim();
  const notes = options.extraNotes?.trim();

  const parts = [
    `Professional logo design for "${brand}"`,
    industry ? `industry: ${industry}` : null,
    tagline ? `tagline mood: ${tagline}` : null,
    preset.promptHints,
    options.includeWordmark === false
      ? 'symbol only, no typography, no letters'
      : 'may include stylized wordmark if readable',
    'flat vector-friendly mark, centered composition, solid or simple gradient background',
    'square 1:1 framing, high contrast, crisp edges, minimal detail',
    'no mockup, no business card, no scene, no people, no watermark other than the logo itself',
    notes ? `notes: ${notes}` : null,
  ].filter(Boolean);

  return parts.join(', ');
}

export async function generateLogoPrompt(options: LogoOptions): Promise<ToolGenerateResult> {
  const preset = getLogoStylePreset(options.stylePreset);
  const brand = options.brandName?.trim() || 'Brand';
  const industry = options.industry?.trim();
  const tagline = options.tagline?.trim();
  const notes = options.extraNotes?.trim();
  const motif = options.motif ?? preset.defaultMotif;

  const toolInstructions = `You are a logo and brand-mark prompt writer for image generation (ComfyUI / diffusion).
- Write ONE positive prompt for a LOGO or APP ICON — not a photo, not a UI mockup, not a poster.
- Describe a centered mark on a clean solid or subtle gradient background.
- Prefer flat shapes, limited palette (2–4 colors), crisp edges, and large clear silhouettes.
- Square 1:1 composition with padding; the mark should read at favicon size.
- Logos and letterforms ARE desired here — unlike scene prompts, typography and symbols are allowed when requested.
- Avoid: busy scenes, people, products, screenshots, watermarks, blurry text, photographic textures, excessive fine detail.
- Do not wrap the prompt in quotes or add a negative prompt section.`;

  const userMessage = [
    `Brand name: ${brand}`,
    industry ? `Industry / vibe: ${industry}` : null,
    tagline ? `Tagline (optional wordmark cue): ${tagline}` : null,
    `Style preset: ${preset.label} — ${preset.promptHints}`,
    `Vector motif reference: ${motif}`,
    options.includeWordmark === false
      ? 'Output: symbol/mark ONLY — no readable text.'
      : 'Output: mark plus readable wordmark if it strengthens the design.',
    notes ? `Extra direction: ${notes}` : null,
    options.avoidedTokensInstruction ?? null,
    'Write one concise logo-generation prompt (1–3 sentences).',
  ]
    .filter(Boolean)
    .join('\n');

  return runSpecializedPrompt({
    model: options.model,
    detail: options.detail === 'concise' ? 'balanced' : options.detail,
    toolInstructions,
    userMessage,
    allowTemplateFallback: options.llm?.allowTemplateFallback,
    temperature: options.llm?.temperature,
    llmModel: options.llm?.llmModel,
    llmEnabled: options.llm?.llmEnabled,
    llmProvider: options.llm?.llmProvider,
    llmApiKey: options.llm?.llmApiKey,
    templateFallback: () => buildLogoTemplate(options),
    enforceMinimum: false,
    metadata: {
      brandName: brand,
      industry: industry ?? null,
      tagline: tagline ?? null,
      stylePreset: preset.id,
      motif,
      includeWordmark: options.includeWordmark !== false,
    },
  });
}

export type { LogoMotifId, LogoStylePresetId };
