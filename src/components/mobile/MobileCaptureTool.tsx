'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { FieldError, TextInput } from '@/components/ui/Field';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { persistIdentityImage } from '@/lib/gallery-media-client';
import { saveGalleryHandoff } from '@/lib/gallery-handoff';
import { isolateSubjectOnWhite } from '@/lib/isolate-subject';
import {
  fittingPatchFromPlate,
  moodboardPatchFromPlate,
  newCharacterPlateId,
  roleplayPatchFromPlate,
  toMobileStudioHref,
  upsertCharacterPlate,
  type CharacterPlate,
} from '@/lib/mobile-studio';
import { startStarterPlayFilm } from '@/lib/play-starter';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  DEFAULT_MOBILE_STUDIO_TOOL_CACHE,
  DEFAULT_MOODBOARD_TOOL_CACHE,
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
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance({ mobile: true });

  const plates = useMemo(() => toolSettings.plates ?? [], [toolSettings.plates]);
  const active = plates.find(plate => plate.id === toolSettings.activePlateId) ?? plates[0] ?? null;

  const applyPlateToFilmLoop = useCallback((plate: CharacterPlate) => {
    const roleplay = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
    saveToolSettings('roleplay', {
      ...roleplay,
      ...roleplayPatchFromPlate(plate),
    });
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    saveToolSettings('fitting', {
      ...fitting,
      ...fittingPatchFromPlate(plate),
    });
    const moodboard = loadToolSettings('moodboard', DEFAULT_MOODBOARD_TOOL_CACHE);
    const seeded = moodboardPatchFromPlate(plate);
    const existingTiles = moodboard.tiles ?? [];
    const hasPlateTile = existingTiles.some(tile => tile.imageUrl === seeded.tiles[0]?.imageUrl);
    saveToolSettings('moodboard', {
      ...moodboard,
      tiles: hasPlateTile ? existingTiles : [...seeded.tiles, ...existingTiles],
    });
  }, []);

  const openLook = useCallback(
    (plate: CharacterPlate) => {
      applyPlateToFilmLoop(plate);
      router.push('/m/moodboard');
    },
    [applyPlateToFilmLoop, router]
  );

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
        applyPlateToFilmLoop(plate);
        setStatus(
          isolated ? 'Plate ready — continuing to Outfit…' : 'Plate saved — continuing to Outfit…'
        );
        softAdvanceHref(
          '/m/fitting',
          'Outfit',
          'Plate ready — continuing to Outfit (or go to Look)',
          [
            {
              href: '/m/moodboard',
              label: 'Go to Look instead',
            },
          ]
        );
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
    [applyPlateToFilmLoop, name, plates, shared.model, softAdvanceHref, updateToolSettings]
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
          Shoot or pick a photo. Isolate on white so Look, Outfit, and Day lock onto the subject —
          not the room. First use downloads a small on-device model.
        </p>
      </div>

      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

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
          loading={busy}
          className="w-full justify-center"
          onClick={() => cameraRef.current?.click()}
        >
          Camera
        </PrimaryButton>
        <Button
          variant="secondary"
          disabled={busy}
          className="w-full justify-center"
          onClick={() => libraryRef.current?.click()}
        >
          Library
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
          <button
            type="button"
            className="ui-btn-primary w-full justify-center text-center"
            onClick={() => openLook(active)}
          >
            Start Look
          </button>
          <Button
            variant="secondary"
            className="w-full justify-center"
            data-testid="mobile-capture-starter-film"
            onClick={() => {
              const result = startStarterPlayFilm();
              router.push(toMobileStudioHref(result.href));
            }}
          >
            Make a starter film
          </Button>
          <Link href="/m/story" className="ui-btn-secondary w-full justify-center text-center">
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
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-full justify-center"
            data-testid="mobile-capture-starter-film"
            onClick={() => {
              const result = startStarterPlayFilm();
              router.push(toMobileStudioHref(result.href));
            }}
          >
            Make a starter film
          </Button>
        </div>
      )}

      {plates.length > 1 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Recent plates</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {plates.map(plate => (
              <button
                key={plate.id}
                type="button"
                className={`min-w-[4.5rem] shrink-0 overflow-hidden rounded-xl border ${
                  plate.id === active?.id
                    ? 'border-[var(--accent-border)]'
                    : 'border-[var(--border-subtle)]'
                }`}
                onClick={() => {
                  updateToolSettings({ activePlateId: plate.id });
                  applyPlateToFilmLoop(plate);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={plate.isolated ? plate.isolatedUrl : plate.originalUrl}
                  alt={plate.name}
                  className="h-16 w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
