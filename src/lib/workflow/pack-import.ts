import { prepareWorkflowJsonImport, type WorkflowImportResult } from './import';
import {
  upsertComfyWorkflowFile,
  workflowFileNameFromPath,
  type ComfyWorkflowFile,
} from '../comfyui/workflow-files';
import { inferModelsFromWorkflowLabel } from './category-defaults';
import { assignWorkflowToInferredModels } from '../model-workflow-map';
import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from '../settings-cache';
import {
  inferWorkflowGraphKind,
  mergeInferredModels,
  suggestMediaCustomTokens,
  type WorkflowGraphKind,
} from './graph-kind';
import { isWorkflowJsonFileName, isZipFileName, readZipTextEntries } from '../zip-read';
import type { ComfyImageModel } from '../comfy-models/client';
import type { WorkflowPlaceholderTokens } from '../comfyui/config';

export type PackImportSource = {
  name: string;
  raw: string;
};

export type PackImportFileResult = {
  filename: string;
  ok: boolean;
  error?: string;
  errorDetail?: string;
  notice?: string;
  workflow?: ComfyWorkflowFile;
  kind: WorkflowGraphKind;
  inferredModels: ComfyImageModel[];
  mappedModels: ComfyImageModel[];
};

export type PackImportResult = {
  imported: PackImportFileResult[];
  created: number;
  failed: number;
  mappedModelCount: number;
  sharedPatch?: Partial<SharedToolSettings>;
  summary: string;
};

export type ImportComfyWorkflowPackOptions = {
  tokens?: WorkflowPlaceholderTokens;
  /** When true (default), assign workflow → inferred models if unmapped. */
  autoMapModels?: boolean;
  /** Overwrite existing model→workflow map entries. */
  overwriteMap?: boolean;
  /** Prefer selecting the first successful import in the picker. */
  selectFirst?: boolean;
};

async function expandImportSources(
  files: Array<{ name: string; text?: string; buffer?: ArrayBuffer }>
): Promise<PackImportSource[]> {
  const sources: PackImportSource[] = [];

  for (const file of files) {
    if (isZipFileName(file.name) && file.buffer) {
      const entries = await readZipTextEntries(file.buffer);
      for (const entry of entries) {
        if (!isWorkflowJsonFileName(entry.filename)) {
          continue;
        }
        sources.push({ name: entry.filename, raw: entry.text });
      }
      continue;
    }

    if (file.text != null && isWorkflowJsonFileName(file.name)) {
      sources.push({ name: file.name, raw: file.text });
    }
  }

  return sources;
}

/**
 * Import one or more ComfyUI API workflow JSON files (or a .zip pack of them).
 * Auto-binds placeholders, attaches media custom tokens, and optionally maps
 * models from filename + graph class_types.
 */
export async function importComfyWorkflowPack(
  files: Array<{ name: string; text?: string; buffer?: ArrayBuffer }>,
  options?: ImportComfyWorkflowPackOptions
): Promise<PackImportResult> {
  const sources = await expandImportSources(files);
  const imported: PackImportFileResult[] = [];
  let created = 0;
  let failed = 0;
  let mappedModelCount = 0;
  let sharedPatch: Partial<SharedToolSettings> | undefined;
  const autoMap = options?.autoMapModels !== false;

  let shared = loadSettingsCache().shared;
  let firstId: string | undefined;

  for (const source of sources) {
    const prepared: WorkflowImportResult = prepareWorkflowJsonImport(source.raw, options?.tokens, {
      name: source.name,
      filename: source.name,
    });

    if (!prepared.ok || !prepared.workflowJson) {
      failed += 1;
      imported.push({
        filename: source.name,
        ok: false,
        error: prepared.error ?? 'Import failed',
        errorDetail: prepared.errorDetail,
        kind: 'unknown',
        inferredModels: [],
        mappedModels: [],
      });
      continue;
    }

    const kind = inferWorkflowGraphKind(prepared.workflowJson);
    const labelModels = inferModelsFromWorkflowLabel({
      name: workflowFileNameFromPath(source.name),
      filename: source.name,
    });
    const inferredModels = mergeInferredModels(labelModels, kind);
    const customTokens = suggestMediaCustomTokens(prepared.workflowJson);

    const saved = upsertComfyWorkflowFile({
      name: workflowFileNameFromPath(source.name) || `Pack workflow ${Date.now()}`,
      filename: source.name.split('/').pop() ?? source.name,
      workflowJson: prepared.workflowJson,
      customTokens,
      lastOptimizedAt: Date.now(),
      lastOptimizedHash: prepared.contentHash,
      lastOptimizedModel: prepared.optimizeModel,
      lastOptimizedProfile: prepared.optimizeProfile,
    });
    created += 1;
    firstId ??= saved.id;

    let mappedModels: ComfyImageModel[] = [];
    const selectThis = options?.selectFirst !== false && firstId === saved.id;

    if (autoMap && inferredModels.length > 0) {
      const nextMap = assignWorkflowToInferredModels(
        saved.id,
        inferredModels,
        shared.modelWorkflowMap,
        options?.overwriteMap === true
      );
      const newlyMapped = inferredModels.filter(model => nextMap[model] === saved.id);
      mappedModels = newlyMapped;
      mappedModelCount += newlyMapped.length;
      shared = {
        ...shared,
        modelWorkflowMap: nextMap,
        ...(selectThis ? { selectedWorkflowFileId: saved.id } : {}),
      };
      sharedPatch = {
        modelWorkflowMap: nextMap,
        ...(selectThis ? { selectedWorkflowFileId: saved.id } : {}),
      };
    } else if (selectThis) {
      shared = { ...shared, selectedWorkflowFileId: saved.id };
      sharedPatch = {
        ...(sharedPatch ?? {}),
        selectedWorkflowFileId: saved.id,
      };
    }

    imported.push({
      filename: source.name,
      ok: true,
      notice: prepared.notice,
      workflow: saved,
      kind,
      inferredModels,
      mappedModels,
    });
  }

  if (sharedPatch) {
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...sharedPatch,
    });
  }

  const summary = [
    created > 0 ? `Imported ${created} workflow${created === 1 ? '' : 's'}` : null,
    failed > 0 ? `${failed} failed` : null,
    mappedModelCount > 0
      ? `mapped to ${mappedModelCount} model slot${mappedModelCount === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    imported,
    created,
    failed,
    mappedModelCount,
    sharedPatch,
    summary: summary || 'No workflow JSON found in selection.',
  };
}

/** Browser helper: turn a FileList / File[] into pack import inputs. */
export async function filesToPackImportInputs(
  fileList: ArrayLike<File>
): Promise<Array<{ name: string; text?: string; buffer?: ArrayBuffer }>> {
  const files = Array.from(fileList);
  const inputs: Array<{ name: string; text?: string; buffer?: ArrayBuffer }> = [];
  for (const file of files) {
    if (isZipFileName(file.name)) {
      inputs.push({ name: file.name, buffer: await file.arrayBuffer() });
    } else if (isWorkflowJsonFileName(file.name)) {
      inputs.push({ name: file.name, text: await file.text() });
    }
  }
  return inputs;
}
