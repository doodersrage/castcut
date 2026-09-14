'use client';

import dynamic from 'next/dynamic';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { modelSupportsSessionIdentityLock } from '@/lib/compose-identity-lock';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';

const IdentityLockSessionControl = dynamic(
  () => import('@/components/IdentityLockSessionControl'),
  {
    ssr: false,
    loading: () => null,
  }
);

export type SharedIdentitySurfaceProps = {
  shared: SharedToolSettings;
  cloudEngine: boolean;
  toolId?: string;
  roleplayVariant: boolean;
  advancedOpenByDefault: boolean;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
};

export default function SharedIdentitySurface({
  shared,
  cloudEngine,
  toolId,
  advancedOpenByDefault,
  onSharedSettingsChange,
}: SharedIdentitySurfaceProps) {
  const applyIdentityPatch = (patch: Partial<SharedToolSettings>) => {
    if (onSharedSettingsChange) {
      onSharedSettingsChange(patch);
    } else {
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...patch,
      });
    }
  };

  return (
    <>
      {!cloudEngine &&
      modelSupportsSessionIdentityLock(shared.model) &&
      toolId !== 'video' &&
      toolId !== 'compose' ? (
        <CollapsibleSection
          title="Identity lock"
          summary={
            shared.ipAdapterImageFilename?.trim()
              ? `${shared.identityKind === 'instantid' ? 'InstantID' : shared.identityKind === 'pulid' ? 'PuLID' : shared.identityKind === 'auto' ? 'Auto' : 'IP-Adapter'} · ${shared.ipAdapterImageFilename}`
              : 'Lock a face or style reference'
          }
          defaultOpen={advancedOpenByDefault || Boolean(shared.ipAdapterImageFilename?.trim())}
          persistKey="shared-identity-lock"
        >
          <IdentityLockSessionControl
            model={shared.model}
            filename={shared.ipAdapterImageFilename}
            imageUrl={shared.ipAdapterImageUrl}
            strength={shared.ipAdapterStrength}
            identityKind={shared.identityKind}
            onChange={applyIdentityPatch}
          />
        </CollapsibleSection>
      ) : null}
      {cloudEngine ? (
        <CollapsibleSection
          title="Reference image"
          summary={
            shared.ipAdapterImageFilename?.trim() || shared.ipAdapterImageUrl?.trim()
              ? 'Locked face sent as img2img'
              : 'Optional img2img when Image 1 is empty'
          }
          defaultOpen={Boolean(
            shared.ipAdapterImageFilename?.trim() || shared.ipAdapterImageUrl?.trim()
          )}
          persistKey="shared-cloud-identity"
        >
          <IdentityLockSessionControl
            model={shared.model}
            filename={shared.ipAdapterImageFilename}
            imageUrl={shared.ipAdapterImageUrl}
            strength={shared.ipAdapterStrength}
            identityKind={shared.identityKind}
            cloud
            onChange={applyIdentityPatch}
          />
          <p className="type-caption text-[var(--text-muted)]">
            Cloud engines have no IP-Adapter nodes. If you queue without Image 1, this reference is
            uploaded as img2img.
          </p>
        </CollapsibleSection>
      ) : null}
    </>
  );
}
