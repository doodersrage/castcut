import type { PromptSidecar } from './prompt-sidecar';
import { buildPromptSidecar } from './prompt-sidecar';
import { extractParamsFromWorkflow } from './workflow-param-extract';
import type { WorkflowParamValues } from './comfyui-config';

export type PngMetadataResult = {
  positive?: string;
  negative?: string;
  seed?: string;
  workflowJson?: string;
  queueParams?: WorkflowParamValues;
  rawParameters?: string;
  source: 'comfyui' | 'a1111' | 'unknown';
};

function readAscii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }
  return text;
}

export function parseTextChunks(buffer: ArrayBuffer): Record<string, string> {
  const view = new DataView(buffer);
  const chunks: Record<string, string> = {};

  if (view.getUint32(0) !== 0x89504e47) {
    return chunks;
  }

  let offset = 8;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset);
    const type = readAscii(view, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > buffer.byteLength) {
      break;
    }

    if (type === 'tEXt') {
      const raw = readAscii(view, dataStart, length);
      const separator = raw.indexOf('\0');
      if (separator >= 0) {
        const key = raw.slice(0, separator);
        chunks[key] = raw.slice(separator + 1);
      }
    } else if (type === 'iTXt') {
      const rawBytes = new Uint8Array(buffer, dataStart, length);
      let cursor = 0;
      while (cursor < rawBytes.length && rawBytes[cursor] !== 0) {
        cursor += 1;
      }
      const key = new TextDecoder().decode(rawBytes.slice(0, cursor));
      cursor += 1;
      const compression = rawBytes[cursor];
      cursor += 1;
      while (cursor < rawBytes.length && rawBytes[cursor] !== 0) {
        cursor += 1;
      }
      cursor += 1;
      while (cursor < rawBytes.length && rawBytes[cursor] !== 0) {
        cursor += 1;
      }
      cursor += 1;
      const valueBytes = rawBytes.slice(cursor);
      const value =
        compression === 0
          ? new TextDecoder().decode(valueBytes)
          : new TextDecoder().decode(valueBytes);
      if (key) {
        chunks[key] = value;
      }
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  return chunks;
}

function parseA1111Parameters(
  raw: string
): Pick<PngMetadataResult, 'positive' | 'negative' | 'seed'> {
  const parts = raw.split('\nNegative prompt:');
  const positiveBlock = parts[0]?.trim() ?? '';
  const negativeBlock = parts[1]?.split('\nSteps:')[0]?.trim();

  const positive = positiveBlock.replace(/^Parameters:\s*/i, '').trim() || undefined;
  const negative = negativeBlock?.trim() || undefined;

  const seedMatch = raw.match(/\bSeed:\s*(\d+)/i);
  return {
    positive,
    negative,
    seed: seedMatch?.[1],
  };
}

function tryParseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  const trimmed = raw?.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function extractTextsFromWorkflow(workflow: Record<string, unknown>): {
  positive?: string;
  negative?: string;
} {
  const texts: string[] = [];
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const text = (node as { inputs?: { text?: unknown } }).inputs?.text;
    if (typeof text === 'string' && text.trim()) {
      texts.push(text.trim());
    }
  }
  return { positive: texts[0], negative: texts[1] };
}

/**
 * Prefer Comfy `workflow` / API `prompt` JSON graphs over treating JSON as A1111
 * parameters text.
 */
export function parsePngMetadata(buffer: ArrayBuffer): PngMetadataResult | null {
  const chunks = parseTextChunks(buffer);

  const workflowChunk =
    chunks.workflow ?? chunks.Workflow ?? chunks.prompt_json ?? chunks['comfyui-workflow'];
  const promptChunk = chunks.prompt ?? chunks.Prompt;

  const workflowFromWorkflow = tryParseJsonObject(workflowChunk);
  const workflowFromPrompt = tryParseJsonObject(promptChunk);
  const workflow = workflowFromWorkflow ?? workflowFromPrompt;

  const a1111Raw =
    chunks.parameters ??
    chunks.Parameters ??
    (!workflowFromPrompt && typeof promptChunk === 'string' ? promptChunk : undefined) ??
    chunks.description;

  if (!workflow && !a1111Raw) {
    return null;
  }

  if (workflow) {
    const texts = extractTextsFromWorkflow(workflow);
    const queueParams = extractParamsFromWorkflow(workflow);
    const a1111 =
      a1111Raw && a1111Raw.includes('Negative prompt:') ? parseA1111Parameters(a1111Raw) : {};
    return {
      positive: texts.positive ?? a1111.positive,
      negative: texts.negative ?? a1111.negative,
      seed: queueParams.seed != null ? String(queueParams.seed) : a1111.seed,
      workflowJson: JSON.stringify(workflow),
      queueParams: Object.keys(queueParams).length > 0 ? queueParams : undefined,
      rawParameters: a1111Raw,
      source: 'comfyui',
    };
  }

  const parsed = a1111Raw ? parseA1111Parameters(a1111Raw) : {};
  return {
    positive: parsed.positive,
    negative: parsed.negative,
    seed: parsed.seed,
    rawParameters: a1111Raw,
    source: a1111Raw?.includes('Negative prompt:') ? 'a1111' : 'unknown',
  };
}

export async function readPngMetadataFile(file: File): Promise<PngMetadataResult> {
  const buffer = await file.arrayBuffer();
  const parsed = parsePngMetadata(buffer);
  if (!parsed) {
    throw new Error('No ComfyUI or A1111 metadata found in this PNG.');
  }
  return parsed;
}

export function pngMetadataToSidecar(metadata: PngMetadataResult, model?: string): PromptSidecar {
  const positive =
    metadata.positive?.trim() ||
    (metadata.source === 'comfyui' ? 'Imported ComfyUI output' : 'Imported PNG prompt');

  const queueParams: WorkflowParamValues = {
    ...(metadata.queueParams ?? {}),
    ...(metadata.seed && !metadata.queueParams?.seed ? { seed: metadata.seed } : {}),
  };

  return buildPromptSidecar({
    positive,
    negative: metadata.negative,
    model: model ?? 'n/a',
    tool: metadata.source === 'comfyui' ? 'comfyui-import' : 'png-import',
    hints: metadata.rawParameters?.slice(0, 500),
    variationSeed: metadata.seed,
    metadata: {
      ...(metadata.workflowJson ? { workflowJson: metadata.workflowJson } : {}),
      ...(Object.keys(queueParams).length > 0 ? { queueParams } : {}),
    },
  });
}
