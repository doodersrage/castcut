'use client';

import { useEffect, useState } from 'react';
import { CHARACTERS_UPDATED_EVENT, getCharacter } from '@/lib/character-os';
import { resolveDayCastPlate } from '@/lib/day-plate';
import { resolveCastFaceForPlate } from '@/lib/look-outfit-plate';
import {
  checkReferenceImage,
  referenceViewUrl,
  type ReferenceCheckInput,
} from '@/lib/reference-check-client';
import { referenceVerdictLabel, type ReferenceVerdict } from '@/lib/reference-check';
import { SETTINGS_CACHE_UPDATED_EVENT, loadSettingsCache } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

type ReferenceHealthItem = {
  key: string;
  label: string;
  check: ReferenceCheckInput;
};

type ReferenceHealthRow = ReferenceHealthItem & { verdict: ReferenceVerdict | null };

/**
 * The reference pictures the active Cast's stills go out with (reference-check.ts): the lead's
 * plate and face lock, the Day partner's plate and face lock (compared with their plate and the
 * lead's), the invented partner's face. Each line says OK, what is wrong, or that the check
 * could not run — the same checks the queue runs on every still.
 */
export function referenceHealthItems(): ReferenceHealthItem[] {
  const cache = loadSettingsCache();
  const lead = getCharacter(cache.shared.activeCharacterId?.trim() || undefined) ?? null;
  const day = cache.tools.day;
  const items: ReferenceHealthItem[] = [];
  const leadPlate = resolveDayCastPlate(lead);
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
  const partnerId = day?.partnerCharacterId?.trim();
  const partner = partnerId && partnerId !== lead?.id ? getCharacter(partnerId) : undefined;
  if (partner) {
    const plate = resolveDayCastPlate(partner);
    if (plate) {
      items.push({
        key: 'partner-plate',
        label: `${partner.name || 'Partner'} — plate (Day partner)`,
        check: {
          role: 'plate',
          filename: plate.filename,
          imageUrl: plate.imageUrl,
          subject: partner.name,
        },
      });
    }
    const lock = resolveCastFaceForPlate(partner);
    if (lock) {
      items.push({
        key: 'partner-face',
        label: `${partner.name || 'Partner'} — face lock (Day partner)`,
        check: {
          role: 'partner-face',
          filename: lock.filename,
          imageUrl: lock.imageUrl,
          subject: partner.name,
          partnerReferenceUrl: referenceViewUrl(plate),
          leadReferenceUrl: referenceViewUrl(leadPlate),
        },
      });
    }
  }
  const standIn = day?.partnerStandIn;
  if (standIn?.filename?.trim()) {
    items.push({
      key: 'stand-in-face',
      label: 'Invented Day partner — face',
      check: { role: 'face', filename: standIn.filename, subject: "the partner's" },
    });
  }
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
