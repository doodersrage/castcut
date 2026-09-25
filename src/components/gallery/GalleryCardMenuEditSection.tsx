import {
  buildGalleryHandoff,
  buildReeditGalleryHandoff,
  galleryHandoffPath,
  saveGalleryHandoff,
} from '@/lib/gallery-handoff';
import {
  startAnatomyRepairFromGalleryEntry,
  startBackgroundFromGalleryEntry,
  startImproveFromGalleryEntry,
  startInpaintFromGalleryEntry,
  startMeshFromGalleryEntry,
  startOutpaintFromGalleryEntry,
} from '@/lib/improve-output';
import {
  galleryVariationsPath,
  prepareGalleryVariationsFromEntry,
} from '@/lib/gallery-variations-handoff';
import { loadEngineSettings } from '@/lib/engine-settings';
import { continueClipActionLabel } from '@/lib/video-clip-mode';
import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';
import { requestGalleryUsePose } from '@/lib/gallery-pose-event';

export function GalleryEditSection({
  entry,
  layout,
  previewUrl,
  primaryMediaKind,
  isVideoHero,
  showAnatomyRepairAction,
  onAnatomyRepair,
  router,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  if (!(entry.status === 'completed' && entry.prompt?.trim())) {
    return null;
  }

  return (
    <GalleryMenuGroup label="Edit">
      {previewUrl && primaryMediaKind === 'image' ? (
        <GalleryMenuButton
          label="Use this pose…"
          onClick={() => {
            requestGalleryUsePose(entry.id);
            setMenuOpen(false);
          }}
        />
      ) : null}
      <GalleryMenuButton
        label="Edit prompt"
        onClick={() => {
          saveGalleryHandoff(buildGalleryHandoff(entry, 'promptEditor'));
          router.push(galleryHandoffPath('promptEditor'));
          setMenuOpen(false);
        }}
      />
      {previewUrl ? (
        <>
          {layout === 'list' ? (
            <>
              <GalleryMenuButton
                label="Improve"
                onClick={() => {
                  startImproveFromGalleryEntry(entry);
                  setMenuOpen(false);
                }}
              />
              <GalleryMenuButton
                label="Inpaint"
                onClick={() => {
                  startInpaintFromGalleryEntry(entry);
                  setMenuOpen(false);
                }}
              />
              {showAnatomyRepairAction ? (
                <GalleryMenuButton
                  label="Anatomy repair"
                  onClick={() => {
                    if (onAnatomyRepair) {
                      onAnatomyRepair();
                    } else {
                      startAnatomyRepairFromGalleryEntry(entry);
                    }
                    setMenuOpen(false);
                  }}
                />
              ) : null}
              <GalleryMenuButton
                label="Outpaint"
                onClick={() => {
                  startOutpaintFromGalleryEntry(entry);
                  setMenuOpen(false);
                }}
              />
            </>
          ) : null}
          <GalleryMenuButton
            label="Refine"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'refine'));
              router.push(galleryHandoffPath('refine'));
              setMenuOpen(false);
            }}
          />
          {primaryMediaKind === 'image' && previewUrl && showAnatomyRepairAction ? (
            <GalleryMenuButton
              label="Anatomy repair → inpaint limb"
              onClick={() => {
                if (onAnatomyRepair) {
                  onAnatomyRepair();
                } else {
                  startAnatomyRepairFromGalleryEntry(entry);
                }
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Re-edit · Refine (same stack)"
            onClick={() => {
              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'refine'));
              router.push(galleryHandoffPath('refine'));
              setMenuOpen(false);
            }}
          />
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · Inpaint (same stack)"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'inpaint'));
                router.push(galleryHandoffPath('inpaint'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · Outpaint (same stack)"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'outpaint'));
                router.push(galleryHandoffPath('outpaint'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Open in Variations"
            onClick={() => {
              prepareGalleryVariationsFromEntry(entry);
              router.push(galleryVariationsPath());
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="Compose"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'compose'));
              router.push(galleryHandoffPath('compose'));
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="Re-edit · Compose (same stack)"
            onClick={() => {
              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'compose'));
              router.push(galleryHandoffPath('compose'));
              setMenuOpen(false);
            }}
          />
          {layout !== 'list' ? (
            <GalleryMenuButton
              label="Outpaint"
              onClick={() => {
                startOutpaintFromGalleryEntry(entry);
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Image → Prompt"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'imagePrompt'));
              router.push(galleryHandoffPath('imagePrompt'));
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="ControlNet"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'controlnet'));
              router.push(galleryHandoffPath('controlnet'));
              setMenuOpen(false);
            }}
          />
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · ControlNet (same stack)"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'controlnet'));
                router.push(galleryHandoffPath('controlnet'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Background"
            onClick={() => {
              startBackgroundFromGalleryEntry(entry);
              setMenuOpen(false);
            }}
          />
          {primaryMediaKind === 'image' && entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Mesh / 3D"
              onClick={() => {
                startMeshFromGalleryEntry(entry);
                setMenuOpen(false);
              }}
            />
          ) : null}
          {primaryMediaKind === 'image' && entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Animate this still"
              onClick={() => {
                saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
                router.push(galleryHandoffPath('video'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          {entry.derivedKind === 'film' && entry.characterId && entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Open film on character"
              onClick={() => {
                const characterId = entry.characterId?.trim();
                if (!characterId) {
                  return;
                }
                router.push(`/characters/${encodeURIComponent(characterId)}`);
                setMenuOpen(false);
              }}
            />
          ) : null}
          {(isVideoHero || entry.derivedKind === 'i2v' || entry.derivedKind === 'extend') &&
          entry.derivedKind !== 'film' &&
          entry.status === 'completed' ? (
            <GalleryMenuButton
              label={continueClipActionLabel({
                parentUrl: previewUrl,
                engine: loadEngineSettings().engine,
              })}
              onClick={() => {
                saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
                router.push(galleryHandoffPath('video'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · Video (same stack)"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'video'));
                router.push(galleryHandoffPath('video'));
                setMenuOpen(false);
              }}
            />
          ) : null}
        </>
      ) : null}
    </GalleryMenuGroup>
  );
}
