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
    <GalleryMenuGroup label="Open in tool" collapsible>
      <GalleryMenuButton
        label="Edit prompt"
        route="/prompt"
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
                route="/refine"
                onClick={() => {
                  startImproveFromGalleryEntry(entry);
                  setMenuOpen(false);
                }}
              />
              <GalleryMenuButton
                label="Inpaint"
                route="/inpaint"
                onClick={() => {
                  startInpaintFromGalleryEntry(entry);
                  setMenuOpen(false);
                }}
              />
              {showAnatomyRepairAction ? (
                <GalleryMenuButton
                  label="Anatomy repair"
                  route="/inpaint"
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
                route="/outpaint"
                onClick={() => {
                  startOutpaintFromGalleryEntry(entry);
                  setMenuOpen(false);
                }}
              />
            </>
          ) : null}
          <GalleryMenuButton
            label="Refine"
            route="/refine"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'refine'));
              router.push(galleryHandoffPath('refine'));
              setMenuOpen(false);
            }}
          />
          {primaryMediaKind === 'image' && previewUrl && showAnatomyRepairAction ? (
            <GalleryMenuButton
              label="Anatomy repair → inpaint limb"
              route="/inpaint"
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
            route="/refine"
            onClick={() => {
              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'refine'));
              router.push(galleryHandoffPath('refine'));
              setMenuOpen(false);
            }}
          />
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · Inpaint (same stack)"
              route="/inpaint"
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
              route="/outpaint"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'outpaint'));
                router.push(galleryHandoffPath('outpaint'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Open in Variations"
            route="/variations"
            onClick={() => {
              prepareGalleryVariationsFromEntry(entry);
              router.push(galleryVariationsPath());
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="Compose"
            route="/compose"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'compose'));
              router.push(galleryHandoffPath('compose'));
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="Re-edit · Compose (same stack)"
            route="/compose"
            onClick={() => {
              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'compose'));
              router.push(galleryHandoffPath('compose'));
              setMenuOpen(false);
            }}
          />
          {layout !== 'list' ? (
            <GalleryMenuButton
              label="Outpaint"
              route="/outpaint"
              onClick={() => {
                startOutpaintFromGalleryEntry(entry);
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Image → Prompt"
            route="/image-prompt"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'imagePrompt'));
              router.push(galleryHandoffPath('imagePrompt'));
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="ControlNet"
            route="/controlnet"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'controlnet'));
              router.push(galleryHandoffPath('controlnet'));
              setMenuOpen(false);
            }}
          />
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · ControlNet (same stack)"
              route="/controlnet"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'controlnet'));
                router.push(galleryHandoffPath('controlnet'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Background"
            route="/background"
            onClick={() => {
              startBackgroundFromGalleryEntry(entry);
              setMenuOpen(false);
            }}
          />
          {primaryMediaKind === 'image' && entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Mesh / 3D"
              route="/mesh"
              onClick={() => {
                startMeshFromGalleryEntry(entry);
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
              route="/video"
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
              route="/video"
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
