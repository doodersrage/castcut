'use client';

import { useState } from 'react';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import { useComfyModelAssets } from '@/components/settings/comfy-model-assets/useComfyModelAssets';
import ModelDownloadsView from './ModelDownloadsView';
import ModelFilesView from './ModelFilesView';

type Tab = 'disk' | 'get';

/** Settings → Models: what's on disk (size, use, delete) and what to download, per engine. */
export default function ModelsManager({
  onStatus,
  onInstalled,
}: {
  onStatus?: (message: string) => void;
  onInstalled?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('disk');
  const vm = useComfyModelAssets({ onStatus, onInstalled });
  const active = vm.activeQueueCount;
  return (
    <div className="space-y-3">
      <SegmentedControl<Tab>
        aria-label="Models view"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'disk', label: 'On disk' },
          { value: 'get', label: active ? `Get models (${active} downloading)` : 'Get models' },
        ]}
      />
      {tab === 'disk' ? (
        <ModelFilesView
          catalogRows={vm.rows}
          onStatus={onStatus}
          onChanged={() => void vm.load(true)}
        />
      ) : (
        <ModelDownloadsView vm={vm} />
      )}
    </div>
  );
}
