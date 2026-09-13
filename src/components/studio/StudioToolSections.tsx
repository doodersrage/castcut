'use client';

import { ToolBadge, ToolLayout, ToolMetaPanel } from '@/components/ui/ToolPageShell';
import { ChipButton } from '@/components/ui/Field';
import { StudioTabSkeleton } from '@/components/ui/ViewState';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import type { useStudioToolOrchestration } from '@/hooks/useStudioToolOrchestration';
import { StudioToolTabPanels } from '@/components/studio/sections/StudioToolTabPanels';

const ACCENT = 'brand' as const;

type StudioToolViewModel = ReturnType<typeof useStudioToolOrchestration>;

type StudioToolSectionsProps = StudioToolViewModel & { description: string };

export default function StudioToolSections({ description, ...vm }: StudioToolSectionsProps) {
  const { mounted, isNullContext, tabGroups, tab, selectStudioTab } = vm;

  if (!mounted) {
    return (
      <ToolLayout
        accent={ACCENT}
        width="wide"
        badge={<ToolBadge accent={ACCENT}>Studio</ToolBadge>}
        title="Castcut"
        description={description}
      >
        <StudioTabSkeleton />
      </ToolLayout>
    );
  }

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Studio</ToolBadge>}
      title="Castcut"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.studio} />
      {isNullContext ? null : (
        <div className="flex h-full flex-col gap-4">
          <ToolMetaPanel title="Studio views" className="overflow-x-auto">
            <div className="flex min-w-max flex-wrap items-start gap-x-8 gap-y-5">
              {tabGroups.map(group => (
                <div key={group.label} className="space-y-2.5">
                  <p className="type-overline text-[var(--text-muted)]">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.tabs.map(entry => (
                      <ChipButton
                        key={entry.id}
                        active={tab === entry.id}
                        onClick={() => selectStudioTab(entry.id)}
                      >
                        {entry.label}
                      </ChipButton>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ToolMetaPanel>

          <StudioToolTabPanels {...vm} />
        </div>
      )}
    </ToolLayout>
  );
}
