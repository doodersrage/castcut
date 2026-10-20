export type BatchPromptItem = {
  prompt: string;
  metadata?: Record<string, unknown>;
};

export type BatchPromptItemActions = {
  onQueueComfyUi?: (prompt: string, index: number) => void | Promise<void>;
  onSaveHistory?: (input: {
    prompt: string;
    index: number;
    metadata?: Record<string, unknown>;
  }) => void;
  onCopyPair?: (prompt: string, index: number) => void | Promise<void>;
  onExportSidecar?: (
    prompt: string,
    index: number,
    metadata?: Record<string, unknown>
  ) => void | Promise<void>;
};

export type WorkflowPreviewState = {
  workflowSource?: string;
  replacements?: {
    positive: number;
    negative: number;
    custom?: Record<string, number>;
  };
  resolvedParams?: {
    seed: string;
    width: string;
    height: string;
    cfg: string;
    steps: string;
  };
  snippets?: Array<{ path: string; value: string }>;
  workflowJson?: string;
  truncated?: boolean;
} | null;

export type EnhancedPromptResultProps = {
  output: string;
  provider: 'llm' | 'template' | 'rules' | null;
  comfyNode?: string;
  limits?: {
    minChars?: number;
    maxChars: number;
  };
  copied: boolean;
  onCopy: () => void;
  extraMeta?: string;
  diagnostics?: import('@/lib/generation-diagnostics').GenerationDiagnostics | null;
  onSaveHistory?: () => void;
  onSendComfyUi?: () => void;
  onFixPrompt?: () => void;
  onCopyPair?: () => void;
  onExportBatch?: () => void;
  onQueueBatchComfyUi?: () => void;
  onCompact?: () => void;
  onReformat?: () => void;
  reformatTargetLabel?: string;
  onRunPipeline?: () => void;
  onExportSidecar?: () => void;
  onPreviewWorkflow?: () => void;
  onImprove?: () => void;
  onRefine?: () => void;
  onEditPrompt?: () => void;
  onContinueInpaint?: () => void;
  onContinueOutpaint?: () => void;
  onContinueCompose?: () => void;
  onContinueVideo?: () => void;
  onContinueControlNet?: () => void;
  onQueueSeedBatch?: () => void;
  seedBatchLabel?: string;
  workflowPreview?: WorkflowPreviewState;
  previewStatus?: string | null;
  variationSeed?: string | null;
  onLockSeed?: () => void;
  seedLocked?: boolean;
  fixStatus?: string | null;
  compactStatus?: string | null;
  reformatStatus?: string | null;
  pipelineStatus?: string | null;
  preDiagnostics?: import('@/lib/generation-diagnostics').GenerationDiagnostics | null;
  comfyUiStatus?: string | null;
  comfyUiJob?: import('@/lib/comfyui/job-status').ComfyUiJobTrackerState | null;
  comfyUiPreviewUrl?: string | null;
  historySaved?: boolean;
  pairCopied?: boolean;
  batchOutputs?: string[];
  batchItems?: BatchPromptItem[];
  batchCrossLinks?: import('@/components/ui/BatchPromptCard').BatchPromptCrossLinks;
  batchPromptActions?: BatchPromptItemActions;
  readinessModel?: import('@/lib/comfy-models/client').ComfyImageModel | string;
  readinessDetail?: import('@/lib/detail-level').DetailLevel | string;
  readinessHints?: string;
  negativePrompt?: string;
  readinessMinScore?: number;
  readinessGateEnabled?: boolean;
  showWeightInspector?: boolean;
  onOutputChange?: (value: string) => void;
  rawPrompt?: string;
  compactActions?: boolean;
  onBatchPromptChange?: (index: number, value: string) => void;
};
