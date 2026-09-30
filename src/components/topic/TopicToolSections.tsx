'use client';

import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import TopicToolInputSection, { TopicToolSidebar } from '@/components/topic/TopicToolInputSection';
import TopicToolResultsSection from '@/components/topic/TopicToolResultsSection';
import type { useTopicToolOrchestration } from '@/hooks/useTopicToolOrchestration';

const ACCENT = 'brand' as const;

type Props = ReturnType<typeof useTopicToolOrchestration> & { description: string };

export default function TopicToolSections({ description, ...vm }: Props) {
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>More tools</ToolBadge>}
      title="Topics"
      description={description}
      sidebarPersistKey="topics"
      sidebar={<TopicToolSidebar {...vm} />}
    >
      <TopicToolInputSection {...vm} />
      <TopicToolResultsSection {...vm} />
    </ToolLayout>
  );
}
