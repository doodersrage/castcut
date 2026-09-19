import type { GallerySlideshowTransition } from '@/lib/comfyui-gallery';
import type { ComfyOutputMediaKind } from '@/lib/comfyui-outputs';

export type ImageLightboxState = {
  images: string[];
  index: number;
  title?: string;
  /** Optional per-image titles; falls back to `title` when omitted. */
  titles?: string[];
  /** Full-res URLs parallel to `images` — used by "Open original". */
  originalImages?: string[];
  /** Download-ready Comfy view URLs (with width param) parallel to `images`. */
  downloadUrls?: string[];
  /** Per-slide filenames for naming the downloaded file; falls back to promptId slice. */
  downloadFilenames?: string[];
  /** Grid-thumb URLs parallel to `images` — blur-up while mid-res loads. */
  thumbImages?: string[];
  /** Per-slide media kind (image vs. video/animated), parallel to `images`. */
  mediaKinds?: ComfyOutputMediaKind[];
};

export type ImageLightboxSlideshowOptions = {
  playing: boolean;
  intervalMs: number;
  intervalOptions?: readonly number[];
  transition: GallerySlideshowTransition;
  transitionOptions?: readonly GallerySlideshowTransition[];
  onPlayingChange: (playing: boolean) => void;
  onIntervalChange?: (intervalMs: number) => void;
  onTransitionChange?: (transition: GallerySlideshowTransition) => void;
  /** Immersive presentation: image fills the viewport (optionally via browser fullscreen). */
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
};

export type ImageLightboxSlideMeta = {
  model?: string;
  seed?: string;
  cfg?: string;
  steps?: string;
  width?: string;
  height?: string;
  tool?: string;
  prompt?: string;
  negativePrompt?: string;
  derivedKind?: string;
  host?: string;
};

export type ImageLightboxJobChrome = {
  status: 'pending' | 'running' | 'completed' | 'error';
  label: string;
  percent?: number | null;
};

/** Per-slide review / iterate actions for the current lightbox index. */
export type ImageLightboxSlideChrome = {
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  favorite?: boolean;
  onRate?: (rating: 1 | 2 | 3 | 4 | 5) => void;
  onToggleFavorite?: () => void;
  onImprove?: () => void;
  onCompose?: () => void;
  onInpaint?: () => void;
  onExactRequeue?: () => void;
  onUseStack?: () => void;
  onUsePromptStack?: () => void;
  onUseFace?: () => void;
  onSaveLook?: () => void;
  onKeep?: () => void;
  onPass?: () => void;
  onRequeue?: () => void;
  onRequeueNewSeed?: () => void;
  onRequeueSeedPlusOne?: () => void;
  onRetryStickyHost?: () => void;
  showImprove?: boolean;
  showCompose?: boolean;
  showInpaint?: boolean;
  showExact?: boolean;
  showUseStack?: boolean;
  showUsePromptStack?: boolean;
  showUseFace?: boolean;
  showSaveLook?: boolean;
  showKeep?: boolean;
  showPass?: boolean;
  showRequeue?: boolean;
  showSeedVariation?: boolean;
  /** Seed / model / prompt details for the Details (M) panel. */
  meta?: ImageLightboxSlideMeta | null;
  note?: string;
  onNoteChange?: (note: string) => void;
  onCopyPrompt?: () => void;
  onCopyNegative?: () => void;
  onAddToCompare?: () => void;
  compareSelected?: boolean;
  compareCount?: number;
  onOpenCompare?: () => void;
  onRemove?: () => void;
  onShowParent?: () => void;
  onShowDerivatives?: () => void;
  onJumpToSibling?: () => void;
  hasParent?: boolean;
  hasDerivatives?: boolean;
  hasSibling?: boolean;
  /** Parent/before image URL for wipe compare. */
  beforeAfterUrl?: string;
  beforeAfterLabel?: string;
  job?: ImageLightboxJobChrome | null;
  onOutpaint?: () => void;
  onControlNet?: () => void;
  onVideo?: () => void;
  onReeditRefine?: () => void;
  onReeditCompose?: () => void;
  showOutpaint?: boolean;
  showControlNet?: boolean;
  showVideo?: boolean;
};
