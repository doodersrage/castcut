'use client';

import { useState } from 'react';
import {
  isFaceChangingPoint,
  LORA_FACE_SAFE_DROP,
  loraChangesFaceAt,
  type LoraFaceCheck,
} from '@/lib/lora-check';
import { runLoraCheck, type LoraCheckRender } from '@/lib/lora-check-client';
import type { LoraLibraryEntry } from '@/lib/lora-stack';

type Props = {
  entry: LoraLibraryEntry;
  onSave: (patch: Partial<LoraLibraryEntry>) => void;
};

function verdict(check: LoraFaceCheck, strength: number): string {
  if (loraChangesFaceAt(check, strength)) {
    return check.recommendedStrength !== null
      ? `Changes the Cast's face at ${strength.toFixed(2)} — skipped on Day/Story. Holds up to ${check.recommendedStrength}.`
      : `Changes the Cast's face at every tested strength — skipped on Day/Story.`;
  }
  return check.recommendedStrength !== null
    ? `Keeps the Cast's face up to ${check.recommendedStrength}.`
    : 'Slight face drift at every tested strength.';
}

/** "Check on Cast": face drift of this LoRA per strength on real Day stills. */
export default function LoraFaceCheckSection({ entry, onSave }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [renders, setRenders] = useState<LoraCheckRender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const check = entry.faceCheck;
  const strength = entry.strengthModel ?? 1;

  const start = async () => {
    setRunning(true);
    setError(null);
    setRenders([]);
    try {
      const run = await runLoraCheck(entry, (done, total, render) => {
        setProgress({ done, total });
        if (render) setRenders(current => [...current, render]);
      });
      if (run.ok) {
        onSave({ faceCheck: run.check });
      } else {
        setError(run.reason);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'LoRA check failed.');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2" data-testid="lora-face-check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          Check on Cast
          <span className="text-[var(--text-muted)]/80">
            {' '}
            — replays your newest Day stills with this LoRA and measures the face
          </span>
        </p>
        <button
          type="button"
          onClick={() => void start()}
          disabled={running}
          data-testid="lora-face-check-run"
          className="type-caption ui-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
        >
          {running
            ? progress
              ? `Rendering ${progress.done}/${progress.total}…`
              : 'Starting…'
            : check
              ? 'Check again'
              : 'Check on Cast'}
        </button>
      </div>
      {error ? <p className="type-caption text-[var(--tint-danger-text)]">{error}</p> : null}
      {check && !running ? (
        <div className="space-y-1.5">
          <p
            className="type-caption text-[var(--text-secondary)]"
            data-testid="lora-face-check-verdict"
          >
            {verdict(check, strength)}
          </p>
          <table className="w-full text-[11px] text-[var(--text-muted)]">
            <thead>
              <tr className="text-left">
                <th className="font-normal">Strength</th>
                <th className="font-normal">Face match</th>
                <th className="font-normal">Change</th>
                <th />
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr>
                <td>off</td>
                <td>{check.baseline.toFixed(2)}</td>
                <td>—</td>
                <td />
              </tr>
              {check.points.map(point => (
                <tr key={point.strength}>
                  <td>{point.strength}</td>
                  <td>{point.similarity.toFixed(2)}</td>
                  <td
                    className={
                      isFaceChangingPoint(point)
                        ? 'text-[var(--tint-danger-text)]'
                        : point.drop > LORA_FACE_SAFE_DROP
                          ? 'text-[var(--tint-warning-text)]'
                          : ''
                    }
                  >
                    {point.drop > 0 ? '−' : '+'}
                    {Math.abs(point.drop).toFixed(2)}
                  </td>
                  <td className="text-right">
                    {Math.abs(point.strength - strength) > 0.001 ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSave({ strengthModel: point.strength, strengthClip: point.strength })
                        }
                        className="ui-text-link font-sans"
                      >
                        Use as default
                      </button>
                    ) : (
                      <span className="font-sans">default</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="type-caption text-[var(--text-muted)]">
            {check.stills} still{check.stills === 1 ? '' : 's'}
            {check.model ? ` on ${check.model}` : ''} ·{' '}
            {new Date(check.checkedAt).toLocaleDateString()}
          </p>
        </div>
      ) : null}
      {renders.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {renders.map(render => (
            <a
              key={`${render.stillKey}-${render.strength}`}
              href={render.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="block w-16 text-center text-[10px] text-[var(--text-muted)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI proxy thumbs */}
              <img
                src={render.imageUrl}
                alt={`Strength ${render.strength}`}
                className="h-16 w-16 rounded object-cover"
              />
              {render.strength === 0 ? 'off' : render.strength} ·{' '}
              {render.similarity === null ? 'no face' : render.similarity.toFixed(2)}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
