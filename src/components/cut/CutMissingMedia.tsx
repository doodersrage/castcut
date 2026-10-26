'use client';

import { Button } from '@/components/ui/Button';
import {
  MISSING_REASON_LABELS,
  type MissingCutShot,
  type RelinkMedia,
} from '@/lib/film/cut-missing';

/**
 * Cut's Missing media list (M4 F3): the shots whose file is gone, whose Gallery render was
 * removed, or whose source is gone — before an encode finds out — each with Relink: another
 * take of its source, or anything in the Gallery.
 */
export default function CutMissingMedia({
  items,
  checking,
  disabled,
  takesFor,
  onRelink,
  onPickFromGallery,
  onPick,
  onRecheck,
}: {
  items: MissingCutShot[];
  checking: boolean;
  disabled?: boolean;
  takesFor: (key: string) => RelinkMedia[];
  onRelink: (key: string, media: RelinkMedia) => void;
  onPickFromGallery: (key: string) => void;
  onPick: (key: string) => void;
  onRecheck: () => void;
}) {
  return (
    <div className="space-y-2" data-testid="cut-missing-media">
      <div className="flex flex-wrap items-center gap-2">
        <p className="type-caption flex-1">
          {items.some(item => item.blocks)
            ? `${items.filter(item => item.blocks).length} shot${items.filter(item => item.blocks).length === 1 ? '' : 's'} can’t play as they are — relink them before cutting.`
            : 'Worth a look before cutting.'}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={checking || disabled}
          data-testid="cut-missing-recheck"
          onClick={onRecheck}
        >
          {checking ? 'Checking…' : 'Check again'}
        </Button>
      </div>
      <ul className="space-y-1">
        {items.map(item => {
          const takes = takesFor(item.key).filter(take => take.url !== item.url);
          return (
            <li
              key={item.key}
              className="ui-list-row flex-col items-stretch gap-1"
              data-testid={`cut-missing-${item.key}`}
              data-blocks={item.blocks}
            >
              <p className="type-caption">
                <span
                  className={`mr-1 rounded-full border px-1.5 text-3xs ${
                    item.blocks
                      ? 'border-current ui-status-danger'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {item.blocks ? 'Missing' : 'Check'}
                </span>
                <Button
                  variant="quiet"
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => onPick(item.key)}
                >
                  {item.title}
                </Button>
                {' — '}
                {item.reasons.map(reason => MISSING_REASON_LABELS[reason]).join('; ')}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {takes.slice(0, 6).map(take => (
                  <Button
                    key={take.url}
                    variant="plain"
                    type="button"
                    disabled={disabled}
                    className="h-12 w-9 overflow-hidden rounded-[var(--radius-sm)] bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    title={`Relink to this ${take.kind === 'clip' ? 'clip' : 'still'} of ${item.title}`}
                    aria-label={`Relink ${item.title} to another take`}
                    data-testid={`cut-missing-take-${item.key}`}
                    onClick={() => onRelink(item.key, take)}
                  >
                    {take.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={take.thumbUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xs text-white">{take.kind}</span>
                    )}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  data-testid={`cut-missing-gallery-${item.key}`}
                  onClick={() => onPickFromGallery(item.key)}
                >
                  Relink from Gallery…
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
