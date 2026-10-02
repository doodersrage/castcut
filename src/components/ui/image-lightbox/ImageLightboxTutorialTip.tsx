'use client';

import { Button } from '@/components/ui/Button';
import { chromeBtn } from '@/components/ui/image-lightbox/chromeBtn';
import { markGalleryLightboxTutorialSeen } from '@/lib/gallery-lightbox-prefs';

export type ImageLightboxTutorialTipProps = {
  compact?: boolean;
  tutorialVisible: boolean;
  helpOpen: boolean;
  onShowShortcuts: () => void;
  onDismiss: () => void;
};

export default function ImageLightboxTutorialTip({
  compact = false,
  tutorialVisible,
  helpOpen,
  onShowShortcuts,
  onDismiss,
}: ImageLightboxTutorialTipProps) {
  if (!tutorialVisible || helpOpen) {
    return null;
  }

  return (
    <div
      // A keyboard tip: not shown on touch devices.
      className="ui-lightbox-panel flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-[12px] [@media(pointer:coarse)]:hidden"
      data-immersive={compact ? 'true' : undefined}
    >
      <p>
        Tip: press <span className="font-medium">?</span> for lightbox shortcuts (zoom, rate,
        compose, before/after…).
      </p>
      <div className="flex gap-1.5">
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={onShowShortcuts}
        >
          Show shortcuts
        </Button>
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => {
            onDismiss();
            markGalleryLightboxTutorialSeen();
          }}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
