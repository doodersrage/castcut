'use client';

import VisionScanButton from '@/components/VisionScanButton';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { cacheBustIdentityMediaUrl, IDENTITY_MEDIA_URL } from '@/lib/gallery-media-client';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { ROLEPLAY_PLAY_AS } from '@/lib/roleplay';
import type { RoleplayCastSectionProps } from '@/components/roleplay/roleplay-cast-section-types';

export function RoleplayCastPhotoSection({
  busy,
  playAs,
  isolateSubject,
  hasReferenceImage,
  scanning,
  referenceUploading,
  isolateStatus,
  displayReferenceUrl,
  referenceOriginalFilename,
  referenceOriginalUrl,
  referenceImageFilename,
  referenceImageUrl,
  lastStill,
  toolSettings: _toolSettings,
  onUpdateToolSettings,
  onClearReference,
  onApplyReference,
  onReferencePreviewUrlChange,
  onIsolateStatusChange,
  onError,
  onScanWithVision,
}: Pick<
  RoleplayCastSectionProps,
  | 'busy'
  | 'playAs'
  | 'isolateSubject'
  | 'hasReferenceImage'
  | 'scanning'
  | 'referenceUploading'
  | 'isolateStatus'
  | 'displayReferenceUrl'
  | 'referenceOriginalFilename'
  | 'referenceOriginalUrl'
  | 'referenceImageFilename'
  | 'referenceImageUrl'
  | 'lastStill'
  | 'toolSettings'
  | 'onUpdateToolSettings'
  | 'onClearReference'
  | 'onApplyReference'
  | 'onReferencePreviewUrlChange'
  | 'onIsolateStatusChange'
  | 'onError'
  | 'onScanWithVision'
>) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ROLEPLAY_PLAY_AS.map(entry => (
          <ChipButton
            key={entry.id}
            active={playAs === entry.id}
            disabled={busy}
            title={entry.hint}
            onClick={() => {
              if (entry.id === 'text') {
                onClearReference();
                return;
              }
              onUpdateToolSettings({ playAs: 'photo' });
            }}
          >
            {entry.label}
          </ChipButton>
        ))}
      </div>
      {playAs === 'photo' ? (
        <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3">
          <p className="text-xs text-[var(--text-muted)]">
            Stills use this reference (img2img). Isolate on white keeps face/body and drops the
            photo&apos;s room — pair with Setting for a new place.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <ChipButton
              active={isolateSubject}
              disabled={busy}
              title="Cut the subject out and place them on a white backdrop before queueing. First use downloads a small on-device model."
              onClick={() => {
                const next = !isolateSubject;
                if (!next && (referenceOriginalFilename || referenceOriginalUrl)) {
                  onUpdateToolSettings({
                    isolateSubject: false,
                    referenceIsolated: false,
                    referenceImageFilename: referenceOriginalFilename || referenceImageFilename,
                    referenceImageUrl: referenceOriginalUrl || referenceImageUrl,
                  });
                  if (referenceOriginalUrl || referenceImageUrl) {
                    onReferencePreviewUrlChange(
                      cacheBustIdentityMediaUrl(referenceOriginalUrl || referenceImageUrl)
                    );
                  }
                  onIsolateStatusChange(null);
                  return;
                }
                onUpdateToolSettings({ isolateSubject: next });
                const originalUrl = referenceOriginalUrl || referenceImageUrl;
                const originalFilename = referenceOriginalFilename || referenceImageFilename;
                if (!originalUrl && !originalFilename) {
                  return;
                }
                void onApplyReference({
                  imageUrl: originalUrl || IDENTITY_MEDIA_URL,
                  filename: originalFilename || 'roleplay-ref.png',
                  isolate: next,
                }).catch(err => {
                  onError(err instanceof Error ? err.message : 'Could not update the reference.');
                });
              }}
            >
              Isolate on white
            </ChipButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              className="ui-file-input block min-w-0 flex-1"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) {
                  return;
                }
                void onApplyReference({ file }).catch(err => {
                  onError(err instanceof Error ? err.message : 'Could not upload that photo.');
                });
              }}
            />
            <ButtonLink href={galleryPickPath('roleplay')} variant="secondary" size="sm">
              Choose from Gallery
            </ButtonLink>
            <VisionScanButton
              disabled={!hasReferenceImage || busy}
              scanning={scanning}
              onClick={() => void onScanWithVision()}
            />
            {lastStill ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  void onApplyReference({
                    imageUrl: lastStill.url,
                    filename: `roleplay-${lastStill.title}.png`,
                  }).catch(err => {
                    onError(err instanceof Error ? err.message : 'Could not use that still.');
                  });
                }}
              >
                Use last still
              </Button>
            ) : null}
            {hasReferenceImage ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={onClearReference}>
                Clear
              </Button>
            ) : null}
          </div>
          {displayReferenceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- session blob / comfy preview
            <img
              key={displayReferenceUrl}
              src={displayReferenceUrl}
              alt="Story reference"
              className="h-24 w-24 rounded-lg border border-[var(--border-subtle)] bg-white object-contain"
            />
          ) : null}
          {referenceUploading ? (
            <p className="text-xs text-[var(--text-muted)]">
              {isolateStatus ?? 'Uploading reference…'}
            </p>
          ) : isolateStatus ? (
            <p className="text-xs text-[var(--text-muted)]">{isolateStatus}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
