'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import {
  activeLook,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  subscribeCharacters,
} from '@/lib/character-os';
import {
  DEFAULT_COMPOSE_IDENTITY_KIND,
  DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH,
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
  type ComposeIdentityKind,
} from '@/lib/compose-identity-lock';
import { uploadComfyInputImage } from '@/lib/comfyui-image-upload';
import { persistIdentityImage } from '@/lib/gallery-media-client';
import {
  identityLockLookStatus,
  lockOnLookFace,
  lookLockLabel,
  type IdentityLockSource,
} from '@/lib/identity-lock-look';
import type { SharedToolSettings } from '@/lib/settings-cache';

const IDENTITY_KINDS: Array<{ id: ComposeIdentityKind; label: string }> = [
  { id: 'ipadapter', label: 'IP-Adapter' },
  { id: 'instantid', label: 'InstantID' },
  { id: 'pulid', label: 'PuLID' },
  { id: 'auto', label: 'Auto' },
];

export default function IdentityLockSessionControl({
  model,
  filename,
  imageUrl,
  strength,
  identityKind,
  cloud,
  activeCharacterId,
  source,
  onChange,
}: {
  model?: string;
  filename?: string;
  imageUrl?: string;
  strength?: number;
  identityKind?: ComposeIdentityKind;
  cloud?: boolean;
  /** The active Cast: the lock follows her look unless it is the player's own face. */
  activeCharacterId?: string;
  source?: IdentityLockSource;
  onChange: (patch: Partial<SharedToolSettings>) => void;
}) {
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const cast = activeCharacterId?.trim()
    ? characters.find(entry => entry.id === activeCharacterId.trim())
    : undefined;
  const castLook = cast ? activeLook(cast) : undefined;
  const lookStatus = cast
    ? identityLockLookStatus({
        lock: {
          ipAdapterImageFilename: filename,
          ipAdapterImageUrl: imageUrl,
          ipAdapterSource: source,
        },
        looks: looksOf(cast),
        activeLook: castLook,
      })
    : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const locked = Boolean(filename?.trim());
  const kind = normalizeComposeIdentityKind(identityKind ?? DEFAULT_COMPOSE_IDENTITY_KIND);
  const weight = normalizeComposeIdentityLockStrength(
    strength ?? DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH
  );

  const persist = (patch: Partial<SharedToolSettings>) => {
    onChange(patch);
  };

  const clearLock = () => {
    persist({
      ipAdapterImageFilename: '',
      ipAdapterImageFilenames: [],
      ipAdapterImageUrl: '',
      ipAdapterComfyUrl: '',
      ipAdapterSource: undefined,
    });
    setStatus(null);
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2" data-testid="identity-lock-session">
      <p className="type-caption text-[var(--text-muted)]">
        {cloud
          ? 'Lock a face or style reference for this session. Cloud engines have no IP-Adapter nodes — this uploads as the img2img reference.'
          : 'Lock a face or style reference for this session. Queues IP-Adapter, or InstantID / PuLID when those nodes are installed.'}
      </p>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={locked}
          onChange={event => {
            if (event.target.checked) {
              fileRef.current?.click();
              return;
            }
            clearLock();
          }}
          className="ui-checkbox mt-1 accent-[var(--accent)]"
        />
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-medium text-[var(--text-primary)]">
            {cloud ? 'Use as reference' : 'Lock this face'}
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            {locked
              ? filename
              : cloud
                ? 'Upload a still — sent as the cloud img2img reference, not an IP-Adapter node.'
                : 'Upload a reference — same host that will queue the job.'}
          </span>
        </span>
      </label>
      {locked && lookStatus?.kind === 'look' ? (
        <p className="pl-7 text-xs text-[var(--text-secondary)]" data-testid="identity-lock-from">
          Face: {lookLockLabel(lookStatus.lookName)}
        </p>
      ) : null}
      {locked && lookStatus?.kind === 'own' ? (
        <p
          className="flex flex-wrap items-center gap-2 pl-7 text-xs text-[var(--text-secondary)]"
          data-testid="identity-lock-from"
        >
          <span>Your own face</span>
          {lookStatus.canUseLook && castLook ? (
            <>
              <span aria-hidden="true">—</span>
              <button
                type="button"
                onClick={() => {
                  persist(lockOnLookFace(castLook));
                  setStatus(null);
                }}
                className="rounded-lg border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                title={`Lock the face of ${lookLockLabel(lookStatus.lookName ?? '')} instead`}
              >
                Use this look&rsquo;s
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="identity-lock-file"
        onChange={event => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          const previewUrl = URL.createObjectURL(file);
          setUploading(true);
          setStatus(null);
          void uploadComfyInputImage({ file, model })
            .then(async uploaded => {
              const durableUrl = await persistIdentityImage({ file, filename: uploaded.name });
              persist({
                ipAdapterImageFilename: uploaded.name,
                ipAdapterImageFilenames: [uploaded.name],
                ipAdapterImageUrl: durableUrl || previewUrl,
                ipAdapterComfyUrl: uploaded.comfyUrl,
                // The player's own face: it stays when the Cast's look changes.
                ipAdapterSource: 'own',
                ipAdapterStrength: weight,
                identityKind: kind,
              });
              if (durableUrl && previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
              }
              setStatus(`Uploaded as ${uploaded.name}`);
            })
            .catch(error => {
              URL.revokeObjectURL(previewUrl);
              setStatus(error instanceof Error ? error.message : 'Upload failed.');
            })
            .finally(() => setUploading(false));
        }}
      />
      {locked ? (
        <div className="flex flex-wrap items-start gap-3 pl-7">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- session blob / comfy preview
            <img
              src={imageUrl}
              alt="Identity reference"
              className="h-14 w-14 rounded-lg border border-[var(--border-subtle)] object-cover"
            />
          ) : null}
          {cloud ? null : (
            <label className="min-w-[10rem] flex-1 space-y-1">
              <span className="type-caption text-[var(--accent-text)]">Kind</span>
              <select
                value={kind}
                onChange={event =>
                  persist({ identityKind: normalizeComposeIdentityKind(event.target.value) })
                }
                className="block w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/70 px-2.5 py-1.5 text-sm text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                {IDENTITY_KINDS.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="min-w-[12rem] flex-1 space-y-1">
            <span className="type-caption text-[var(--accent-text)]">
              Strength — {weight.toFixed(2)}
            </span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={weight}
              onChange={event =>
                persist({
                  ipAdapterStrength: normalizeComposeIdentityLockStrength(event.target.value),
                })
              }
              className="w-full accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            />
          </label>
          <button
            type="button"
            onClick={clearLock}
            className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
          >
            Clear
          </button>
        </div>
      ) : null}
      {uploading ? (
        <p className="pl-7 text-xs text-[var(--text-muted)]">Uploading…</p>
      ) : status ? (
        <p className="pl-7 text-xs text-[var(--text-muted)]">{status}</p>
      ) : null}
    </div>
  );
}
