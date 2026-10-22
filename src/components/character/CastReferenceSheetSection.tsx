'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { resolveCastPlatePrepareModel, snapshotPlate } from '@/lib/cast/plate-prepare';
import {
  characterCardFacts,
  normalizeReferenceSheet,
  REFERENCE_SHEET_NEGATIVE,
  REFERENCE_SHEET_VIEWS,
  referenceSheetPrompt,
  saveReferenceSheetView,
} from '@/lib/cast/reference-sheet';
import { activeLook, type CharacterRecord } from '@/lib/character/os';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import type { DayPartnerNoun } from '@/lib/day/partner';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting/room';
import { loadSettingsCache } from '@/lib/settings/cache';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), { ssr: false });

const BODY_CANVAS = { width: 1104, height: 1472 };
const HEAD_CANVAS = { width: 1024, height: 1024 };

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!
  );
}

/**
 * Cast home → Reference sheet (cast-reference-sheet.ts): the look's plate from the side, the back
 * and three-quarter, and four expressions — seven short Edit 2511 passes, one after another —
 * and a printable character card.
 */
export default function CastReferenceSheetSection({
  character,
  noun,
  onUpdated,
}: {
  character: CharacterRecord;
  noun: DayPartnerNoun;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const [model] = useState(() => loadSettingsCache().shared.model);
  const actions = usePromptResultActions({ tool: 'fitting', model });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const look = activeLook(character);
  const sheet = normalizeReferenceSheet(look.referenceSheet) ?? [];
  const plate = (() => {
    try {
      return resolveFittingPlateFromCharacter(character);
    } catch {
      return null;
    }
  })();
  if (!plate) return null;

  const make = async (only?: string) => {
    setError(null);
    try {
      setBusy('Sending the plate to ComfyUI…');
      const before = await snapshotPlate(plate, model);
      const views = REFERENCE_SHEET_VIEWS.filter(view => !only || view.id === only);
      for (const [index, view] of views.entries()) {
        setBusy(`${view.label} (${index + 1} of ${views.length})…`);
        const promptId = await actions.sendComfyUi(
          referenceSheetPrompt(view.id, noun),
          null,
          undefined,
          {
            inputImageFilename: before.filename,
            inputImageUrl: before.imageUrl,
            identityLock: false,
            queueModel: resolveCastPlatePrepareModel(model),
            queueTool: 'fitting',
            turboEditStrength: 'balanced',
            castPlateReference: true,
            figurePixelSize: view.frame === 'body' ? { ...BODY_CANVAS } : { ...HEAD_CANVAS },
            explicitNegative: REFERENCE_SHEET_NEGATIVE,
            queueHints: '',
            characterId: character.id,
            lookId: look.id,
            sourceImageUrl: before.imageUrl,
          }
        );
        const id = typeof promptId === 'string' ? promptId.trim() : '';
        if (!id) throw new Error('ComfyUI did not accept the render — is it running?');
        const [entry] = await waitForGalleryPromptIds([id], {
          timeoutMs: 4 * 60_000,
          pollMs: 2_500,
        });
        const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
        if (!url) throw new Error(`The ${view.label.toLowerCase()} view did not finish.`);
        const next = saveReferenceSheetView(character.id, look.id, {
          id: view.id,
          label: view.label,
          url,
          promptId: id,
          at: Date.now(),
        });
        if (next) onUpdated?.(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The reference sheet failed.');
    } finally {
      setBusy(null);
    }
  };

  const printCard = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const images = [plate.imageUrl, ...sheet.map(view => view.url)]
      .filter((url): url is string => Boolean(url))
      .map(url => `<img src="${escapeHtml(new URL(url, window.location.origin).toString())}" />`)
      .join('');
    const facts = characterCardFacts(character, look)
      .map(fact => `<p>${escapeHtml(fact)}</p>`)
      .join('');
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(character.name)} — ${escapeHtml(look.name)}</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#111}h1{margin:0 0 4px}h2{margin:0 0 12px;font-weight:400;color:#555}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}img{width:100%;border-radius:6px;object-fit:cover;aspect-ratio:3/4}</style></head><body><h1>${escapeHtml(character.name)}</h1><h2>${escapeHtml(look.name)}</h2>${facts}<div class="g">${images}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`
    );
    win.document.close();
  };

  return (
    <ToolSection
      title="Reference sheet"
      description={`${look.name} from the side, the back and three-quarter, and four expressions — seven edits of the plate, about a minute each. Print it as a character card.`}
      data-testid="cast-reference-sheet-section"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(busy)}
            data-testid="cast-reference-sheet-make"
            onClick={() => void make()}
          >
            {busy ?? (sheet.length ? 'Make it again' : 'Make reference sheet')}
          </Button>
          {sheet.length ? (
            <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={printCard}>
              Print card
            </Button>
          ) : null}
        </div>
        {error ? <p className="ui-alert-danger type-caption">{error}</p> : null}
        {sheet.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {REFERENCE_SHEET_VIEWS.map(view => {
              const made = sheet.find(item => item.id === view.id);
              return (
                <li key={view.id} className="space-y-1" data-testid={`cast-reference-${view.id}`}>
                  {made ? (
                    <Button
                      variant="plain"
                      type="button"
                      className="block w-full cursor-zoom-in rounded-[var(--radius-sm)] border-0 bg-transparent p-0 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      aria-label={`Open the ${view.label.toLowerCase()} view full size`}
                      title="View larger"
                      data-testid={`cast-reference-${view.id}-open`}
                      onClick={() => {
                        // The whole sheet in order, opened at this view (arrows step through it).
                        const shown = REFERENCE_SHEET_VIEWS.flatMap(entry => {
                          const url = sheet.find(item => item.id === entry.id)?.url;
                          return url ? [{ id: entry.id, url }] : [];
                        });
                        setLightbox({
                          images: shown.map(item => item.url),
                          index: Math.max(
                            0,
                            shown.findIndex(item => item.id === view.id)
                          ),
                          title: `${look.name} · reference sheet`,
                        });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI view URLs */}
                      <img
                        src={made.url}
                        alt={`${look.name}, ${view.label.toLowerCase()}`}
                        loading="lazy"
                        className="aspect-[3/4] w-full rounded-[var(--radius-sm)] object-cover"
                      />
                    </Button>
                  ) : (
                    <div className="aspect-[3/4] w-full rounded-[var(--radius-sm)] bg-[var(--bg-subtle)]" />
                  )}
                  <button
                    type="button"
                    className="ui-text-link type-caption"
                    disabled={Boolean(busy)}
                    title={`Render the ${view.label.toLowerCase()} view again`}
                    onClick={() => void make(view.id)}
                  >
                    {view.label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {lightbox ? (
        <ImageLightbox
          state={lightbox}
          onClose={() => setLightbox(null)}
          onIndexChange={index =>
            setLightbox(current => (current ? { ...current, index } : current))
          }
        />
      ) : null}
    </ToolSection>
  );
}
