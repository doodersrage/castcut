import { getFaceDetailerHealth } from './face-detailer-health';
import { isFluxKleinModel, isZImageModel } from './model-denoise-defaults';
import { resolveKleinEnhancerIdentityPreset } from './klein-enhancer-workflow-patch';
import { normalizeInputImageFilenames } from './workflow-load-image-bindings';

/** Default IP-Adapter weight for Compose identity lock (Edit + IP can overfit if higher). */
export const DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH = 0.5;

export const DEFAULT_COMPOSE_IDENTITY_KIND = 'ipadapter' as const;

/** Generate sidebar identity lock — skip Z-Image (no IP-Adapter/InstantID path). */
export function modelSupportsSessionIdentityLock(model?: string | null): boolean {
  const id = model?.trim();
  return Boolean(id) && !isZImageModel(id);
}

export type ComposeIdentityKind = 'ipadapter' | 'instantid' | 'pulid' | 'auto';

export type ComposeIdentityLockState = {
  enabled: boolean;
  strength: number;
  identityKind: ComposeIdentityKind;
};

export function normalizeComposeIdentityKind(value: unknown): ComposeIdentityKind {
  if (value === 'ipadapter' || value === 'instantid' || value === 'pulid' || value === 'auto') {
    return value;
  }
  return DEFAULT_COMPOSE_IDENTITY_KIND;
}

export function normalizeComposeIdentityLockStrength(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH;
  }
  return Math.min(1, Math.max(0.05, Math.round(n * 100) / 100));
}

export function normalizeComposeIdentityLock(
  enabled: unknown,
  strength: unknown,
  identityKind?: unknown
): ComposeIdentityLockState {
  return {
    enabled: enabled === true,
    strength: normalizeComposeIdentityLockStrength(strength),
    identityKind: normalizeComposeIdentityKind(identityKind),
  };
}

export type ComposeIdentityLockQueuePatch = {
  ipAdapterImageFilename: string;
  ipAdapterImageFilenames: string[];
  ipAdapterStrength: number;
  identityKind: ComposeIdentityKind;
};

/** Queue-time identity patch when lock is on and Figure 1 was uploaded. */
export function buildComposeIdentityLockQueuePatch(input: {
  enabled: boolean;
  strength?: number;
  identityKind?: unknown;
  inputImageFilename?: string | null;
}): ComposeIdentityLockQueuePatch | null {
  if (!input.enabled) {
    return null;
  }
  const filename = input.inputImageFilename?.trim();
  if (!filename) {
    return null;
  }
  const strength = normalizeComposeIdentityLockStrength(input.strength);
  const identityKind = normalizeComposeIdentityKind(input.identityKind);
  return {
    ipAdapterImageFilename: filename,
    ipAdapterImageFilenames: [filename],
    ipAdapterStrength: strength,
    identityKind,
  };
}

export type ComposeKleinQueuePatch = {
  inputImageFilename: string;
  /** Full Figure 1–N list for ReferenceLatent multi-ref wiring. */
  inputImageFilenames?: string[];
  ipAdapterImageFilename?: string;
  ipAdapterImageFilenames?: string[];
  ipAdapterStrength?: number;
  identityKind?: ComposeIdentityKind;
};

/**
 * Klein Compose queue mapping: Figure 1–N → ReferenceLatent instruction edit
 * (via inputImageFilenames). Optional identity lock still stacks IP-Adapter /
 * InstantID on Figure 1 only — extras use ReferenceLatent, not IP-Adapter.
 */
export function buildComposeKleinQueuePatch(input: {
  model?: string | null;
  inputImageFilename?: string | null;
  inputImageFilenames?: string[] | null;
  identityLock?: boolean;
  identityLockStrength?: number;
  identityKind?: unknown;
}): ComposeKleinQueuePatch | null {
  if (!isFluxKleinModel(input.model)) {
    return null;
  }
  const figures = normalizeInputImageFilenames(
    input.inputImageFilename,
    input.inputImageFilenames ?? undefined
  );
  const fig1 = figures[0]?.trim();
  if (!fig1) {
    return null;
  }

  const patch: ComposeKleinQueuePatch = {
    inputImageFilename: fig1,
    inputImageFilenames: figures,
  };
  if (input.identityLock) {
    patch.ipAdapterImageFilename = fig1;
    patch.ipAdapterImageFilenames = [fig1];
    patch.ipAdapterStrength = normalizeComposeIdentityLockStrength(input.identityLockStrength);
    patch.identityKind = normalizeComposeIdentityKind(input.identityKind);
  }
  return patch;
}

export function formatComposeIdentityLockHint(input: {
  enabled: boolean;
  strength?: number;
  identityKind?: unknown;
}): string {
  if (!input.enabled) {
    return 'Off — Edit refs only (no identity pull).';
  }
  const strength = normalizeComposeIdentityLockStrength(input.strength);
  const identityKind = normalizeComposeIdentityKind(input.identityKind);
  const face = getFaceDetailerHealth();
  const faceNote =
    face.status === 'ready'
      ? `FaceDetailer ready — optional gallery Face detail after queue.`
      : face.status === 'partial'
        ? `FaceDetailer scaffold pinned — install Impact Pack for gallery Face detail.`
        : face.status === 'detected'
          ? `FaceDetailer detected — optional gallery Face detail after queue.`
          : 'FaceDetailer not configured.';

  if (identityKind === 'instantid') {
    return `Lock Figure 1 via InstantID @ ${strength.toFixed(2)}. ${faceNote}`;
  }
  if (identityKind === 'pulid') {
    return `Lock Figure 1 via PuLID @ ${strength.toFixed(2)}. ${faceNote}`;
  }
  if (identityKind === 'auto') {
    return `Lock Figure 1 via InstantID/PuLID auto @ ${strength.toFixed(2)}. ${faceNote}`;
  }
  return `Lock Figure 1 via IP-Adapter @ ${strength.toFixed(2)}. ${faceNote}`;
}

/** Hint when Klein Enhancer pack replaces IP-Adapter identity lock. */
export function formatKleinEnhancerIdentityHint(input: {
  enabled?: boolean;
  identityLockStrength?: number;
  preset?: import('./klein-enhancer-workflow-patch').KleinEnhancerIdentityPreset;
  textEnhancerEnabled?: boolean;
  colorAnchorEnabled?: boolean;
  model?: string | null;
}): string {
  if (input.enabled === false) {
    return 'Off — stock ReferenceLatent chain (no Identity Feature Transfer Final).';
  }
  const preset = resolveKleinEnhancerIdentityPreset({
    preset: input.preset,
    identityLockStrength: input.identityLockStrength,
    model: input.model,
  });
  const parts = [
    `Flux2 Klein Enhancer · Identity Feature Transfer Final (${preset.replace('_', ' ')})`,
    'Multi ReferenceLatent for figures',
  ];
  if (input.textEnhancerEnabled !== false) {
    parts.push('Text Enhancer on prompt conditioning');
  }
  if (input.colorAnchorEnabled !== false) {
    parts.push('Color Anchor on model path');
  }
  return `${parts.join('; ')}.`;
}

/** Hint when pack is on but Compose identity lock is off (Multi Ref without Final). */
export function formatKleinEnhancerComposeHint(input: {
  enabled?: boolean;
  textEnhancerEnabled?: boolean;
  colorAnchorEnabled?: boolean;
}): string {
  if (input.enabled === false) {
    return 'Off — stock ReferenceLatent chain.';
  }
  const parts = ['Flux2 Klein Enhancer · Multi ReferenceLatent for figures'];
  if (input.textEnhancerEnabled !== false) {
    parts.push('Text Enhancer on prompt conditioning');
  }
  if (input.colorAnchorEnabled !== false) {
    parts.push('Color Anchor on model path');
  }
  parts.push('enable Identity lock for Feature Transfer Final');
  return `${parts.join('; ')}.`;
}

/** Hint for plain Klein T2I when only Text Enhancer applies. */
export function formatKleinEnhancerT2IHint(input: {
  enabled?: boolean;
  textEnhancerEnabled?: boolean;
}): string {
  if (input.enabled === false || input.textEnhancerEnabled === false) {
    return 'Off — stock Klein T2I conditioning.';
  }
  return 'Flux2 Klein Enhancer · Text Enhancer on positive conditioning (subtle prompt emphasis).';
}

/** True when queue should prefer InstantID/PuLID insert over IP-Adapter. */
export function composeIdentityUsesIdentityChain(identityKind: unknown): boolean {
  const kind = normalizeComposeIdentityKind(identityKind);
  return kind === 'instantid' || kind === 'pulid' || kind === 'auto';
}
