'use client';

import { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import MoodboardToolSections from '@/components/moodboard/MoodboardToolSections';

export default function MoodboardTool() {
  const description = useToolPageDescription(
    'Add reference tiles, extract a look for Outfit / Day, or queue one scene still.',
    'Look → extract for Outfit / Day, or queue a still.'
  );
  const vm = useMoodboardToolOrchestration();
  if (!vm.mounted) return null;
  return <MoodboardToolSections description={description} {...vm} />;
}
