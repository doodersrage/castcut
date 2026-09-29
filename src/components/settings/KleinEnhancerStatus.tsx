'use client';

import { useEffect, useState } from 'react';
import { fetchComfyObjectInfoNodeTypesCached } from '@/lib/comfyui-object-info-cache';
import {
  kleinColorAnchorAvailable,
  kleinEnhancerPackAvailable,
  kleinMultiReferenceAvailable,
  kleinTextEnhancerAvailable,
} from '@/lib/klein-enhancer-workflow-patch';

/** undefined = still asking ComfyUI; null = ComfyUI didn't answer. */
export type KleinEnhancerNodes = Set<string> | null | undefined;

/** ComfyUI's node classes, for showing whether the Klein Enhancer pack is installed. */
export function useKleinEnhancerNodes(): KleinEnhancerNodes {
  const [nodes, setNodes] = useState<KleinEnhancerNodes>(undefined);
  useEffect(() => {
    let cancelled = false;
    void fetchComfyObjectInfoNodeTypesCached()
      .then(types => {
        if (!cancelled) setNodes(types && types.size > 0 ? types : null);
      })
      .catch(() => {
        if (!cancelled) setNodes(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return nodes;
}

/** Whether any Klein Enhancer node is in ComfyUI — false only once ComfyUI has answered. */
export function kleinEnhancerInstalled(nodes: KleinEnhancerNodes): boolean | null {
  if (!nodes) return null;
  return (
    kleinMultiReferenceAvailable(nodes) ||
    kleinTextEnhancerAvailable(nodes) ||
    kleinColorAnchorAvailable(nodes)
  );
}

/** "Installed ✓ — …" or "Not found in ComfyUI", under the Klein Enhancer switch. */
export default function KleinEnhancerStatus({ nodes }: { nodes: KleinEnhancerNodes }) {
  const installed = kleinEnhancerInstalled(nodes);
  let text: string;
  if (nodes === undefined) {
    text = 'Checking ComfyUI for the pack…';
  } else if (installed === null) {
    text = "ComfyUI didn't answer — can't check for the pack yet.";
  } else if (!installed) {
    text = 'Not found in ComfyUI — install the pack, or this switch does nothing.';
  } else {
    const found = [
      kleinEnhancerPackAvailable(nodes) ? 'Multi ReferenceLatent + Identity Transfer' : null,
      !kleinEnhancerPackAvailable(nodes) && kleinMultiReferenceAvailable(nodes)
        ? 'Multi ReferenceLatent'
        : null,
      kleinTextEnhancerAvailable(nodes) ? 'Text Enhancer' : null,
      kleinColorAnchorAvailable(nodes) ? 'Color Anchor' : null,
    ].filter(Boolean);
    text = `Installed ✓ — ${found.join(', ')}.`;
  }
  return (
    <span
      className={`type-caption mt-1 block ${installed ? 'text-[var(--text-secondary)]' : 'text-[var(--tint-warning-text,var(--text-muted))]'}`}
      data-testid="settings-klein-enhancer-status"
    >
      {text}
    </span>
  );
}
