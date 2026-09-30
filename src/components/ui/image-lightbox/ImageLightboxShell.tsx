'use client';

import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import ImageLightboxHeader from '@/components/ui/image-lightbox/ImageLightboxHeader';
import ImageLightboxHelpOverlay from '@/components/ui/image-lightbox/ImageLightboxHelpOverlay';

export type ImageLightboxShellProps = {
  isFullscreen: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  transitionMs: number;
  ariaLabel: string;
  onClose: () => void;
  helpOpen: boolean;
  onHelpClose: () => void;
  overline: string;
  currentTitle?: string;
  displayIndex: number;
  titleAnimating: boolean;
  stage: ReactNode;
  sideNav: ReactNode;
  bottomChrome: ReactNode;
};

export default function ImageLightboxShell({
  isFullscreen,
  containerRef,
  transitionMs,
  ariaLabel,
  onClose,
  helpOpen,
  onHelpClose,
  overline,
  currentTitle,
  displayIndex,
  titleAnimating,
  stage,
  sideNav,
  bottomChrome,
}: ImageLightboxShellProps) {
  const headerProps = {
    overline,
    currentTitle,
    displayIndex,
    titleAnimating,
    transitionMs,
    onClose,
  };

  if (isFullscreen) {
    return createPortal(
      <div
        ref={containerRef}
        className="ui-force-dark fixed inset-0 z-[120] flex flex-col bg-black text-white"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={
          {
            '--lightbox-transition-duration': `${transitionMs}ms`,
            '--lightbox-image-max-h': '100vh',
          } as CSSProperties
        }
      >
        <ImageLightboxHeader compact {...headerProps} />
        <ImageLightboxHelpOverlay open={helpOpen} compact onClose={onHelpClose} />
        <div className="relative min-h-0 flex-1">
          {stage}
          {sideNav}
        </div>
        {bottomChrome}
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={containerRef}
      className="ui-force-dark fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 text-[var(--text-primary)]"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-testid="image-lightbox"
      style={
        {
          '--lightbox-transition-duration': `${transitionMs}ms`,
          '--lightbox-image-max-h': '100%',
        } as CSSProperties
      }
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close image preview"
      />

      <div
        className="relative z-10 flex h-[min(96vh,100%)] max-h-[96vh] w-full max-w-[min(98vw,1800px)] flex-col gap-2 overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        <ImageLightboxHeader {...headerProps} />
        <ImageLightboxHelpOverlay open={helpOpen} onClose={onHelpClose} />
        <div className="relative min-h-0 w-full flex-1">
          {stage}
          {sideNav}
        </div>
        {bottomChrome}
      </div>
    </div>,
    document.body
  );
}
