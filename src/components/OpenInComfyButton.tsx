'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import {
  openGalleryEntryInComfy,
  openPromptInComfy,
  type OpenInComfyResult,
} from '@/lib/open-in-comfy';

type OpenTarget =
  | {
      entry: Pick<
        ComfyGalleryEntry,
        'id' | 'promptId' | 'comfyUrl' | 'workflowJson' | 'tool' | 'model'
      >;
    }
  | { promptId: string };

async function report(result: OpenInComfyResult): Promise<void> {
  const { pushSystemTrayMessage } = await import('@/lib/system-tray-messages');
  pushSystemTrayMessage({
    text: result.message,
    tone: result.ok ? 'success' : 'warning',
    ttlMs: result.ok ? 9000 : 0,
  });
}

/** Send a still's exact graph to ComfyUI's editor (see lib/open-in-comfy) and say where it went. */
export function useOpenInComfy() {
  const [busy, setBusy] = useState(false);
  const open = useCallback((target: OpenTarget) => {
    setBusy(true);
    // Called synchronously from the click: the new tab opens before any await, so it is not
    // blocked as a pop-up.
    const pending =
      'entry' in target
        ? openGalleryEntryInComfy(target.entry)
        : openPromptInComfy(target.promptId);
    void pending
      .then(report)
      .catch(error =>
        report({
          ok: false,
          message: error instanceof Error ? error.message : 'Could not open in ComfyUI.',
        })
      )
      .finally(() => setBusy(false));
  }, []);
  return { busy, open };
}

/** Small "Open in ComfyUI" action for Day and Story still cards. */
export default function OpenInComfyButton({
  promptId,
  className,
  testId,
}: {
  promptId: string;
  className?: string;
  testId?: string;
}) {
  const { busy, open } = useOpenInComfy();
  return (
    <Button
      size="sm"
      variant="ghost"
      className={className}
      disabled={busy || !promptId.trim()}
      data-testid={testId}
      title="Save this still's exact graph to ComfyUI's Workflows (Castcut folder) and open ComfyUI"
      onClick={() => open({ promptId })}
    >
      {busy ? 'Opening…' : 'Open in ComfyUI'}
    </Button>
  );
}
