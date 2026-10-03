'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CASTCUT_NODE_TYPES } from '@/lib/castcut-nodes';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';

/**
 * One line pointing at Settings → ComfyUI → Castcut nodes when ComfyUI lacks the pack (from the
 * cached object_info — no extra request when it is already loaded). Renders nothing when the pack
 * is there or ComfyUI could not be read.
 */
export default function CastcutNodesHint({
  children,
  className = '',
  testId = 'castcut-nodes-hint',
}: {
  /** What the pack would change here, e.g. "Best of two runs as two jobs". */
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { fetchComfyObjectInfoNodeTypesCached } =
          await import('@/lib/comfyui-object-info-cache');
        const nodeTypes = await fetchComfyObjectInfoNodeTypesCached();
        if (!cancelled && nodeTypes && nodeTypes.size > 0) {
          setMissing(!CASTCUT_NODE_TYPES.every(type => nodeTypes.has(type)));
        }
      } catch {
        // no hint without object_info
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!missing) return null;
  return (
    <p className={`type-caption text-[var(--text-muted)] ${className}`.trim()} data-testid={testId}>
      {children}{' '}
      <Link href={settingsComfyUiSectionHref('castcut-nodes')} className="ui-text-link">
        Install Castcut nodes →
      </Link>
    </p>
  );
}
