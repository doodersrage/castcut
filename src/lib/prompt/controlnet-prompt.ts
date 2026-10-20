export type ControlNetMode = 'depth' | 'pose' | 'canny' | 'normal' | 'lineart';

export type ControlNetPromptRequest = {
  mode: ControlNetMode;
  subject: string;
  scene?: string;
  detail?: string;
};

const MODE_GUIDANCE: Record<ControlNetMode, string> = {
  depth:
    'Describe spatial depth layers: foreground, midground, background separation and relative distance.',
  pose: 'Describe body pose, limb angles, weight distribution, and facing direction without outfit prose.',
  canny: 'Describe sharp structural edges, silhouettes, and high-contrast boundaries only.',
  normal:
    'Describe surface orientation and lighting-facing planes; emphasize geometric form over texture.',
  lineart: 'Describe clean contour lines and outline structure; avoid shading vocabulary.',
};

export function buildControlNetPrompt(request: ControlNetPromptRequest): string {
  const subject = request.subject.trim();
  const scene = request.scene?.trim();
  const detail = request.detail?.trim();
  const parts = [
    MODE_GUIDANCE[request.mode],
    subject ? `Subject structure: ${subject}.` : '',
    scene ? `Scene context: ${scene}.` : '',
    detail ? `Extra constraints: ${detail}.` : '',
    'Keep phrasing concise and structure-focused for ControlNet conditioning.',
  ];
  return parts.filter(Boolean).join(' ');
}

export function normalizeControlNetMode(value: unknown): ControlNetMode {
  if (
    value === 'depth' ||
    value === 'pose' ||
    value === 'canny' ||
    value === 'normal' ||
    value === 'lineart'
  ) {
    return value;
  }
  return 'depth';
}
