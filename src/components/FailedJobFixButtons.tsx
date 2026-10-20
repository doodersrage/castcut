'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import {
  applyQueueFailureFix,
  resolveQueueFailureFixes,
  type QueueFailureFixKind,
} from '@/lib/queue-failure-fix';
import {
  resolveQueueFailureGuideLabel,
  resolveQueueFailureHref,
} from '@/lib/queue-failure-playbook';

export default function FailedJobFixButtons({
  entry,
  poolUrls,
  onStatus,
  onDone,
}: {
  entry: ComfyGalleryEntry;
  poolUrls?: string[];
  onStatus?: (message: string) => void;
  onDone?: () => void;
}) {
  const fixes = resolveQueueFailureFixes(entry, poolUrls);
  const playbookHref = resolveQueueFailureHref(entry.statusMessage ?? '');
  if (fixes.length === 0 && !playbookHref) {
    return null;
  }

  async function runFix(kind: QueueFailureFixKind) {
    const result = await applyQueueFailureFix(entry, kind, { onStatus });
    if (!result.ok) {
      onStatus?.(result.error ?? 'Fix retry failed.');
    }
    onDone?.();
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {playbookHref ? (
        <ButtonLink
          href={playbookHref}
          size="sm"
          variant="ghost"
          data-testid="failed-job-playbook-link"
        >
          {resolveQueueFailureGuideLabel(playbookHref)}
        </ButtonLink>
      ) : null}
      {fixes.map(fix => (
        <Button
          key={fix.kind}
          size="sm"
          variant="secondary"
          title={fix.reason}
          data-testid={`failed-job-fix-${fix.kind}`}
          onClick={() => void runFix(fix.kind)}
        >
          {fix.label}
        </Button>
      ))}
    </div>
  );
}
