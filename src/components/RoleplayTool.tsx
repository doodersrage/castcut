'use client';

import { useRoleplayToolOrchestration } from '@/hooks/useRoleplayToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import RoleplayToolSections from '@/components/roleplay/RoleplayToolSections';

export default function RoleplayTool() {
  const description = useToolPageDescription(
    'Continue your Cast lead with story beats — stills and clips, then Cut film. Part and From photo live on Film / Cast.',
    'Continue this Cast character — write a bio, tap a scene, Cut film.'
  );
  const vm = useRoleplayToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <RoleplayToolSections description={description} {...vm} />;
}
