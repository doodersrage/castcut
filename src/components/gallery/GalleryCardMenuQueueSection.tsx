import {
  applyGalleryPromptAndStackToSession,
  applyGalleryStackToSession,
  galleryEntryCanSaveLook,
  galleryEntryHasRestorableStack,
  saveGalleryLookFromEntry,
} from '@/lib/gallery-stack-restore';
import { applyGalleryFaceToSession, galleryEntryCanLockFace } from '@/lib/gallery-identity-lock';
import { galleryToolHrefForEntry, galleryToolLabel } from '@/lib/gallery-tool-href';
import { loadEngineSettings } from '@/lib/engine-settings';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';

export function GalleryQueueSection({
  entry,
  comfyHostLabel,
  onCancel,
  onRequeue,
  onRestoreExactGraph,
  router,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  return (
    <GalleryMenuGroup label="Queue">
      {entry.status === 'pending' || entry.status === 'running' ? (
        <GalleryMenuButton
          label="Cancel job"
          tone="danger"
          onClick={() => {
            onCancel();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {galleryEntryHasRestorableStack(entry) ? (
        <GalleryMenuButton
          label={`Use this stack on ${galleryToolLabel(entry.tool)}`}
          data-testid="gallery-use-stack-menu"
          onClick={() => {
            applyGalleryStackToSession(entry);
            router.push(galleryToolHrefForEntry(entry));
            setMenuOpen(false);
          }}
        />
      ) : null}
      {galleryEntryHasRestorableStack(entry) && entry.prompt?.trim() ? (
        <GalleryMenuButton
          label={`Prompt + stack on ${galleryToolLabel(entry.tool)}`}
          data-testid="gallery-use-prompt-stack-menu"
          onClick={() => {
            applyGalleryPromptAndStackToSession(entry);
            router.push(galleryToolHrefForEntry(entry));
            setMenuOpen(false);
          }}
        />
      ) : null}
      {galleryEntryCanLockFace(entry) ? (
        <GalleryMenuButton
          label={`${
            isCloudEngine(loadEngineSettings().engine) ? 'Use as reference on' : 'Lock this face on'
          } ${galleryToolLabel(entry.tool)}`}
          data-testid="gallery-lock-face-menu"
          onClick={() => {
            void applyGalleryFaceToSession(entry).then(result => {
              if (result.ok) {
                router.push(galleryToolHrefForEntry(entry));
              }
            });
            setMenuOpen(false);
          }}
        />
      ) : null}
      {galleryEntryCanSaveLook(entry) ? (
        <GalleryMenuButton
          label="Save look from this still"
          data-testid="gallery-save-look-menu"
          onClick={() => {
            saveGalleryLookFromEntry(entry);
            setMenuOpen(false);
          }}
        />
      ) : null}
      {entry.hasStoredWorkflow || entry.workflowJson ? (
        <GalleryMenuButton
          label="Replay exact graph"
          data-testid="gallery-replay-exact"
          onClick={() => {
            onRequeue(false, undefined, { exactGraph: true });
            setMenuOpen(false);
          }}
        />
      ) : entry.promptId?.trim() && onRestoreExactGraph ? (
        <GalleryMenuButton
          label="Restore exact graph from Comfy history"
          data-testid="gallery-restore-exact"
          onClick={() => {
            onRestoreExactGraph();
            setMenuOpen(false);
          }}
        />
      ) : null}
      <GalleryMenuButton
        label="Re-queue (same seed)"
        onClick={() => {
          onRequeue(false, undefined, { exactGraph: false });
          setMenuOpen(false);
        }}
      />
      {entry.comfyUrl?.trim() ? (
        <GalleryMenuButton
          label={`Retry on this host (${comfyHostLabel ?? entry.comfyUrl})`}
          onClick={() => {
            onRequeue(false, undefined, {
              exactGraph: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
              stickyHost: true,
            });
            setMenuOpen(false);
          }}
        />
      ) : null}
      <GalleryMenuButton
        label="New seed"
        onClick={() => {
          onRequeue(true, undefined, { exactGraph: false });
          setMenuOpen(false);
        }}
      />
      <GalleryMenuButton
        label="Variation · Good (hires sampler)"
        onClick={() => {
          onRequeue(true, 'final', { exactGraph: false });
          setMenuOpen(false);
        }}
      />
      <GalleryMenuButton
        label="Variation · Best (heavy polish)"
        onClick={() => {
          onRequeue(true, 'max', { exactGraph: false });
          setMenuOpen(false);
        }}
      />
    </GalleryMenuGroup>
  );
}
