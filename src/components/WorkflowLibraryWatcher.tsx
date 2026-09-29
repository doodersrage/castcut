'use client';

import { useEffect } from 'react';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';
import { initBrowserStorage, readBrowserString, writeBrowserString } from '@/lib/browser-storage';
import { loadComfyWorkflowFiles } from '@/lib/comfyui-workflow-files';
import { SETTINGS_CACHE_UPDATED_EVENT, loadSettingsCache } from '@/lib/settings-cache';
import { resolveComfyUiRuntime } from '@/lib/comfyui-runtime';
import { auditWorkflowLibraryHealth } from '@/lib/workflow-health-audit';
import {
  COMFY_MODEL_LIST_FINGERPRINT_KEY,
  WORKFLOW_LIBRARY_WATCH_SEEN_KEY,
  comfyModelListFingerprint,
  workflowLibraryWatchToast,
} from '@/lib/workflow-library-watch';

/** How often to look for a changed ComfyUI model list while the app is open. */
const RECHECK_MS = 10 * 60 * 1000;

async function fetchComfyModelLists(): Promise<Record<string, unknown> | null> {
  const comfyUrl = resolveComfyUiRuntime()?.apiUrl?.trim();
  const params = comfyUrl ? `?comfyUrl=${encodeURIComponent(comfyUrl)}` : '';
  try {
    const response = await fetch(`/api/comfyui/object-info${params}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { models?: Record<string, unknown> };
    return data.models ?? null;
  } catch {
    return null;
  }
}

/** Audits the workflow library in the background and toasts new errors (see lib/workflow-library-watch). */
export default function WorkflowLibraryWatcher() {
  useEffect(() => {
    let cancelled = false;

    const check = async (reason: 'startup' | 'poll' | 'map') => {
      const models = await fetchComfyModelLists();
      if (cancelled) return;
      const fingerprint = comfyModelListFingerprint(models);
      const previous = readBrowserString(COMFY_MODEL_LIST_FINGERPRINT_KEY);
      const modelsChanged = Boolean(fingerprint && previous && previous !== fingerprint);
      if (fingerprint) writeBrowserString(COMFY_MODEL_LIST_FINGERPRINT_KEY, fingerprint);
      // On a poll, only a changed model list is worth a new audit.
      if (reason === 'poll' && !modelsChanged) return;
      if (cancelled) return;

      const shared = loadSettingsCache().shared;
      const report = auditWorkflowLibraryHealth({
        workflowFiles: loadComfyWorkflowFiles(),
        modelWorkflowMap: shared.modelWorkflowMap,
        checkpointMap: shared.modelCheckpointMap as Partial<Record<string, string>> | undefined,
      });
      const toast = workflowLibraryWatchToast(
        report,
        readBrowserString(WORKFLOW_LIBRARY_WATCH_SEEN_KEY),
        { modelsChanged }
      );
      if (!toast) return;
      pushSystemTrayMessage({
        text: toast.text,
        tone: 'warning',
        href: '/settings?tab=comfyui&section=workflow-library',
        ttlMs: 0,
      });
      writeBrowserString(WORKFLOW_LIBRARY_WATCH_SEEN_KEY, toast.signature);
    };

    // Settings load from IndexedDB, then merge with the server a few seconds later — auditing
    // before that saw an empty map and never toasted.
    let startTimer: number | undefined;
    void initBrowserStorage().then(() => {
      if (!cancelled) startTimer = window.setTimeout(() => void check('startup'), 8000);
    });
    const timer = window.setInterval(() => void check('poll'), RECHECK_MS);
    // A map edit anywhere (a tool's model picker, a scaffold helper) re-audits, debounced.
    const mapSignature = () => JSON.stringify(loadSettingsCache().shared.modelWorkflowMap ?? {});
    let lastMap: string | null = null;
    let mapTimer: number | undefined;
    const onSettings = () => {
      const next = mapSignature();
      if (lastMap === null) {
        lastMap = next;
        return;
      }
      if (next === lastMap) return;
      lastMap = next;
      window.clearTimeout(mapTimer);
      mapTimer = window.setTimeout(() => void check('map'), 3000);
    };
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(mapTimer);
      window.clearInterval(timer);
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
    };
  }, []);

  return null;
}
