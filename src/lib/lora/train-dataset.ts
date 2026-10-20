/**
 * Persist LoRA training image+caption pairs under PROMPT_DATA_DIR for kohya.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptDataDir } from '../prompt/data-paths';
import { kohyaDatasetBucketName } from './train-templates';

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

export type LoraDatasetPersistFile = {
  /** Image filename only (no directories), e.g. 0001_slug.png */
  filename: string;
  caption: string;
  /** Raw image bytes (base64) */
  imageBase64: string;
};

export type PersistLoraDatasetInput = {
  files: LoraDatasetPersistFile[];
  trigger?: string;
  characterId?: string;
  lookId?: string;
  /** Optional stable id; otherwise generated. */
  datasetId?: string;
};

export type PersistLoraDatasetResult = {
  datasetId: string;
  /** Absolute path to kohya train_data_dir (parent of the repeats bucket). */
  datasetPath: string;
  count: number;
  bucketName: string;
};

function assertSafeFilename(filename: string): string {
  const base = path.basename(filename.trim());
  if (!base || base.includes('\0') || base.includes('..')) {
    throw new Error(`Invalid dataset filename: ${filename}`);
  }
  if (!/^[A-Za-z0-9._-]{1,120}\.[A-Za-z0-9]{2,5}$/.test(base)) {
    throw new Error(`Invalid dataset filename: ${filename}`);
  }
  return base;
}

function sanitizeDatasetId(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (trimmed && SAFE_SEGMENT.test(trimmed)) {
    return trimmed;
  }
  return `ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function datasetsRoot(): string {
  return path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), 'lora-datasets');
}

/**
 * Write image/caption pairs into
 * `{PROMPT_DATA_DIR}/lora-datasets/{id}/{repeats}_{trigger}/`.
 */
export function persistLoraDatasetFiles(input: PersistLoraDatasetInput): PersistLoraDatasetResult {
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new Error('Include at least one image/caption pair.');
  }

  const datasetId = sanitizeDatasetId(input.datasetId);
  const bucketName = kohyaDatasetBucketName(input.trigger ?? 'subject');
  const root = path.join(/* turbopackIgnore: true */ datasetsRoot(), datasetId);
  const bucketDir = path.join(/* turbopackIgnore: true */ root, bucketName);
  fs.mkdirSync(/* turbopackIgnore: true */ bucketDir, { recursive: true });

  let count = 0;
  const manifestEntries: Array<{
    imageFilename: string;
    captionFilename: string;
    caption: string;
  }> = [];

  for (const file of input.files) {
    const filename = assertSafeFilename(file.filename);
    const caption = typeof file.caption === 'string' ? file.caption.trim() : '';
    const b64 = typeof file.imageBase64 === 'string' ? file.imageBase64.trim() : '';
    if (!b64) {
      continue;
    }
    const comma = b64.indexOf(',');
    const payload = b64.startsWith('data:') && comma >= 0 ? b64.slice(comma + 1) : b64;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(payload, 'base64');
    } catch {
      continue;
    }
    if (buffer.length === 0) {
      continue;
    }

    const stem = filename.replace(/\.[^.]+$/, '');
    const captionFilename = `${stem}.txt`;
    fs.writeFileSync(path.join(/* turbopackIgnore: true */ bucketDir, filename), buffer);
    fs.writeFileSync(
      path.join(/* turbopackIgnore: true */ bucketDir, captionFilename),
      caption,
      'utf8'
    );
    manifestEntries.push({ imageFilename: filename, captionFilename, caption });
    count += 1;
  }

  if (count === 0) {
    throw new Error('No valid image bytes in dataset export.');
  }

  fs.writeFileSync(
    path.join(/* turbopackIgnore: true */ root, 'manifest.json'),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        datasetId,
        trigger: input.trigger?.trim() || undefined,
        characterId: input.characterId?.trim() || undefined,
        lookId: input.lookId?.trim() || undefined,
        bucketName,
        count,
        entries: manifestEntries,
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    datasetId,
    datasetPath: root,
    count,
    bucketName,
  };
}

/** Absolute output dir for a train job's kohya weights. */
export function loraTrainOutputDir(jobId: string): string {
  const safe =
    jobId
      .trim()
      .replace(/[^A-Za-z0-9._-]/g, '')
      .slice(0, 80) || 'job';
  const dir = path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), 'lora-output', safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
