import Link from 'next/link';
import { downloadGalleryImage, downloadGallerySidecar } from '@/lib/comfyui-gallery-export';
import { galleryDownloadActionLabel } from '@/lib/comfyui-outputs';
import { studioHistoryUrl } from '@/lib/prompt-lineage';
import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';
import { useOpenInComfy } from '@/components/OpenInComfyButton';

export function GalleryExportSection({
  entry,
  previewUrl,
  primaryMediaKind,
  onDownloadError,
  onViewWorkflow,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  const { busy: openingInComfy, open: openInComfy } = useOpenInComfy();
  return (
    <GalleryMenuGroup label="Export" collapsible>
      {entry.status === 'completed' && previewUrl ? (
        <GalleryMenuButton
          label={galleryDownloadActionLabel(primaryMediaKind)}
          onClick={() => {
            onDownloadError(null);
            void downloadGalleryImage(entry).catch(error => {
              onDownloadError(error instanceof Error ? error.message : 'Download failed.');
            });
            setMenuOpen(false);
          }}
        />
      ) : null}
      <GalleryMenuButton
        label="Sidecar JSON"
        onClick={() => {
          downloadGallerySidecar(entry);
          setMenuOpen(false);
        }}
      />
      {onViewWorkflow ? (
        <GalleryMenuButton
          label="View workflow"
          onClick={() => {
            onViewWorkflow();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {entry.status === 'completed' &&
      (entry.engineId ?? 'comfyui') === 'comfyui' &&
      (entry.promptId?.trim() || entry.hasStoredWorkflow || entry.workflowJson?.trim()) ? (
        <GalleryMenuButton
          label={openingInComfy ? 'Opening in ComfyUI…' : 'Open in ComfyUI'}
          data-testid="gallery-open-in-comfy"
          onClick={() => {
            if (openingInComfy) return;
            openInComfy({ entry });
            setMenuOpen(false);
          }}
        />
      ) : null}
      {entry.historyId ? (
        <Link
          href={studioHistoryUrl(entry.historyId)}
          role="menuitem"
          className="block rounded-lg px-3 py-2 text-xs text-[var(--tint-info-text)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--tint-info-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:bg-[var(--bg-muted)]/80"
          onClick={() => setMenuOpen(false)}
        >
          Studio history
        </Link>
      ) : null}
    </GalleryMenuGroup>
  );
}
