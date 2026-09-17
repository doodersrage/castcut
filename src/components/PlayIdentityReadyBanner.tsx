'use client';

import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { fetchComfyObjectInfoNodeTypesCached } from '@/lib/comfyui-object-info-cache';
import {
  getIpAdapterHealth,
  getInstantIdHealth,
  isIdentityPackReady,
  shouldWarnIdentityPackMissing,
} from '@/lib/identity-pack-health';
import { loadSettingsCache } from '@/lib/settings-cache';
import { getCharacter } from '@/lib/character-os';
import { resolveCastFaceForPlate } from '@/lib/look-outfit-plate';

/**
 * Play / Film-loop banner: Identity ready when packs are installed, or warn when
 * Cast has a face lock but Heal has not installed IP-Adapter / InstantID yet.
 */
export default function PlayIdentityReadyBanner() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [warn, setWarn] = useState(false);
  const [detail, setDetail] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nodeTypes = await fetchComfyObjectInfoNodeTypesCached().catch(() => null);
      if (cancelled) {
        return;
      }
      const shared = loadSettingsCache().shared;
      const character = shared.activeCharacterId?.trim()
        ? getCharacter(shared.activeCharacterId)
        : undefined;
      const hasFaceLock = Boolean(
        resolveCastFaceForPlate(character)?.filename?.trim() ||
        shared.ipAdapterImageFilename?.trim()
      );
      const packReady = isIdentityPackReady(nodeTypes);
      setReady(packReady);
      setWarn(shouldWarnIdentityPackMissing({ hasFaceLock, availableNodeTypes: nodeTypes }));
      const ip = getIpAdapterHealth(nodeTypes);
      const instant = getInstantIdHealth(nodeTypes);
      if (packReady) {
        setDetail(
          ip.status === 'ready'
            ? 'IP-Adapter ready for Cast face lock'
            : 'InstantID ready for Cast face lock'
        );
      } else if (hasFaceLock) {
        setDetail(
          instant.status === 'detected' || ip.status === 'detected'
            ? 'Face locked — Heal & ready to finish installing identity nodes'
            : 'Face locked — run Heal & ready so IP-Adapter / InstantID can apply'
        );
      } else {
        setDetail('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (ready === null) {
    return null;
  }

  if (warn) {
    return (
      <div
        className="rounded-2xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2"
        data-testid="play-identity-warn"
      >
        <p className="type-caption font-medium text-[var(--tint-warning-text)]">
          Identity not ready
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</p>
        <div className="mt-2">
          <ButtonLink href="/settings?tab=overview" variant="secondary" size="sm">
            Heal &amp; ready
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (!ready) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-2"
      data-testid="play-identity-ready"
    >
      <p className="type-caption font-medium text-[var(--tint-success-text)]">Identity ready</p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}
