'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Export / Import a wardrobe pack (saved clothing photos or saved shoes as a .zip) — to move
 * them to another install or share them. Import takes any pack: clothing, shoes or both.
 */
export default function WardrobePackButtons({
  kind,
  count,
  disabled = false,
  testIdPrefix,
}: {
  kind: 'clothing' | 'shoes';
  count: number;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const id = `${testIdPrefix}-${kind}-pack`;
  return (
    <div className="space-y-1" data-testid={id}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || busy || count === 0}
          title={`Download your saved ${kind} as a wardrobe pack (.zip) to share or move`}
          data-testid={`${id}-export`}
          onClick={() => {
            setBusy(true);
            setMessage(null);
            void import('@/lib/wardrobe-pack-client')
              .then(({ exportWardrobePack }) => exportWardrobePack(kind))
              .then(({ exported, missing }) =>
                setMessage(
                  `Exported ${exported}${missing ? ` — ${missing} picture${missing === 1 ? '' : 's'} missing from ComfyUI` : ''}.`
                )
              )
              .catch(error => setMessage(error instanceof Error ? error.message : 'Export failed.'))
              .finally(() => setBusy(false));
          }}
        >
          Export pack
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || busy}
          title="Add clothing and shoes from a wardrobe pack (.zip)"
          data-testid={`${id}-import`}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Working…' : 'Import pack'}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          aria-label={`Import a wardrobe pack (${kind})`}
          data-testid={`${id}-file`}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setBusy(true);
            setMessage(null);
            void import('@/lib/wardrobe-pack-client')
              .then(async ({ importWardrobePack, wardrobePackImportMessage }) =>
                setMessage(wardrobePackImportMessage(await importWardrobePack(file)))
              )
              .catch(error => setMessage(error instanceof Error ? error.message : 'Import failed.'))
              .finally(() => setBusy(false));
          }}
        />
      </div>
      {message ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          role="status"
          data-testid={`${id}-status`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
