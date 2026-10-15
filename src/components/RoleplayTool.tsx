'use client';

import { useRoleplayToolOrchestration } from '@/hooks/useRoleplayToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import RoleplayToolSections from '@/components/roleplay/RoleplayToolSections';

export default function RoleplayTool() {
  const description = useToolPageDescription(
    'Carry the story on, one scene at a time.',
    'Carry the story on, one scene at a time.'
  );
  const vm = useRoleplayToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <RoleplayToolSections description={description} {...vm} />;
}
