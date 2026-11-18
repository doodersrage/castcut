/**
 * A script scene shot from one master (the flagship, 2026-11-17: "it looks a little jumpy but way
 * more consistent"). The scene's wide shot of the two of them is its master; every other shot
 * is cut from it — the two-shot, closer on her, closer on him — and given its detail back by
 * Qwen-Image 2.1 from the cut itself, so the place, the light, what they hold and where each
 * stands are the master's in every shot. Rendered one by one, the stairwell's shots each had
 * their own wall, light and lamp, and swapped who stood where. Pure.
 */

import { slotReactor } from './clip-direction';
import type { SavedScene } from './scenes';

/** What a shot cuts from its master: both, or one of them; how close. */
export type MasterCut = { who: 'both' | 'lead' | 'partner'; shot: 'waist' | 'head' };

/** The script scene a Scene belongs to (its shots share a master). */
export function sceneMasterGroup(scene: SavedScene): string | null {
  const from = scene.fromScript;
  return from?.scriptId && from.sceneId ? `${from.scriptId}|${from.sceneId}` : null;
}

function isEstablishing(scene: SavedScene): boolean {
  return /·\s*Establishing\s*$/i.test(scene.name);
}

/** Each script scene's master: its wide shot of the two of them, with a kept take. */
export function sceneMasters(scenes: readonly SavedScene[]): Map<string, SavedScene> {
  const out = new Map<string, SavedScene>();
  for (const scene of scenes) {
    const group = sceneMasterGroup(scene);
    if (!group || out.has(group) || !isEstablishing(scene)) continue;
    if (scene.allowCompanions !== true || !scene.keptTakeId) continue;
    out.set(group, scene);
  }
  return out;
}

/**
 * The cut a shot takes from its scene's master; null for the master itself, a shot of the place
 * alone, or a wide of its own. A two-shot is both of them (waist up — two don't fit a head
 * shot); a close reaction is the one who reacts; her alone is her.
 */
export function masterCutFor(scene: SavedScene, leadName?: string): MasterCut | null {
  if (isEstablishing(scene) || scene.slot.placeOnly) return null;
  const framing = scene.slot.poseCamera?.shot;
  if (framing === 'full') return null;
  const shot: MasterCut['shot'] = framing === 'head' ? 'head' : 'waist';
  if (scene.allowCompanions !== true) return { who: 'lead', shot };
  if (shot === 'head') {
    const reactor = slotReactor(scene.slot);
    if (reactor) {
      const lead = leadName?.trim().toLowerCase();
      return { who: lead && reactor.toLowerCase() === lead ? 'lead' : 'partner', shot: 'head' };
    }
  }
  return { who: 'both', shot: 'waist' };
}

/** What the detail pass is told: the cut kept exactly, only sharper. */
export const MASTER_CUT_KEEP_PROMPT =
  '<image1> is the photograph to keep: keep it exactly — the same people in the same places and poses, the same hands and whatever they hold, the same room, the same light and the same framing. ' +
  '<image2> is only the woman’s face and hair, <image3> only the man’s face and hair: those are the faces in <image1>. ' +
  'Make <image1> a sharp, detailed, natural photograph — real skin texture, crisp edges. Change nothing else; nothing added, removed or moved.';

/** How much of the cut is drawn again: enough to restore detail, too little to move anything. */
export const MASTER_CUT_START_SIGMA = 0.85;

type Node = { class_type: string; inputs: Record<string, unknown> };

/**
 * The detail pass, from the master's own Qwen-Image 2.1 graph (its models and the two faces it
 * was given): the cut is the picture to keep and the starting latent (from MASTER_CUT_START_SIGMA
 * on its schedule). Null when the graph isn't one.
 */
export function buildMasterCutDetailGraph(
  masterGraph: Record<string, unknown>,
  cutImage: string,
  seed: number
): Record<string, Node> | null {
  const graph = JSON.parse(JSON.stringify(masterGraph)) as Record<string, Node>;
  const entries = Object.entries(graph);
  const encode = entries.find(([, node]) => node?.class_type === 'TextEncodeQwenImage21');
  const vae = entries.find(([, node]) => node?.class_type === 'VAELoader')?.[0];
  const sampler = entries.find(([, node]) => node?.class_type === 'SamplerCustomAdvanced')?.[1];
  const sigmas = entries.find(([, node]) => node?.class_type === 'ManualSigmas')?.[1];
  if (!encode || !vae || !sampler || !sigmas) return null;
  const inputs = encode[1].inputs;
  const faceOfLead = inputs['images.image_1'];
  const faceOfPartner = inputs['images.image_2'];
  for (const key of Object.keys(inputs)) if (key.startsWith('images.')) delete inputs[key];
  graph.mastercut = { class_type: 'LoadImage', inputs: { image: cutImage } };
  graph.mastercutlatent = {
    class_type: 'VAEEncode',
    inputs: { pixels: ['mastercut', 0], vae: [vae, 0] },
  };
  inputs.prompt = MASTER_CUT_KEEP_PROMPT;
  inputs['images.image_1'] = ['mastercut', 0];
  if (faceOfLead) inputs['images.image_2'] = faceOfLead;
  if (faceOfPartner) inputs['images.image_3'] = faceOfPartner;
  sampler.inputs.latent_image = ['mastercutlatent', 0];
  const schedule = String(sigmas.inputs.sigmas ?? '')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isFinite(value));
  const tail = schedule.filter(value => value <= MASTER_CUT_START_SIGMA + 1e-6);
  sigmas.inputs.sigmas = (tail.length >= 2 ? tail : [MASTER_CUT_START_SIGMA, 0.4, 0])
    .map(value => value.toFixed(6))
    .join(', ');
  for (const node of Object.values(graph)) {
    if (node.class_type === 'RandomNoise') node.inputs.noise_seed = seed;
    if (node.class_type === 'SaveImage') node.inputs.filename_prefix = 'Castcut-master-cut';
    // The empty latent the master started from is no longer used.
  }
  for (const [id, node] of Object.entries(graph)) {
    if (node.class_type === 'EmptyLatentImage') delete graph[id];
  }
  return graph;
}

const sameCut = (a: MasterCut | null, b: MasterCut | null) =>
  !!a && !!b && a.who === b.who && a.shot === b.shot;

/** Script order within a scene: 7B before 7C. */
const shotLabel = (scene: SavedScene) => scene.name.split(' ')[0] ?? scene.name;

/**
 * Each shot's cut in script order, no two in a row the same (the flagship's stairwell,
 * 2026-11-17: "a little jumpy" — two two-shots back to back from one master are a jump cut).
 * A repeat goes closer: on her while she has a line, on him listening when she hasn't.
 */
export function masterCutsInOrder(
  shots: readonly SavedScene[],
  leadName?: string
): Map<string, MasterCut> {
  const out = new Map<string, MasterCut>();
  const ordered = [...shots].sort((a, b) =>
    shotLabel(a).localeCompare(shotLabel(b), undefined, { numeric: true })
  );
  let previous: MasterCut | null = null;
  for (const scene of ordered) {
    let cut = masterCutFor(scene, leadName);
    if (cut && sameCut(cut, previous)) {
      const speaks = !!scene.slot.line?.trim();
      const closer: MasterCut =
        cut.who === 'both' && scene.allowCompanions === true
          ? { who: speaks ? 'lead' : 'partner', shot: 'head' }
          : { who: cut.who, shot: cut.shot === 'head' ? 'waist' : 'head' };
      cut = closer;
    }
    if (cut) out.set(scene.id, cut);
    previous = cut;
  }
  return out;
}
