'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { renderCastExpressions } from '@/lib/character/expression-sheet-client';
import type { CharacterRecord } from '@/lib/character/os';
import { resolveFittingPlateFromCharacter } from '@/lib/character/plate';
import { storyboardHtml } from '@/lib/print/print-sheets';
import { openPrintSheetLater } from '@/lib/print/print-sheets-client';

/**
 * Cast → Expression sheet (Part 18 R6): the Cast's plate as six feelings — neutral, smiling,
 * laughing, sad, angry, surprised — rendered on Qwen-Image 2.1 Turbo (about three minutes for all
 * six, kept in the Gallery), then on one page to print or save as PDF.
 */
export default function CastExpressionSheetButton({ character }: { character: CharacterRecord }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plate = resolveFittingPlateFromCharacter(character);
  const filename = plate?.filename?.trim();
  return (
    <span className="inline-flex flex-col">
      <Button
        size="sm"
        variant="ghost"
        disabled={!filename || status !== null}
        data-testid="cast-expression-sheet"
        title={
          filename
            ? 'The plate as six feelings — the face held through each — rendered (about three minutes), then on one page'
            : 'Needs a plate first'
        }
        onClick={() => {
          if (!filename) return;
          const tab = openPrintSheetLater();
          setError(null);
          setStatus('Starting…');
          void renderCastExpressions({ plateFilename: filename, onProgress: setStatus })
            .then(results => {
              tab.show(
                storyboardHtml({
                  title: `${character.name} — expression sheet`,
                  subtitle: `${results.filter(result => result.url).length} of ${results.length} rendered`,
                  shape: 'vertical',
                  origin: window.location.origin,
                  frames: results.map((result, index) => ({
                    number: String(index + 1),
                    image: result.url ?? undefined,
                    heading: result.label,
                    notes: [],
                  })),
                })
              );
            })
            .catch(err => {
              tab.close();
              setError(err instanceof Error ? err.message : 'Could not render the expressions.');
            })
            .finally(() => setStatus(null));
        }}
      >
        {status ?? 'Expression sheet'}
      </Button>
      {error ? <span className="type-caption text-[var(--danger)]">{error}</span> : null}
    </span>
  );
}
