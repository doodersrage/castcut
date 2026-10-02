'use client';

import type { ComfyWorkflowLibraryViewModel } from '@/hooks/useComfyWorkflowLibrary';
import { ComfyWorkflowLibraryToolbarSection } from '@/components/comfy-workflow/sections/ComfyWorkflowLibraryToolbarSection';
import { ComfyWorkflowLibraryListSection } from '@/components/comfy-workflow/sections/ComfyWorkflowLibraryListSection';
import { ComfyWorkflowLibraryPacksSection } from '@/components/comfy-workflow/sections/ComfyWorkflowLibraryPacksSection';

export default function ComfyWorkflowLibrarySections(props: ComfyWorkflowLibraryViewModel) {
  return (
    <section className="ui-meta-panel space-y-4">
      <div className="space-y-1">
        <h2 className="type-heading">ComfyUI workflow library</h2>
        <p className="type-caption">
          Manage multiple ComfyUI API workflow JSON files. Pick the active file from the dropdown
          next to <strong className="font-medium text-[var(--text-secondary)]">Queue</strong> on any
          result panel. URL, tokens, and queue params still come from the connection settings below
          (or server env).
        </p>
      </div>

      <ComfyWorkflowLibraryToolbarSection {...props} />
      <ComfyWorkflowLibraryListSection {...props} />
      <ComfyWorkflowLibraryPacksSection {...props} />
    </section>
  );
}
