'use client';

import Link from 'next/link';
import { uploadComfyInputImage } from '@/lib/comfyui-image-upload';
import {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
} from '@/lib/ipadapter-workflow-patch';
import { getCharacter } from '@/lib/character-os';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { SETTINGS_TOOL_ACCENT } from '@/components/settings/tabs/settings-tool-shared';
import { CollapsibleSection, ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsIpAdapterPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  ipAdapterUploadStatus: string | null;
  ipAdapterUploading: boolean;
  setIpAdapterUploading: (value: boolean) => void;
  setIpAdapterUploadStatus: (value: string | null) => void;
};

export default function SettingsIpAdapterPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  ipAdapterUploadStatus,
  ipAdapterUploading,
  setIpAdapterUploading,
  setIpAdapterUploadStatus,
}: SettingsIpAdapterPanelProps) {
  const activeCharacterId = sharedSettings.activeCharacterId?.trim() || '';
  const activeCharacter = getCharacter(activeCharacterId);
  const castFace =
    activeCharacter?.ipAdapter?.imageFilename?.trim() ||
    sharedSettings.ipAdapterImageFilename?.trim() ||
    '';
  const castOwnsIdentity = Boolean(activeCharacter && castFace);

  const form = (
    <>
      <p className="text-sm text-[var(--text-secondary)]">
        Session-wide identity/style reference (not Image → Prompt&apos;s text multi-ref). At queue
        time, with a reference image set, the app updates existing{' '}
        <code className="ui-inline-code">{DEFAULT_IPADAPTER_IMAGE_TOKEN}</code>
        {' / '}
        <code className="ui-inline-code">{DEFAULT_IPADAPTER_STRENGTH_TOKEN}</code>
        {' / '}
        <code className="ui-inline-code">{DEFAULT_IPADAPTER_MODEL_TOKEN}</code> tokens{' '}
        <strong className="font-medium text-[var(--text-secondary)]">or auto-inserts</strong> a
        minimal LoadImage → IPAdapterModelLoader → IPAdapterAdvanced chain when none exist. Requires
        ComfyUI-IPAdapter-Plus-class nodes installed. Extra reference filenames stack additional
        Apply nodes. When IP-Adapter Plus is missing but InstantID/PuLID nodes are installed, Studio
        falls back to auto-inserting those instead.
      </p>

      <div className="space-y-2">
        <FieldLabel htmlFor="settings-ipadapter-image">Reference image filename</FieldLabel>
        <input
          id="settings-ipadapter-image"
          value={sharedSettings.ipAdapterImageFilename ?? ''}
          onChange={event => updateSharedSettings({ ipAdapterImageFilename: event.target.value })}
          placeholder="already-uploaded-file.png (or upload below)"
          disabled={!sharedMounted}
          className={`ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body ${accentFocusClass(ACCENT)}`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
            {ipAdapterUploading ? 'Uploading…' : 'Upload reference image'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!sharedMounted || ipAdapterUploading}
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                setIpAdapterUploading(true);
                setIpAdapterUploadStatus(null);
                void uploadComfyInputImage({ file, model: sharedSettings.model })
                  .then(uploaded => {
                    updateSharedSettings({ ipAdapterImageFilename: uploaded.name });
                    setIpAdapterUploadStatus(`Uploaded as ${uploaded.name}.`);
                  })
                  .catch(err => {
                    setIpAdapterUploadStatus(err instanceof Error ? err.message : 'Upload failed.');
                  })
                  .finally(() => setIpAdapterUploading(false));
              }}
            />
          </label>
          {ipAdapterUploadStatus ? (
            <span className="text-xs text-[var(--text-muted)]">{ipAdapterUploadStatus}</span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <FieldLabel htmlFor="settings-ipadapter-extra">
          Extra reference filenames (multi-ref stack)
        </FieldLabel>
        <input
          id="settings-ipadapter-extra"
          value={(sharedSettings.ipAdapterImageFilenames ?? []).join(', ')}
          onChange={event => {
            const names = event.target.value
              .split(',')
              .map(entry => entry.trim())
              .filter(Boolean);
            updateSharedSettings({
              ipAdapterImageFilenames: names.length > 0 ? names : undefined,
              ...(names[0] && !sharedSettings.ipAdapterImageFilename?.trim()
                ? { ipAdapterImageFilename: names[0] }
                : {}),
            });
          }}
          placeholder="ref-a.png, ref-b.png (comma-separated; index 0 can mirror the primary)"
          disabled={!sharedMounted}
          className={`ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body ${accentFocusClass(ACCENT)}`}
        />
      </div>

      <label className="mt-4 block space-y-2">
        <span className="block text-sm font-medium text-[var(--text-primary)]">
          Strength — {(sharedSettings.ipAdapterStrength ?? 0.6).toFixed(2)}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={sharedSettings.ipAdapterStrength ?? 0.6}
          onChange={event =>
            updateSharedSettings({ ipAdapterStrength: Number(event.target.value) })
          }
          disabled={!sharedMounted}
          className={`w-full accent-[var(--accent)] ${accentFocusClass(ACCENT)}`}
        />
      </label>

      <div className="mt-4 space-y-2">
        <FieldLabel htmlFor="settings-ipadapter-model">
          IP-Adapter model filename (optional)
        </FieldLabel>
        <input
          id="settings-ipadapter-model"
          value={sharedSettings.ipAdapterModelFilename ?? ''}
          onChange={event => updateSharedSettings({ ipAdapterModelFilename: event.target.value })}
          placeholder="ip-adapter-plus_sdxl.safetensors (leave blank to keep the workflow's default)"
          disabled={!sharedMounted}
          className={`ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body ${accentFocusClass(ACCENT)}`}
        />
      </div>
    </>
  );

  return (
    <ToolSection id="settings-comfyui-ipadapter" title="IP-Adapter identity reference">
      {castOwnsIdentity ? (
        <>
          <div className="mb-3 rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-4 py-3 text-sm text-[var(--tint-success-text)]">
            Cast identity is active for{' '}
            <strong className="font-medium">{activeCharacter?.name ?? 'Cast'}</strong>
            {castFace ? (
              <>
                {' '}
                (<code className="ui-inline-code">{castFace}</code>)
              </>
            ) : null}
            . Prefer Film / Cast Look for face lock — this panel is a global override for Studio
            Compose.
            <div className="mt-2">
              <Link
                href="/cast"
                className="text-sm font-medium underline underline-offset-2 hover:opacity-90"
              >
                Open Cast →
              </Link>
            </div>
          </div>
          <CollapsibleSection
            title="Session IP-Adapter override"
            summary="Upload / strength / model filename for Studio tools without Cast"
            defaultOpen={false}
            persistKey="settings-ipadapter-cast-override"
          >
            {form}
          </CollapsibleSection>
        </>
      ) : (
        form
      )}
    </ToolSection>
  );
}
