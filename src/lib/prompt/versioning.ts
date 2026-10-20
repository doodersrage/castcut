import { workflowContentHash } from '../workflow/content-hash';

export type PromptVersionParent = {
  id: string;
  promptVersion?: number;
  versionRootId?: string;
};

export type PromptVersionFields = {
  promptVersion: number;
  promptContentHash: string;
  versionRootId: string;
};

/** Stable hash of prompt + model + sorted LoRA ids for version lineage. */
export function computePromptContentHash(input: {
  prompt: string;
  model: string;
  loraIds?: string[] | null;
}): string {
  const loras = [...(input.loraIds ?? [])]
    .map(id => id.trim())
    .filter(Boolean)
    .sort();
  const payload = JSON.stringify({
    prompt: input.prompt.trim(),
    model: input.model.trim(),
    loras,
  });
  return workflowContentHash(payload);
}

/**
 * When parentHistoryId is set, inherit versionRootId and increment version;
 * otherwise start version 1 at a new root (newEntryId).
 */
export function nextPromptVersionFields(input: {
  contentHash: string;
  parent?: PromptVersionParent | null;
  newEntryId: string;
}): PromptVersionFields {
  const parent = input.parent;
  if (parent?.id) {
    return {
      promptVersion: Math.max(1, (parent.promptVersion ?? 1) + 1),
      promptContentHash: input.contentHash,
      versionRootId: parent.versionRootId?.trim() || parent.id,
    };
  }
  return {
    promptVersion: 1,
    promptContentHash: input.contentHash,
    versionRootId: input.newEntryId,
  };
}

export function formatPromptVersionLabel(promptVersion: number | undefined): string | null {
  if (promptVersion == null || !Number.isFinite(promptVersion) || promptVersion < 1) {
    return null;
  }
  return `v${Math.floor(promptVersion)}`;
}
