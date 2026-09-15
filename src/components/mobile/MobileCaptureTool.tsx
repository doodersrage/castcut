'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { FieldError, TextInput } from '@/components/ui/Field';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { persistIdentityImage } from '@/lib/gallery-media-client';
import { saveGalleryHandoff } from '@/lib/gallery-handoff';
import { isolateSubjectOnWhite } from '@/lib/isolate-subject';
import {
  newCharacterPlateId,
  roleplayPatchFromPlate,
  upsertCharacterPlate,
  type CharacterPlate,
} from '@/lib/mobile-studio';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import {
  DEFAULT_MOBILE_STUDIO_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadToolSettings,
  saveToolSettings,
} from '@/lib/settings-cache';

export default function MobileCaptureTool() {
  const { mounted, shared, toolSettings, updateToolSettings } = useCachedSettings(
    'mobileStudio',
    DEFAULT_MOBILE_STUDIO_TOOL_CACHE
  );
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const plates = useMemo(() => toolSettings.plates ?? [], [toolSettings.plates]);
  const active = plates.find(plate => plate.id === toolSettings.activePlateId) ?? plates[0] ?? null;

  const applyPlateToRoleplay = useCallback((plate: CharacterPlate) => {
    const current = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
    saveToolSettings('roleplay', {
      ...current,
      ...roleplayPatchFromPlate(plate),
    });
  }, []);

  const captureFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }
      setBusy(true);
      setError(null);
      setStatus('Reading photo…');
      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(previous => {
        if (previous?.startsWith('blob:')) {
          URL.revokeObjectURL(previous);
        }
        return localPreview;
      });
      try {
        const originalName = file.name || `plate-${Date.now()}.png`;
        const originalUploaded = await resolveQueueInputImage({
          file,
          filename: originalName,
          model: shared.model,
        });
        const originalFilename = originalUploaded?.filename?.trim() || originalName;
        const originalDurable = await persistIdentityImage({
          file,
          filename: originalFilename,
        });
        const originalUrl = originalDurable || localPreview;

        let isolatedUrl = originalUrl;
        let isolatedFilename = originalFilename;
        let isolated = false;
        setStatus('Isolating subject on white…');
        try {
          const cutout = await isolateSubjectOnWhite(file, originalName);
          const cutoutUploaded = await resolveQueueInputImage({
            file: cutout,
            filename: cutout.name,
            model: shared.model,
          });
          isolatedFilename = cutoutUploaded?.filename?.trim() || cutout.name;
          const cutoutDurable = await persistIdentityImage({
            file: cutout,
            filename: isolatedFilename,
          });
          const cutoutPreview = URL.createObjectURL(cutout);
          setPreviewUrl(previous => {
            if (previous?.startsWith('blob:') && previous !== cutoutPreview) {
              URL.revokeObjectURL(previous);
            }
            return cutoutDurable || cutoutPreview;
          });
          isolatedUrl = cutoutDurable || cutoutPreview;
          isolated = true;
        } catch (err) {
          isolated = false;
          setError(
            err instanceof Error
              ? `${err.message} Saved the original photo.`
              : 'Could not isolate the subject. Saved the original photo.'
          );
        }

        const plate: CharacterPlate = {
          id: newCharacterPlateId(),
          name: name.trim() || file.name.replace(/\.[^.]+$/, '') || 'Untitled plate',
          createdAt: Date.now(),
          originalUrl,
          originalFilename,
          isolatedUrl,
          isolatedFilename,
          isolated,
        };
        const nextPlates = upsertCharacterPlate(plates, plate);
        updateToolSettings({
          plates: nextPlates,
          activePlateId: plate.id,
        });
        applyPlateToRoleplay(plate);
        setStatus(isolated ? 'Plate ready — subject on white.' : 'Plate saved.');
        if (originalUrl && localPreview.startsWith('blob:') && originalUrl !== localPreview) {
          URL.revokeObjectURL(localPreview);
        }
      } catch (err) {
        setStatus(null);
        setError(err instanceof Error ? err.message : 'Could not save that photo.');
      } finally {
        setBusy(false);
      }
    },
    [applyPlateToRoleplay, name, plates, shared.model, updateToolSettings]
  );

  if (!mounted) {
    return <p className="type-caption text-[var(--text-muted)]">Loading capture…</p>;
  }

  const displayUrl = previewUrl || (active?.isolated ? active.isolatedUrl : active?.originalUrl);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Capture a plate</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Shoot or pick a photo. Isolate on white (default) so Roleplay and Compose cannot lock onto
          the street or room. First use downloads a small on-device model.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="type-caption text-[var(--text-muted)]">Name (optional)</span>
        <TextInput
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Who is this?"
          autoComplete="off"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            void captureFile(file);
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            void captureFile(file);
          }}
        />
        <PrimaryButton
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="w-full justify-center"
        >
          Take photo
        </PrimaryButton>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => libraryRef.current?.click()}
          className="w-full justify-center"
        >
          Choose photo
        </Button>
      </div>

      {status ? <p className="text-sm text-[var(--text-muted)]">{status}</p> : null}
      <FieldError>{error}</FieldError>

      {displayUrl ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={active?.name || 'Character plate'}
            className="max-h-80 w-full object-contain"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
          No plate yet. Take a photo to start.
        </div>
      )}

      {active ? (
        <div className="flex flex-col gap-2">
          <Link href="/m/moodboard" className="ui-btn-primary w-full justify-center text-center">
            Start Look
          </Link>
          <Link href="/m/play" className="ui-btn-secondary w-full justify-center text-center">
            Optional: Story as {active.name}
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-center"
            onClick={() => {
              saveGalleryHandoff({
                source: 'gallery',
                galleryEntryId: active.id,
                promptId: active.id,
                prompt: active.name,
                imageUrl: active.isolated ? active.isolatedUrl : active.originalUrl,
                imageFilename: active.isolated ? active.isolatedFilename : active.originalFilename,
                target: 'compose',
                handoffMode: 'open',
                savedAt: Date.now(),
              });
              router.push('/compose?from=gallery');
            }}
          >
            Open in Compose (desk)
          </Button>
        </div>
      ) : null}

      {plates.length > 1 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Saved plates</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {plates.map(plate => (
              <button
                key={plate.id}
                type="button"
                onClick={() => {
                  updateToolSettings({ activePlateId: plate.id });
                  applyPlateToRoleplay(plate);
                  setPreviewUrl(plate.isolated ? plate.isolatedUrl : plate.originalUrl);
                }}
                className={[
                  'h-16 w-16 shrink-0 overflow-hidden rounded-xl border',
                  plate.id === active?.id
                    ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                    : 'border-[var(--border-subtle)]',
                ].join(' ')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={plate.isolated ? plate.isolatedUrl : plate.originalUrl}
                  alt={plate.name}
                  className="h-full w-full bg-white object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
