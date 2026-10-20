'use client';

import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { resolveDiffusersModelHint } from '@/lib/engine/diffusers-defaults';
import { resolveQueueParams } from '@/lib/queue/params-settings';

export default function DiffusersSamplingReadout({
  model,
  checkpointMap,
  toolId,
  workshopCrop,
}: {
  model: ComfyImageModel;
  checkpointMap?: Partial<Record<string, string>>;
  toolId?: string;
  workshopCrop: 'auto' | 'always' | 'never';
}) {
  const params = resolveQueueParams({ model, tool: toolId ?? 'generate' });
  const checkpoint = resolveDiffusersModelHint(model, checkpointMap);
  const steps = typeof params.steps === 'number' ? params.steps : Number(params.steps) || 40;
  const cfg = typeof params.cfg === 'number' ? params.cfg : Number(params.cfg) || 5.5;
  const width = typeof params.width === 'number' ? params.width : Number(params.width) || 1024;
  const height = typeof params.height === 'number' ? params.height : Number(params.height) || 1024;
  const seed =
    params.seed === undefined || params.seed === '' || params.seed === -1
      ? 'random'
      : String(params.seed);
  const cropLabel =
    workshopCrop === 'always'
      ? 'crop hands'
      : workshopCrop === 'never'
        ? 'allow hands'
        : 'auto crop';
  return (
    <p className="rounded-lg border border-[var(--border-default)]/60 bg-[var(--bg-base)]/50 px-3 py-2 text-xs leading-relaxed text-[var(--text-muted)]">
      Diffusers · <span className="text-[var(--text-primary)]">{checkpoint}</span>
      {' · '}
      {width}×{height} · {steps} steps · CFG {cfg}
      {' · '}
      seed {seed} · {cropLabel}
    </p>
  );
}
