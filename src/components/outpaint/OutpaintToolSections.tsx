'use client';

import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import OutpaintInputSection from '@/components/outpaint/OutpaintInputSection';
import OutpaintResultSection from '@/components/outpaint/OutpaintResultSection';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import type { useOutpaintToolOrchestration } from '@/hooks/useOutpaintToolOrchestration';

const ACCENT = 'amber' as const;

type Props = ReturnType<typeof useOutpaintToolOrchestration> & { description: string };

export default function OutpaintToolSections({ description, ...vm }: Props) {
  const { shared, selectedModel, updateShared } = vm;

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Outpaint · {selectedModel.comfyNode}</ToolBadge>}
      title="Outpaint / expand"
      description={description}
      sidebarPersistKey="outpaint"
      sidebar={
        <SharedToolControls
          toolId="outpaint"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={vm.intent}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.outpaint} />
      <OutpaintInputSection {...vm} />
      <OutpaintResultSection {...vm} />
    </ToolLayout>
  );
}
