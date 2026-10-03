'use client';

import { useEffect } from 'react';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { resolveAdultNudePlateQueueModel, resolveModelForQueueTool } from '@/lib/queue-tool-model';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';
import { warmUpSkipLine, type WarmUpSkipReason } from '@/lib/comfy-warm-up';

/** One warm-up per engine per this long — reopening a tool does not send another. */
const WARM_UP_REPEAT_MS = 10 * 60 * 1000;
const lastWarmUpAt = new Map<string, number>();

/**
 * Settings → ComfyUI → "Warm up the engine when I open a tool" (off by default): when Day, Story
 * or Outfit opens on an idle ComfyUI, load the tool's engine with a tiny copy of the app's last
 * still on it (comfy-warm-up.ts) so the first real still does not pay for the model load. The
 * server skips a busy queue, the model that ran last, and too little free VRAM.
 */
export function useEngineWarmUp(input: { mounted: boolean; model: string | undefined }): void {
  const { mounted, model } = input;
  useEffect(() => {
    const picked = model?.trim();
    if (!mounted || !picked) return;
    const settings = loadComfyUiSettings();
    if (settings.warmUpOnToolOpen !== true) return;
    const now = Date.now();
    if (now - (lastWarmUpAt.get(picked) ?? 0) < WARM_UP_REPEAT_MS) return;
    lastWarmUpAt.set(picked, now);
    // The ids this engine's stills are queued under (plate edits, adult nude hand-off).
    const models = [
      ...new Set([
        picked,
        resolveModelForQueueTool(picked, 'image-prompt'),
        resolveAdultNudePlateQueueModel(picked, { adultNude: false }),
        resolveAdultNudePlateQueueModel(picked, { adultNude: true }),
      ]),
    ];
    const label = getComfyModelDefinition(picked)?.label ?? picked;
    const comfyUrl = settings.apiUrl?.trim() || undefined;
    void (async () => {
      try {
        const response = await fetch('/api/comfyui/warm-up', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ models, ...(comfyUrl ? { comfyUrl } : {}) }),
        });
        if (!response.ok) return;
        const result = (await response.json()) as {
          queued?: boolean;
          reason?: WarmUpSkipReason;
        };
        if (result.queued) {
          pushSystemTrayMessage({ text: `Warming up ${label}…`, tone: 'info', ttlMs: 8000 });
        } else if (result.reason) {
          console.info(warmUpSkipLine(result.reason, label));
        }
      } catch {
        // best-effort
      }
    })();
  }, [model, mounted]);
}
