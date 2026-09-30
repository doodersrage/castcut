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
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { toolEffectiveModel } from '@/lib/tool-effective-model';

/** Film routes → the tool whose model the page queues. */
const ROUTE_TOOL_KEY: Record<string, string> = {
  '/day': 'day',
  '/fitting': 'fitting',
  '/moodboard': 'moodboard',
  '/story': 'roleplay',
  '/roleplay': 'roleplay',
  '/character': 'character',
};

/**
 * IP-Adapter / InstantID only exist for SD 1.5 / SDXL UNETs. Qwen and instruct-edit models
 * hold identity through ReferenceLatent — "run Heal so IP-Adapter can apply" misled there.
 */
function modelUsesIdentityPack(model: string | undefined): boolean {
  if (!model?.trim()) return true;
  const definition = getComfyModelDefinition(model);
  if (definition.id !== model) return true;
  return definition.category === 'sdxl' || definition.category === 'stable-diffusion';
}

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
      const model = toolEffectiveModel(
        shared.model,
        ROUTE_TOOL_KEY[window.location.pathname.replace(/\/+$/, '')] ?? undefined
      );
      setWarn(
        modelUsesIdentityPack(model) &&
          shouldWarnIdentityPackMissing({ hasFaceLock, availableNodeTypes: nodeTypes })
      );
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

  // A green "all good" card on every Film page was noise beside the Ready chip — only a
  // problem earns space. (Kept as a hidden marker for tests / tooling.)
  if (ready) {
    return <span hidden data-testid="play-identity-ready" />;
  }
  return null;
}
