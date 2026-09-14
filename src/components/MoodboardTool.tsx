'use client';

import { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import MoodboardToolSections from '@/components/moodboard/MoodboardToolSections';

export default function MoodboardTool() {
  const description = useToolPageDescription(
    'Pick a look preset or stack refs, extract a look for Outfit / Day.',
    'Look presets or tiles → extract for Outfit / Day.'
  );
  const vm = useMoodboardToolOrchestration();
  if (!vm.mounted) return null;
  return <MoodboardToolSections description={description} {...vm} />;
}
