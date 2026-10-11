/**
 * What a still was made from, read off its own graph: every picture the graph loads, named by
 * the role the app gave it when it uploaded it (the file-name prefix). For the "Made with" tray
 * on a Day slot / Story scene — UI audit (2026-10-11): nothing showed which face, plate, clothes,
 * partner or pose guide a still used, so a still with the wrong person could not be explained.
 */

export type StillReferenceRole =
  'face' | 'look' | 'clothes' | 'shoes' | 'partner' | 'pose' | 'end-pose' | 'picture';

export type StillReference = {
  role: StillReferenceRole;
  label: string;
  /** ComfyUI input file name. */
  filename: string;
};

/** Prefix → role, most specific first (the app's upload names, see the queue code). */
const PREFIX_ROLES: Array<[RegExp, StillReferenceRole]> = [
  [
    /^(?:day|story)-nude-face-|^day-vacation-face|^day-face-id-ref-|^day-identity-rl-|face-crop/,
    'face',
  ],
  [/^day-partner/, 'partner'],
  [/^day-pose-guide-/, 'pose'],
  [/^ffab-day-end-pose-/, 'end-pose'],
  [/^shoe-|^day-dress-plate-feet-/, 'shoes'],
  [/^garment-|^day-outfit-cut-|^day-outfit-vl-/, 'clothes'],
  [
    /^day-dress-plate-|^day-vacation-keep-|^day-plate-|^cast-plate|^outfit-|^fitting-ref-|^roleplay-ref-|^roleplay-|^castcut-isolate-/,
    'look',
  ],
];

const ROLE_LABELS: Record<StillReferenceRole, string> = {
  face: 'Face',
  look: 'Look',
  clothes: 'Clothes',
  shoes: 'Shoes',
  partner: 'Partner',
  pose: 'Pose guide',
  'end-pose': 'End pose',
  picture: 'Picture',
};

const ROLE_ORDER: StillReferenceRole[] = [
  'face',
  'look',
  'clothes',
  'shoes',
  'partner',
  'pose',
  'end-pose',
  'picture',
];

export function stillReferenceRole(filename: string): StillReferenceRole {
  const name = filename.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  for (const [pattern, role] of PREFIX_ROLES) {
    if (pattern.test(name)) return role;
  }
  return 'picture';
}

type GraphNode = { class_type?: unknown; inputs?: Record<string, unknown> };

/** The pictures a ComfyUI API graph loads, one per file, in tray order. */
export function stillReferencesFromGraph(graph: unknown): StillReference[] {
  if (!graph || typeof graph !== 'object') return [];
  const seen = new Set<string>();
  const out: StillReference[] = [];
  for (const node of Object.values(graph as Record<string, GraphNode>)) {
    if (!node || typeof node !== 'object' || node.class_type !== 'LoadImage') continue;
    const filename = typeof node.inputs?.image === 'string' ? node.inputs.image.trim() : '';
    if (!filename || seen.has(filename)) continue;
    seen.add(filename);
    const role = stillReferenceRole(filename);
    out.push({ role, label: ROLE_LABELS[role], filename });
  }
  return out.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

/** View URL for a ComfyUI input picture, through the app's proxy. */
export function stillReferenceViewUrl(filename: string): string {
  const parts = filename.split('/');
  const name = parts.pop() ?? filename;
  const params = new URLSearchParams({ filename: name, type: 'input' });
  if (parts.length) params.set('subfolder', parts.join('/'));
  return `/api/comfyui/view?${params.toString()}`;
}
