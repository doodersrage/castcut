'use client';

import QueueParamsPanel from '@/components/QueueParamsPanel';
import { ToolSection } from '@/components/ui/ToolPageShell';

export default function SettingsQueueParamsPanel() {
  return (
    <ToolSection
      id="settings-comfyui-queue-params"
      title="Global overrides (all tools)"
      description="Seed, size, CFG and steps forced onto every queue. For one tool, use its Engine (Quality → Custom) instead."
    >
      <QueueParamsPanel />
    </ToolSection>
  );
}
