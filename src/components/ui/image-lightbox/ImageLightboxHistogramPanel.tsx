'use client';

import { Button } from '@/components/ui/Button';
import { chromeBtn } from '@/components/ui/image-lightbox/chromeBtn';
import { normalizeHistogramChannel, type LightboxHistogram } from '@/lib/media/lightbox-histogram';

export type ImageLightboxHistogramPanelProps = {
  compact?: boolean;
  histogramOpen: boolean;
  histogramLoading: boolean;
  histogramError: string | null;
  histogram: LightboxHistogram | null;
  onClose: () => void;
};

export default function ImageLightboxHistogramPanel({
  compact = false,
  histogramOpen,
  histogramLoading,
  histogramError,
  histogram,
  onClose,
}: ImageLightboxHistogramPanelProps) {
  if (!histogramOpen) {
    return null;
  }

  const channelClass = (color: string) => (compact ? `${color}/80` : color);

  return (
    <div className="ui-lightbox-panel space-y-2 p-3" data-immersive={compact ? 'true' : undefined}>
      <div className="flex items-center justify-between gap-2">
        <p className="type-overline">Color peek</p>
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      {histogramLoading ? (
        <p className="type-caption">Sampling…</p>
      ) : histogramError ? (
        <p className="type-caption text-[var(--tint-danger-text)]">{histogramError}</p>
      ) : histogram ? (
        <>
          <p className="type-caption">
            Exposure {histogram.exposure} · luma {(histogram.meanLuma * 100).toFixed(0)}%
          </p>
          {(
            [
              ['R', histogram.r, 'bg-rose-400'],
              ['G', histogram.g, 'bg-emerald-400'],
              ['B', histogram.b, 'bg-sky-400'],
            ] as const
          ).map(([label, values, bar]) => {
            const normalized = normalizeHistogramChannel(values);
            return (
              <div key={label} className="flex items-end gap-0.5">
                <span className="w-3 shrink-0 text-3xs opacity-70">{label}</span>
                <div className="flex h-8 flex-1 items-end gap-px">
                  {normalized.map((value, bucket) => (
                    <div
                      key={`${label}-${bucket}`}
                      className={`min-w-[2px] flex-1 rounded-sm ${channelClass(bar)}`}
                      style={{
                        height: `${Math.max(6, value * 100)}%`,
                        opacity: 0.35 + value * 0.65,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
