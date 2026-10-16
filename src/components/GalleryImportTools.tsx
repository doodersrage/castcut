'use client';

import { useState } from 'react';
import PngMetadataImportButton from '@/components/PngMetadataImportButton';
import SidecarImportButton from '@/components/SidecarImportButton';
import { importCompletedHostJobs } from '@/lib/comfyui-gallery-client';
import {
  requeueComfyJob,
  requeueRefineFromGalleryEntry,
  requeueUpscaleFromGalleryEntry,
} from '@/lib/comfyui-requeue';
import { galleryEntryFromSidecar } from '@/lib/gallery-sidecar-entry';
import {
  sidecarNegativePrompt,
  sidecarRequeueContext,
  type PromptSidecar,
} from '@/lib/prompt-sidecar';
import { resolveSelectedWorkflowRuntime } from '@/lib/comfyui-runtime';
import { toastHeldMax } from '@/lib/app-toast';
import { Button } from '@/components/ui/Button';
import GalleryUploadButton from '@/components/gallery/GalleryUploadButton';
import QueueOrchestrationPanel from '@/components/QueueOrchestrationPanel';

export default function GalleryImportTools() {
  const [importedSidecar, setImportedSidecar] = useState<PromptSidecar | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pseudoEntry = importedSidecar ? galleryEntryFromSidecar(importedSidecar) : null;
  const canUpscaleRefine = Boolean(pseudoEntry);

  return (
    <>
      <p className="type-caption">
        Backfill outputs generated outside this app, upload stills from disk, or inspect the ComfyUI
        queue.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SidecarImportButton
          onImport={sidecar => {
            setImportedSidecar(sidecar);
            setImportStatus(`Loaded sidecar from ${sidecar.tool ?? 'unknown tool'}.`);
          }}
          onError={setImportStatus}
        />
        <GalleryUploadButton
          className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-default)]"
          onImported={result => {
            setImportStatus(
              result.imported > 0
                ? `Imported ${result.imported} image${result.imported === 1 ? '' : 's'} into the gallery${
                    result.failed > 0 ? ` · ${result.failed} skipped` : ''
                  }.`
                : (result.errors[0] ?? 'Could not import those images.')
            );
          }}
        />
        <PngMetadataImportButton
          onImport={sidecar => {
            setImportedSidecar(sidecar);
            setImportStatus(`Loaded PNG metadata (${sidecar.tool ?? 'png-import'}).`);
          }}
          onError={setImportStatus}
        />
        <Button
          variant="secondary"
          loading={historyLoading}
          loadingLabel="Importing ComfyUI history"
          onClick={() => {
            setHistoryLoading(true);
            const stickyUrl = resolveSelectedWorkflowRuntime()?.apiUrl?.trim();
            void importCompletedHostJobs(40, stickyUrl)
              .then(result => {
                setImportStatus(
                  `Imported ${result.imported}, upgraded ${result.upgraded}, skipped ${result.skipped} completed host jobs${
                    result.hosts > 1 ? ` across ${result.hosts} hosts` : ''
                  }.`
                );
              })
              .catch(error => {
                setImportStatus(error instanceof Error ? error.message : 'Host job import failed.');
              })
              .finally(() => setHistoryLoading(false));
          }}
        >
          Import completed host jobs
        </Button>
      </div>
      {importStatus ? <p className="text-xs text-[var(--text-muted)]">{importStatus}</p> : null}
      {importedSidecar ? (
        <div className="ui-surface-inset space-y-3">
          <p className="line-clamp-3 type-body">{importedSidecar.positive}</p>
          {!canUpscaleRefine ? (
            <p className="text-xs text-[var(--tint-warning-text)]">
              Upscale and refine need an output or source image URL in the sidecar metadata.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setImportStatus('Re-queueing imported sidecar…');
                const requeue = sidecarRequeueContext(importedSidecar);
                void requeueComfyJob({
                  prompt: importedSidecar.positive,
                  negativePrompt: sidecarNegativePrompt(importedSidecar),
                  tool: importedSidecar.tool,
                  model: importedSidecar.model,
                  hints: importedSidecar.hints,
                  queueParams: requeue.queueParams,
                  sourceImageUrl: requeue.sourceImageUrl,
                  maskImageUrl: requeue.maskImageUrl,
                  storedQualityProfile: requeue.queueQualityProfile,
                  workflowJson: requeue.workflowJson,
                  newSeed: false,
                  onStatus: setImportStatus,
                }).then(result => {
                  if (result.ok && result.held) {
                    const message = 'Max re-queue held until ComfyUI queue is idle';
                    setImportStatus(message);
                    toastHeldMax({ text: message });
                  }
                });
              }}
            >
              Re-queue
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setImportStatus('Queueing new variation…');
                const requeue = sidecarRequeueContext(importedSidecar);
                void requeueComfyJob({
                  prompt: importedSidecar.positive,
                  negativePrompt: sidecarNegativePrompt(importedSidecar),
                  tool: importedSidecar.tool,
                  model: importedSidecar.model,
                  hints: importedSidecar.hints,
                  queueParams: requeue.queueParams,
                  sourceImageUrl: requeue.sourceImageUrl,
                  maskImageUrl: requeue.maskImageUrl,
                  storedQualityProfile: requeue.queueQualityProfile,
                  workflowJson: requeue.workflowJson,
                  newSeed: true,
                  onStatus: setImportStatus,
                }).then(result => {
                  if (result.ok && result.held) {
                    const message = 'Max re-queue held until ComfyUI queue is idle';
                    setImportStatus(message);
                    toastHeldMax({ text: message });
                  }
                });
              }}
            >
              New variation (new seed)
            </Button>
            {pseudoEntry ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportStatus('Upscaling imported output (Final)…');
                    void requeueUpscaleFromGalleryEntry(pseudoEntry, {
                      qualityProfile: 'final',
                      onStatus: setImportStatus,
                    }).then(result => {
                      if (result.ok && result.held) {
                        const message = 'Max upscale held until ComfyUI queue is idle';
                        setImportStatus(message);
                        toastHeldMax({ text: message });
                      }
                    });
                  }}
                >
                  Upscale (Final)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportStatus('Upscaling imported output (Max)…');
                    void requeueUpscaleFromGalleryEntry(pseudoEntry, {
                      qualityProfile: 'max',
                      onStatus: setImportStatus,
                    }).then(result => {
                      if (result.ok && result.held) {
                        const message = 'Max upscale held until ComfyUI queue is idle';
                        setImportStatus(message);
                        toastHeldMax({ text: message });
                      }
                    });
                  }}
                >
                  Upscale (Max)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportStatus('Queueing low-denoise refine…');
                    void requeueRefineFromGalleryEntry(pseudoEntry, {
                      onStatus: setImportStatus,
                    }).then(result => {
                      if (result.ok && result.held) {
                        const message = 'Max refine held until ComfyUI queue is idle';
                        setImportStatus(message);
                        toastHeldMax({ text: message });
                      }
                    });
                  }}
                >
                  Refine (low denoise)
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--text-muted)]"
              onClick={() => {
                setImportedSidecar(null);
                setImportStatus(null);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}
      <QueueOrchestrationPanel />
    </>
  );
}
