'use client';

import { loadComfyUiSettings, saveComfyUiSettings } from '@/lib/comfyui-settings';
import {
  applyLoraScanResults,
  loraEntriesNeedingScan,
  type LoraScanRow,
} from '@/lib/lora-library-tools';

/** Ask the server what each LoRA file was trained for. */
export async function fetchLoraScanRows(
  filenames: string[],
  comfyUrl?: string
): Promise<LoraScanRow[]> {
  if (filenames.length === 0) return [];
  const response = await fetch('/api/comfyui/lora-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ filenames, ...(comfyUrl?.trim() ? { comfyUrl: comfyUrl.trim() } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    results?: LoraScanRow[];
    error?: string;
  };
  if (!response.ok || !Array.isArray(data.results)) {
    throw new Error(data.error ?? `LoRA scan failed (HTTP ${response.status}).`);
  }
  return data.results;
}

let sessionScanDone = false;

/**
 * Once per page session: scan library LoRAs the app hasn't identified yet and save their
 * families. Resolves the number of entries that changed.
 */
export async function scanUnscannedLorasOnce(): Promise<number> {
  if (sessionScanDone) return 0;
  sessionScanDone = true;
  const settings = loadComfyUiSettings();
  const targets = loraEntriesNeedingScan(settings.loraLibrary ?? []);
  if (targets.length === 0) return 0;
  const rows = await fetchLoraScanRows(
    targets.map(entry => entry.tokenValue.trim()),
    settings.apiUrl
  );
  // Re-read: the library may have changed while the scan ran.
  const latest = loadComfyUiSettings();
  const merged = applyLoraScanResults(latest.loraLibrary ?? [], rows);
  if (merged.changed > 0) {
    saveComfyUiSettings({ ...latest, loraLibrary: merged.library });
  }
  return merged.changed;
}
