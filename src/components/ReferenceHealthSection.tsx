'use client';

import { useEffect, useState } from 'react';
import { CHARACTERS_UPDATED_EVENT, getCharacter } from '@/lib/character-os';
import { resolveFittingPlateFromCharacter } from '@/lib/character-plate';
import { resolveCastFaceForPlate } from '@/lib/character-identity';
import { checkReferenceImage } from '@/lib/reference-check-client';
import { referenceVerdictLabel, type ReferenceVerdict } from '@/lib/reference-check';
import { SETTINGS_CACHE_UPDATED_EVENT, loadSettingsCache } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { extraReferenceHealthItems, type ReferenceHealthItem } from '@/lib/reference-health';

type ReferenceHealthRow = ReferenceHealthItem & { verdict: ReferenceVerdict | null };

/**
 * The reference pictures the active Cast's stills go out with (reference-check.ts): the lead's
 * plate and face lock, and what features add (Play: the Day partner's plate and face lock, the
 * invented partner's face — play-reference-health.ts). Each line says OK, what is wrong, or that the check
 * could not run — the same checks the queue runs on every still.
 */
export function referenceHealthItems(): ReferenceHealthItem[] {
  const cache = loadSettingsCache();
  const lead = getCharacter(cache.shared.activeCharacterId?.trim() || undefined) ?? null;
  const items: ReferenceHealthItem[] = [];
  const leadPlate = resolveFittingPlateFromCharacter(lead);
  if (lead) {
    if (leadPlate) {
      items.push({
        key: 'lead-plate',
        label: `${lead.name || 'Lead'} — plate`,
        check: {
          role: 'plate',
          filename: leadPlate.filename,
          imageUrl: leadPlate.imageUrl,
          subject: lead.name,
        },
      });
    }
    const lock = resolveCastFaceForPlate(lead);
    if (lock) {
      items.push({
        key: 'lead-face',
        label: `${lead.name || 'Lead'} — face lock`,
        check: {
          role: 'face',
          filename: lock.filename,
          imageUrl: lock.imageUrl,
          subject: lead.name,
        },
      });
    }
  }
  items.push(...extraReferenceHealthItems({ lead, leadPlate }));
  return items;
}

export default function ReferenceHealthSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<ReferenceHealthRow[] | null>(null);
  const [storeKey, setStoreKey] = useState(0);

  useEffect(() => {
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setStoreKey(key => key + 1), 800);
    };
    window.addEventListener(CHARACTERS_UPDATED_EVENT, bump);
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, bump);
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    void refreshKey;
    void storeKey;
    let cancelled = false;
    scheduleAfterCommit(() => {
      const items = referenceHealthItems();
      setRows(items.map(item => ({ ...item, verdict: null })));
      for (const item of items) {
        void checkReferenceImage(item.check).then(verdict => {
          if (cancelled) return;
          setRows(current =>
            current
              ? current.map(row => (row.key === item.key ? { ...row, verdict } : row))
              : current
          );
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, storeKey]);

  if (!rows) return null;
  return (
    <div className="space-y-1" data-testid="reference-health">
      <p className="text-sm font-medium text-[var(--text-primary)]">Reference pictures</p>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          No Cast lead with a plate — the checks run on the pictures a still goes out with.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map(row => {
            const status = row.verdict?.status ?? 'checking';
            return (
              <li
                key={row.key}
                className={`text-xs ${
                  status === 'mismatch'
                    ? 'text-[var(--tint-warning-text)]'
                    : status === 'ok'
                      ? 'text-[var(--tint-success-text)]'
                      : 'text-[var(--text-muted)]'
                }`}
                data-testid={`reference-health-${row.key}`}
                data-status={status}
              >
                <span className="font-medium text-[var(--text-primary)]">{row.label}</span>
                <span className="text-[var(--text-muted)]">: </span>
                {referenceVerdictLabel(row.verdict)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
