'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { checkQuality, labelledFindings, type CheckQuality } from '@/lib/checks/check-quality';
import { loadFindingDecisions, subscribeFindingDecisions } from '@/lib/checks/finding-decisions';
import { awaitFullGalleryHydration } from '@/lib/gallery/db-store';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { downloadText } from '@/lib/storage/download-text';

/**
 * How good each continuity check is (M2 C5): per check, what it found across the Gallery and
 * what you decided about it in Cut — marked fine (likely a false positive) or real — plus the
 * renders you marked Looks wrong that no check caught. Measured only; nothing becomes a gate.
 */
export default function CheckQualityPanel() {
  const [quality, setQuality] = useState<CheckQuality | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void awaitFullGalleryHydration().then(() => {
        if (!cancelled) setQuality(checkQuality(loadComfyGallery(), loadFindingDecisions()));
      });
    };
    read();
    const unsubscribe = subscribeFindingDecisions(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const exportSet = () => {
    const set = labelledFindings(loadComfyGallery(), loadFindingDecisions());
    downloadText(
      `castcut-continuity-labels-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), findings: set }, null, 2)
    );
  };

  if (!quality) {
    return <p className="type-caption text-[var(--text-muted)]">Reading the Gallery…</p>;
  }
  if (quality.rows.length === 0 && quality.missed === 0) {
    return (
      <p className="type-caption text-[var(--text-muted)]" data-testid="check-quality-empty">
        No check has flagged anything yet. Findings and your decisions about them (Cut → Continuity)
        show here.
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid="check-quality">
      <table className="w-full text-sm">
        <thead>
          <tr className="type-caption text-left text-[var(--text-muted)]">
            <th className="py-1 pr-2 font-normal">Check</th>
            <th className="py-1 pr-2 text-right font-normal">Found</th>
            <th className="py-1 pr-2 text-right font-normal" title="Likely false positives">
              Marked fine
            </th>
            <th className="py-1 pr-2 text-right font-normal">Marked real</th>
            <th className="py-1 text-right font-normal">Not looked at</th>
          </tr>
        </thead>
        <tbody>
          {quality.rows.map(row => (
            <tr
              key={row.rule}
              className="border-t border-[var(--border-subtle)]"
              data-testid={`check-quality-${row.rule}`}
            >
              <td className="py-1 pr-2">
                {row.label}
                {row.decidedOnly ? (
                  <span className="type-caption text-[var(--text-muted)]">
                    {' '}
                    (decided ones only)
                  </span>
                ) : null}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{row.found}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{row.dismissed}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{row.accepted}</td>
              <td className="py-1 text-right tabular-nums">
                {Math.max(0, row.found - row.dismissed - row.accepted)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="type-caption text-[var(--text-muted)]" data-testid="check-quality-missed">
        {quality.missed === 0
          ? 'Every render you marked Looks wrong was also flagged by a check.'
          : `${quality.missed} render${quality.missed === 1 ? '' : 's'} you marked Looks wrong ${quality.missed === 1 ? 'was' : 'were'} flagged by no check (missed).`}
      </p>
      <Button size="sm" variant="secondary" data-testid="check-quality-export" onClick={exportSet}>
        Export labelled findings (.json)
      </Button>
    </div>
  );
}
