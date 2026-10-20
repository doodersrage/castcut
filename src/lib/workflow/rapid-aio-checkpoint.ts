import { isQwenRapidAioModel } from '../model-denoise-defaults';
import { DEFAULT_CHECKPOINT_TOKEN, SUGGESTED_MODEL_CHECKPOINT_MAP } from '../model-checkpoint-map';
import { isLoraLoaderClassType, loraFilenameImpliesLightning } from './lora-patch';

type WorkflowNodeRecord = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

function getLinkedNodeId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }
  const id = value[0];
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function getLinkedSlot(value: unknown): number {
  if (!Array.isArray(value) || value.length < 2) {
    return 0;
  }
  const slot = Number(value[1]);
  return Number.isFinite(slot) ? slot : 0;
}

function rewireConsumersTo(
  graph: Record<string, unknown>,
  nodeId: string,
  replacement: unknown
): void {
  for (const [consumerId, node] of Object.entries(graph)) {
    if (consumerId === nodeId || !node || typeof node !== 'object') {
      continue;
    }
    const consumer = node as WorkflowNodeRecord;
    if (!consumer.inputs) {
      continue;
    }
    for (const [key, value] of Object.entries(consumer.inputs)) {
      if (getLinkedNodeId(value) === nodeId) {
        consumer.inputs[key] = replacement;
      }
    }
  }
}

function bypassLoraNode(
  graph: Record<string, unknown>,
  nodeId: string,
  record: WorkflowNodeRecord
): void {
  const modelUpstream = record.inputs?.model;
  const clipUpstream = record.inputs?.clip;

  for (const [consumerId, node] of Object.entries(graph)) {
    if (consumerId === nodeId || !node || typeof node !== 'object') {
      continue;
    }
    const consumer = node as WorkflowNodeRecord;
    if (!consumer.inputs) {
      continue;
    }
    for (const [key, value] of Object.entries(consumer.inputs)) {
      if (getLinkedNodeId(value) !== nodeId) {
        continue;
      }
      const slot = getLinkedSlot(value);
      if (slot === 1 && clipUpstream !== undefined) {
        consumer.inputs[key] = clipUpstream;
      } else if (modelUpstream !== undefined) {
        consumer.inputs[key] = modelUpstream;
      }
    }
  }

  delete graph[nodeId];
}

function graphHasCheckpointLoader(graph: Record<string, unknown>): boolean {
  return Object.values(graph).some(node => {
    if (!node || typeof node !== 'object') {
      return false;
    }
    const classType = (node as WorkflowNodeRecord).class_type ?? '';
    return classType === 'CheckpointLoaderSimple' || classType === 'CheckpointLoader';
  });
}

/**
 * Rapid AIO merges are single-file checkpoints. Convert leftover UNET+CLIP+VAE
 * (and baked Lightning LoRA) graphs so queue does not leave {{UNET}} unresolved.
 */
export function rewriteQwenRapidAioUnetGraphToCheckpoint(
  workflow: Record<string, unknown>,
  checkpointName?: string
): { workflow: Record<string, unknown>; rewritten: number } {
  const ckpt = checkpointName?.trim() || DEFAULT_CHECKPOINT_TOKEN;
  if (graphHasCheckpointLoader(workflow)) {
    // Already checkpoint-shaped — only strip Lightning LoRAs baked into Rapid AIO.
    let rewritten = 0;
    for (const [nodeId, node] of Object.entries(workflow)) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      const record = node as WorkflowNodeRecord;
      if (!record.inputs || !isLoraLoaderClassType(record.class_type)) {
        continue;
      }
      const filename = typeof record.inputs.lora_name === 'string' ? record.inputs.lora_name : '';
      const isLightningToken = /\{\{LORA_LIGHTNING\}\}/i.test(filename);
      if (isLightningToken || loraFilenameImpliesLightning(filename)) {
        bypassLoraNode(workflow, nodeId, record);
        rewritten += 1;
      }
    }
    return { workflow, rewritten };
  }

  const unetIds: string[] = [];
  const clipIds: string[] = [];
  const vaeIds: string[] = [];

  for (const [id, node] of Object.entries(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const classType = (node as WorkflowNodeRecord).class_type ?? '';
    if (classType === 'UNETLoader' || classType === 'UnetLoaderGGUF') {
      unetIds.push(id);
    } else if (classType === 'CLIPLoader' || classType === 'DualCLIPLoader') {
      clipIds.push(id);
    } else if (classType === 'VAELoader') {
      vaeIds.push(id);
    }
  }

  if (unetIds.length === 0) {
    return { workflow, rewritten: 0 };
  }

  let rewritten = 0;
  const primaryUnet = unetIds[0]!;

  for (const unetId of unetIds) {
    const node = workflow[unetId] as WorkflowNodeRecord;
    node.class_type = 'CheckpointLoaderSimple';
    node.inputs = { ckpt_name: ckpt };
    node._meta = { ...(node._meta ?? {}), title: 'Load Checkpoint' };
    rewritten += 1;
  }

  for (const clipId of clipIds) {
    rewireConsumersTo(workflow, clipId, [primaryUnet, 1]);
    delete workflow[clipId];
    rewritten += 1;
  }

  for (const vaeId of vaeIds) {
    rewireConsumersTo(workflow, vaeId, [primaryUnet, 2]);
    delete workflow[vaeId];
    rewritten += 1;
  }

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as WorkflowNodeRecord;
    if (!record.inputs || !isLoraLoaderClassType(record.class_type)) {
      continue;
    }
    const filename = typeof record.inputs.lora_name === 'string' ? record.inputs.lora_name : '';
    const isLightningToken = /\{\{LORA_LIGHTNING\}\}/i.test(filename);
    if (isLightningToken || loraFilenameImpliesLightning(filename)) {
      bypassLoraNode(workflow, nodeId, record);
      rewritten += 1;
    }
  }

  return { workflow, rewritten };
}

export function maybeRewriteRapidAioWorkflowLoaders(
  workflow: Record<string, unknown>,
  model: string | undefined,
  checkpointName?: string
): { workflow: Record<string, unknown>; rewritten: number } {
  if (!isQwenRapidAioModel(model)) {
    return { workflow, rewritten: 0 };
  }
  const suggested =
    checkpointName?.trim() ||
    (model ? SUGGESTED_MODEL_CHECKPOINT_MAP[model] : undefined) ||
    DEFAULT_CHECKPOINT_TOKEN;
  return rewriteQwenRapidAioUnetGraphToCheckpoint(workflow, suggested);
}
