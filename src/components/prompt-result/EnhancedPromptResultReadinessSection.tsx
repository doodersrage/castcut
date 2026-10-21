'use client';

import dynamic from 'next/dynamic';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import type { DetailLevel } from '@/lib/prompt/detail-level';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { PanelSkeleton } from '@/components/ui/ViewState';

const ReadinessBadge = dynamic(() => import('@/components/ReadinessBadge'), {
  ssr: false,
  loading: () => null,
});
const PromptWeightInspector = dynamic(() => import('@/components/PromptWeightInspector'), {
  ssr: false,
  loading: () => <PanelSkeleton className="h-40" />,
});

export type EnhancedPromptResultReadinessSectionProps = {
  output: string;
  readinessModel: ComfyImageModel | string;
  readinessDetail: DetailLevel | string;
  readinessHints?: string;
  negativePrompt?: string;
  readinessMinScore: number;
  compactActions: boolean;
  showWeightInspector: boolean;
  onOutputChange?: (value: string) => void;
  onCompact?: () => void;
  onFixPrompt?: () => void;
  onReformat?: () => void;
  onResult: (result: import('@/lib/prompt/readiness').PromptReadinessResult | null) => void;
};

export default function EnhancedPromptResultReadinessSection({
  output,
  readinessModel,
  readinessDetail,
  readinessHints,
  negativePrompt,
  readinessMinScore,
  compactActions,
  showWeightInspector,
  onOutputChange,
  onCompact,
  onFixPrompt,
  onReformat,
  onResult,
}: EnhancedPromptResultReadinessSectionProps) {
  if (!output.trim() || !readinessModel || !readinessDetail) {
    return null;
  }

  const readinessBadge = (
    <ReadinessBadge
      prompt={output}
      model={readinessModel}
      detail={readinessDetail}
      hints={readinessHints}
      negativePrompt={negativePrompt}
      minScore={readinessMinScore}
      onResult={onResult}
      onCompact={onCompact}
      onFixRules={onFixPrompt}
      onReformat={onReformat}
    />
  );

  return (
    <>
      {compactActions ? (
        <CollapsibleSection
          title="Prompt readiness"
          summary="Score, quick fixes, and reformat suggestions."
          defaultOpen={false}
          persistKey="result-readiness-compact"
        >
          {readinessBadge}
        </CollapsibleSection>
      ) : (
        readinessBadge
      )}

      {showWeightInspector && !compactActions ? (
        <PromptWeightInspector
          prompt={output}
          model={readinessModel}
          onChange={onOutputChange}
          textareaId="generated-prompt-editor"
        />
      ) : null}
    </>
  );
}
