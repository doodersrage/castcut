'use client';

import { Button } from '@/components/ui/Button';
import { chromeBtn } from '@/components/ui/image-lightbox/chromeBtn';
import type { ImageLightboxSlideChrome } from '@/components/ui/image-lightbox/types';
import { isStillLightboxKind, type ComfyOutputMediaKind } from '@/lib/comfyui-outputs';
import type { GalleryLightboxFit } from '@/lib/gallery-lightbox-prefs';

export type ImageLightboxSlideChromeBarProps = {
  compact?: boolean;
  slideChrome?: ImageLightboxSlideChrome | null;
  chromeCompact: boolean;
  actionsOpen: boolean;
  metaOpen: boolean;
  helpOpen: boolean;
  moreOpen: boolean;
  baOpen: boolean;
  dualMode: boolean;
  fitMode: GalleryLightboxFit;
  histogramOpen: boolean;
  preferFullRes: boolean;
  fullResLoading: boolean;
  hasDistinctFullRes: boolean;
  currentMediaKind: ComfyOutputMediaKind | undefined;
  imagesLength: number;
  index: number;
  onMetaOpenChange: (open: boolean | ((previous: boolean) => boolean)) => void;
  onActionsOpenChange: (open: boolean | ((previous: boolean) => boolean)) => void;
  onChromeCompactChange: (compact: boolean | ((previous: boolean) => boolean)) => void;
  onHelpOpenChange: (open: boolean | ((previous: boolean) => boolean)) => void;
  onMoreOpenChange: (open: boolean | ((previous: boolean) => boolean)) => void;
  onBaOpenChange: (open: boolean | ((previous: boolean) => boolean)) => void;
  onDualModeChange: (open: boolean | ((previous: boolean) => boolean)) => void;
  onDualIndexChange: (index: number | null | ((previous: number | null) => number | null)) => void;
  onFitModeChange: (
    mode: GalleryLightboxFit | ((previous: GalleryLightboxFit) => GalleryLightboxFit)
  ) => void;
  onHistogramOpenChange: (open: boolean | ((previous: boolean) => boolean)) => void;
  onPreferFullResChange: (prefer: boolean | ((previous: boolean) => boolean)) => void;
  onFullResLoadingChange: (loading: boolean) => void;
  onCurrentImageLoadedChange: (loaded: boolean) => void;
  onLoadHistogram: () => void;
  onApplyZoomPreset: (preset: 'fit' | 'center' | 'face') => void;
};

function iconActionClass(compactUi: boolean): string {
  return `${chromeBtn(compactUi)} !min-h-8 !min-w-8 justify-center px-1.5 font-medium tracking-tight`;
}

function renderIconAction(
  compactUi: boolean,
  opts: {
    label: string;
    title: string;
    onClick: () => void;
    pressed?: boolean;
    testId?: string;
  }
) {
  return (
    <Button
      key={opts.title}
      variant={compactUi ? 'ghost' : 'secondary'}
      className={iconActionClass(compactUi)}
      onClick={opts.onClick}
      title={opts.title}
      aria-label={opts.title}
      aria-pressed={opts.pressed}
      data-testid={opts.testId}
    >
      {opts.label}
    </Button>
  );
}

export default function ImageLightboxSlideChromeBar({
  compact = false,
  slideChrome = null,
  chromeCompact,
  actionsOpen,
  metaOpen,
  helpOpen,
  moreOpen,
  baOpen,
  dualMode,
  fitMode,
  histogramOpen,
  preferFullRes,
  fullResLoading,
  hasDistinctFullRes,
  currentMediaKind,
  imagesLength,
  index,
  onMetaOpenChange,
  onActionsOpenChange,
  onChromeCompactChange,
  onHelpOpenChange,
  onMoreOpenChange,
  onBaOpenChange,
  onDualModeChange,
  onDualIndexChange,
  onFitModeChange,
  onHistogramOpenChange,
  onPreferFullResChange,
  onFullResLoadingChange,
  onCurrentImageLoadedChange,
  onLoadHistogram,
  onApplyZoomPreset,
}: ImageLightboxSlideChromeBarProps) {
  const showExtended = !chromeCompact || actionsOpen;
  const primary = (
    <>
      {slideChrome?.onRate
        ? ([1, 2, 3, 4, 5] as const).map(rating => (
            <button
              key={rating}
              type="button"
              onClick={() => slideChrome.onRate?.(rating)}
              data-testid={`lightbox-rate-${rating}`}
              aria-label={`${rating}★`}
              title={`Rate ${rating}`}
              className={`rounded-md px-1.5 py-0.5 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                compact
                  ? slideChrome.rating === rating
                    ? 'bg-[var(--accent-muted)] text-white ring-white/40'
                    : 'bg-white/10 text-white/75 hover:bg-white/20'
                  : slideChrome.rating === rating
                    ? 'bg-[var(--accent-muted)] text-[var(--accent-text)] ring-[var(--accent-ring)]'
                    : 'bg-[var(--bg-muted)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {rating}★
            </button>
          ))
        : null}
      {slideChrome?.onToggleFavorite ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onToggleFavorite?.()}
        >
          {slideChrome.favorite ? '★ Fav' : '☆ Fav'}
        </Button>
      ) : null}
      {slideChrome?.meta || slideChrome?.onNoteChange ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => onMetaOpenChange(previous => !previous)}
          aria-pressed={metaOpen}
        >
          {metaOpen ? 'Hide details' : 'Details'}
        </Button>
      ) : null}
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        className={chromeBtn(compact)}
        onClick={() => {
          if (chromeCompact) {
            onActionsOpenChange(previous => !previous);
          } else {
            onChromeCompactChange(true);
            onActionsOpenChange(true);
          }
        }}
        aria-expanded={showExtended}
        data-testid="lightbox-actions-toggle"
      >
        {chromeCompact ? (actionsOpen ? 'Hide actions' : 'Actions') : 'Compact'}
      </Button>
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        className={chromeBtn(compact)}
        onClick={() => onHelpOpenChange(previous => !previous)}
        aria-pressed={helpOpen}
      >
        ?
      </Button>
    </>
  );

  const extended = showExtended ? (
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid="lightbox-actions-rail"
      role="toolbar"
      aria-label="Lightbox actions"
    >
      {slideChrome?.showImprove !== false && slideChrome?.onImprove
        ? renderIconAction(compact, {
            label: '↑',
            title: 'Improve (I)',
            onClick: () => slideChrome.onImprove?.(),
            testId: 'lightbox-action-improve',
          })
        : null}
      {slideChrome?.showCompose !== false && slideChrome?.onCompose
        ? renderIconAction(compact, {
            label: 'C',
            title: 'Compose (C)',
            onClick: () => slideChrome.onCompose?.(),
            testId: 'lightbox-action-compose',
          })
        : null}
      {slideChrome?.showInpaint !== false && slideChrome?.onInpaint
        ? renderIconAction(compact, {
            label: '✂',
            title: 'Inpaint',
            onClick: () => slideChrome.onInpaint?.(),
          })
        : null}
      {slideChrome?.showExact && slideChrome?.onExactRequeue
        ? renderIconAction(compact, {
            label: 'Exact',
            title: 'Exact requeue',
            onClick: () => slideChrome.onExactRequeue?.(),
          })
        : null}
      {slideChrome?.showUseStack !== false && slideChrome?.onUseStack
        ? renderIconAction(compact, {
            label: 'Stack',
            title: 'Use this stack (U)',
            onClick: () => slideChrome.onUseStack?.(),
            testId: 'lightbox-action-use-stack',
          })
        : null}
      {slideChrome?.showUsePromptStack !== false && slideChrome?.onUsePromptStack
        ? renderIconAction(compact, {
            label: 'Prompt+',
            title: 'Prompt + stack',
            onClick: () => slideChrome.onUsePromptStack?.(),
            testId: 'lightbox-action-use-prompt-stack',
          })
        : null}
      {slideChrome?.showUseFace !== false && slideChrome?.onUseFace
        ? renderIconAction(compact, {
            label: 'Lock',
            title: 'Lock this face (L)',
            onClick: () => slideChrome.onUseFace?.(),
            testId: 'lightbox-action-use-face',
          })
        : null}
      {slideChrome?.showSaveLook && slideChrome?.onSaveLook
        ? renderIconAction(compact, {
            label: 'Look',
            title: 'Save look from this still',
            onClick: () => slideChrome.onSaveLook?.(),
            testId: 'lightbox-action-save-look',
          })
        : null}
      {slideChrome?.showKeep && slideChrome?.onKeep
        ? renderIconAction(compact, {
            label: 'Keep',
            title: 'Keep this try-on for Day',
            onClick: () => slideChrome.onKeep?.(),
            testId: 'lightbox-action-keep',
          })
        : null}
      {slideChrome?.showPass && slideChrome?.onPass
        ? renderIconAction(compact, {
            label: 'Pass',
            title: 'Dismiss this try-on',
            onClick: () => slideChrome.onPass?.(),
            testId: 'lightbox-action-pass',
          })
        : null}
      {slideChrome?.showRequeue !== false && slideChrome?.onRequeue
        ? renderIconAction(compact, {
            label: '↻',
            title: 'Requeue same seed',
            onClick: () => slideChrome.onRequeue?.(),
          })
        : null}
      {slideChrome?.onRetryStickyHost
        ? renderIconAction(compact, {
            label: '⌖',
            title: slideChrome.meta?.host
              ? `Retry on ${slideChrome.meta.host}`
              : 'Retry on this host',
            onClick: () => slideChrome.onRetryStickyHost?.(),
          })
        : null}
      {slideChrome?.showSeedVariation !== false && slideChrome?.onRequeueNewSeed
        ? renderIconAction(compact, {
            label: '🎲',
            title: 'Requeue with new seed',
            onClick: () => slideChrome.onRequeueNewSeed?.(),
            testId: 'lightbox-action-new-seed',
          })
        : null}
      {slideChrome?.showSeedVariation !== false && slideChrome?.onRequeueSeedPlusOne
        ? renderIconAction(compact, {
            label: '+1',
            title: 'Requeue with seed +1',
            onClick: () => slideChrome.onRequeueSeedPlusOne?.(),
          })
        : null}
      {slideChrome?.onAddToCompare
        ? renderIconAction(compact, {
            label: '⧉',
            title: slideChrome.compareSelected ? 'Remove from compare (A)' : 'Add to compare (A)',
            onClick: () => slideChrome.onAddToCompare?.(),
            pressed: Boolean(slideChrome.compareSelected),
          })
        : null}
      {slideChrome?.onOpenCompare &&
      (slideChrome.compareCount ?? 0) >= 2 &&
      (slideChrome.compareCount ?? 0) <= 4
        ? renderIconAction(compact, {
            label: 'Cmp',
            title: 'Open compare',
            onClick: () => slideChrome.onOpenCompare?.(),
          })
        : null}
      {slideChrome?.onShowParent
        ? renderIconAction(compact, {
            label: '↖',
            title: 'Parent (P)',
            onClick: () => slideChrome.onShowParent?.(),
          })
        : null}
      {slideChrome?.onShowDerivatives
        ? renderIconAction(compact, {
            label: '↘',
            title: 'Derivatives (G)',
            onClick: () => slideChrome.onShowDerivatives?.(),
          })
        : null}
      {slideChrome?.onJumpToSibling
        ? renderIconAction(compact, {
            label: '⇄',
            title: 'Sibling (S)',
            onClick: () => slideChrome.onJumpToSibling?.(),
          })
        : null}
      {slideChrome?.onRemove
        ? renderIconAction(compact, {
            label: '⌫',
            title: 'Remove (Delete)',
            onClick: () => slideChrome.onRemove?.(),
          })
        : null}
      {slideChrome?.beforeAfterUrl && isStillLightboxKind(currentMediaKind)
        ? renderIconAction(compact, {
            label: 'B/A',
            title: baOpen ? 'Exit before/after (X)' : 'Before/after wipe (X)',
            onClick: () => {
              onBaOpenChange(previous => !previous);
              onDualModeChange(false);
            },
            pressed: baOpen,
          })
        : null}
      {imagesLength > 1
        ? renderIconAction(compact, {
            label: '‖',
            title: dualMode ? 'Exit pair mode (Y)' : 'Side-by-side pair (Y)',
            onClick: () => {
              onDualModeChange(previous => {
                const next = !previous;
                if (!next) {
                  onDualIndexChange(null);
                } else {
                  onBaOpenChange(false);
                  const fallback = index < imagesLength - 1 ? index + 1 : Math.max(0, index - 1);
                  onDualIndexChange(current =>
                    current != null && current !== index ? current : fallback
                  );
                }
                return next;
              });
            },
            pressed: dualMode,
          })
        : null}
      {renderIconAction(compact, {
        label: fitMode === 'actual' ? '1:1' : fitMode === 'cover' ? 'Fill' : 'Fit',
        title: 'Cycle fit mode (V)',
        onClick: () =>
          onFitModeChange(previous =>
            previous === 'contain' ? 'cover' : previous === 'cover' ? 'actual' : 'contain'
          ),
      })}
      {isStillLightboxKind(currentMediaKind)
        ? renderIconAction(compact, {
            label: '⊡',
            title: 'Zoom fit',
            onClick: () => onApplyZoomPreset('fit'),
          })
        : null}
      {isStillLightboxKind(currentMediaKind)
        ? renderIconAction(compact, {
            label: '2×',
            title: 'Zoom 2× center',
            onClick: () => onApplyZoomPreset('center'),
          })
        : null}
      {isStillLightboxKind(currentMediaKind)
        ? renderIconAction(compact, {
            label: '☺',
            title: 'Face-zone zoom',
            onClick: () => onApplyZoomPreset('face'),
          })
        : null}
      {isStillLightboxKind(currentMediaKind)
        ? renderIconAction(compact, {
            label: '🎨',
            title: histogramOpen ? 'Hide colors (H)' : 'Color histogram (H)',
            onClick: () => {
              if (histogramOpen) {
                onHistogramOpenChange(false);
              } else {
                void onLoadHistogram();
              }
            },
            pressed: histogramOpen,
            testId: 'lightbox-action-colors',
          })
        : null}
      {hasDistinctFullRes
        ? renderIconAction(compact, {
            label: preferFullRes ? (fullResLoading ? '…' : 'Mid') : 'Full',
            title: preferFullRes ? 'Show mid-res (O)' : 'Show full-res (O)',
            onClick: () => {
              onPreferFullResChange(previous => {
                const next = !previous;
                if (next) {
                  onFullResLoadingChange(true);
                  onCurrentImageLoadedChange(false);
                }
                return next;
              });
            },
            pressed: preferFullRes,
          })
        : null}
      {renderIconAction(compact, {
        label: chromeCompact ? 'Pin' : 'Unpin',
        title: chromeCompact ? 'Pin actions open' : 'Collapse actions by default',
        onClick: () => {
          onChromeCompactChange(previous => !previous);
          onActionsOpenChange(true);
        },
      })}
      {slideChrome?.onOutpaint ||
      slideChrome?.onControlNet ||
      slideChrome?.onVideo ||
      slideChrome?.onReeditRefine ||
      slideChrome?.onReeditCompose ? (
        <div className="relative">
          {renderIconAction(compact, {
            label: '⋯',
            title: 'More handoffs',
            onClick: () => onMoreOpenChange(previous => !previous),
            pressed: moreOpen,
            testId: 'lightbox-action-more',
          })}
          {moreOpen ? (
            <div
              className="ui-lightbox-panel absolute bottom-full left-0 z-40 mb-1.5 min-w-[11rem] p-1.5"
              data-immersive={compact ? 'true' : undefined}
            >
              {[
                slideChrome.showOutpaint !== false && slideChrome.onOutpaint
                  ? { label: 'Outpaint', run: slideChrome.onOutpaint }
                  : null,
                slideChrome.showControlNet !== false && slideChrome.onControlNet
                  ? { label: 'ControlNet', run: slideChrome.onControlNet }
                  : null,
                slideChrome.showVideo !== false && slideChrome.onVideo
                  ? { label: 'Video', run: slideChrome.onVideo }
                  : null,
                slideChrome.onReeditRefine
                  ? { label: 'Re-edit · Refine', run: slideChrome.onReeditRefine }
                  : null,
                slideChrome.onReeditCompose
                  ? { label: 'Re-edit · Compose', run: slideChrome.onReeditCompose }
                  : null,
              ]
                .filter(Boolean)
                .map(item => (
                  <button
                    key={item!.label}
                    type="button"
                    className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                      compact
                        ? 'text-white/85 hover:bg-white/10'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                    onClick={() => {
                      onMoreOpenChange(false);
                      item!.run();
                    }}
                  >
                    {item!.label}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">{primary}</div>
      {extended ? <div className="flex flex-wrap items-center gap-1.5">{extended}</div> : null}
    </div>
  );
}
