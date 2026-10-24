/**
 * Pose bench on Fibo 2.0 Edit Turbo from an earlier bench's Qwen-Image 2.1 captures: the same Day
 * graphs (prompt, references, canvas), converted the way the app converts them
 * (convertImage21WorkflowToFibo2), at the same seeds — run_jobs.py renders the jobs.
 *
 *   node --import tsx scripts/pose-bench/to_fibo.mts <work-dir> <jobs.jsonl> [--from ENGINE]
 *        [--seeds 11,22] [--unet FILE] [--no-map-line]
 *
 * <work-dir>/cap/<ENGINE>/*\/capture.json (default ENGINE qwen-image-2.1-edit-turbo-8).
 * --unet: the pack's converted checkpoint as ComfyUI lists it. --no-map-line: leave the pose-map
 * lead line out (A/B).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  convertImage21WorkflowToFibo2,
  FIBO2_DEFAULT_FILES,
  fibo2PoseMapLine,
} from '../../src/lib/engine/fibo2-renderer';

const args = process.argv.slice(2);
const [work, out] = args as [string, string];
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const from = flag('--from') ?? 'qwen-image-2.1-edit-turbo-8';
const seeds = (flag('--seeds') ?? '11,22').split(',').map(Number);
const unet = flag('--unet') ?? FIBO2_DEFAULT_FILES.unet;
const noMapLine = args.includes('--no-map-line');
const tag = flag('--tag') ?? 'fibo-2-edit-turbo';

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
const lines: string[] = [];
const root = path.join(work, 'cap', from);
for (const batch of readdirSync(root).sort()) {
  const file = path.join(root, batch, 'capture.json');
  if (!existsSync(file)) continue;
  const cap = JSON.parse(readFileSync(file, 'utf8')) as {
    rows: Array<{ target: string; mode: string; graph?: { prompt?: Graph } | Graph }>;
  };
  for (const row of cap.rows) {
    const body = row.graph as { prompt?: Graph } | undefined;
    const graph = (body?.prompt ?? body) as Graph | undefined;
    if (!graph) continue;
    const converted = convertImage21WorkflowToFibo2(graph, {
      files: { ...FIBO2_DEFAULT_FILES, unet },
    });
    if (!converted.converted) {
      console.error('not converted', row.mode, row.target);
      continue;
    }
    for (const seed of seeds) {
      const g = structuredClone(converted.workflow) as Graph;
      for (const node of Object.values(g)) {
        if (typeof node.inputs.noise_seed === 'number') node.inputs.noise_seed = seed;
        if (typeof node.inputs.seed === 'number') node.inputs.seed = seed;
        if (node.class_type === 'SaveImage') {
          node.inputs.filename_prefix = `posebench-${tag}-${row.mode}-${row.target}-s${seed}`;
        }
        if (noMapLine && typeof node.inputs.prompt === 'string') {
          const lead = /^<image_(\d)> is only a stick-figure pose map/.exec(node.inputs.prompt);
          if (lead) {
            node.inputs.prompt = node.inputs.prompt
              .slice(fibo2PoseMapLine(Number(lead[1])).length)
              .trimStart();
          }
        }
      }
      lines.push(
        JSON.stringify({
          key: `${tag}|${row.mode}|${row.target}|${seed}`,
          engine: tag,
          mode: row.mode,
          target: row.target,
          seed,
          graph: g,
        })
      );
    }
  }
}
writeFileSync(out, lines.join('\n') + '\n');
console.log('jobs', lines.length, '→', out);
