import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { apiError, apiJson } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import {
  createTrainJob,
  normalizeTrainJob,
  registerTrainJobLora,
  type TrainJob,
} from '@/lib/lora/train-job';
import { persistLoraDatasetFiles, loraTrainOutputDir } from '@/lib/lora/train-dataset';
import { installTrainLoraIntoComfy } from '@/lib/lora/train-install';
import {
  getDurableTrainJob,
  listDurableTrainJobs,
  saveDurableTrainJob,
} from '@/lib/lora/train-store';
import {
  buildKohyaTrainArgv,
  getLoraTrainTemplate,
  loraOutputStem,
  normalizeLoraTrainTemplateId,
  parseKohyaTrainProgress,
  type LoraTrainTemplateId,
} from '@/lib/lora/train-templates';
import type { LoraLibraryEntry } from '@/lib/lora/stack';
import { assertSafeHttpUrl } from '@/lib/server/url-safety';

export const runtime = 'nodejs';

// This route can spawn an arbitrary local command (trainerCommand) from request input when
// TRAINER_COMMAND isn't pinned by env — it must be admin-only. It was previously missing from
// API_FEATURE_MAP entirely, which made the shared auth middleware treat it as always-allowed
// for any signed-in account; this local check is a second, redundant gate.
function requireAdmin(request: Request) {
  if (!isAuthEnabled()) {
    return null;
  }
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user?.enabled || user.role !== 'admin') {
    return apiError('Admin sign-in required.', 401);
  }
  return null;
}

type StartBody = {
  action?: 'start';
  trigger?: string;
  outputPath?: string;
  datasetPath?: string;
  baseModel?: string;
  /** From Settings UI; env TRAINER_URL wins when set. */
  trainerUrl?: string;
  /** From Settings UI; env TRAINER_COMMAND wins when set. */
  trainerCommand?: string;
  characterId?: string;
  lookId?: string;
  templateId?: string;
  kohyaScript?: string;
  networkRank?: number;
  maxTrainSteps?: number;
  resolution?: number;
};

type CompleteBody = {
  action: 'complete';
  jobId?: string;
  outputPath?: string;
  trigger?: string;
  progress?: number;
  error?: string;
  /** Current browser LoRA library — registration is pure and returned for the client to persist. */
  library?: LoraLibraryEntry[];
  sessionActiveLoraIds?: string[];
  activateInSession?: boolean;
  label?: string;
};

type ProgressBody = {
  action: 'progress';
  jobId?: string;
  progress?: number;
  status?: TrainJob['status'];
  error?: string;
  outputPath?: string;
};

type ExportDatasetBody = {
  action: 'export-dataset';
  trigger?: string;
  characterId?: string;
  lookId?: string;
  datasetId?: string;
  files?: Array<{ filename?: string; caption?: string; imageBase64?: string }>;
};

type LoraTrainBody = StartBody | CompleteBody | ProgressBody | ExportDatasetBody;

/** Process-local child handles (jobs themselves live in SQLite). */
const childByJobId = new Map<string, ChildProcess>();

function listServerJobs(): TrainJob[] {
  return listDurableTrainJobs();
}

function saveJob(job: TrainJob): TrainJob {
  const normalized = normalizeTrainJob(job)!;
  return saveDurableTrainJob(normalized);
}

function resolveTrainerTargets(body: StartBody): {
  url: string;
  command: string;
  templateId: LoraTrainTemplateId | undefined;
  kohyaScript: string;
} {
  const envUrl = process.env.TRAINER_URL?.trim() ?? '';
  const envCommand = process.env.TRAINER_COMMAND?.trim() ?? '';
  const envKohya = process.env.TRAINER_KOHYA_SCRIPT?.trim() ?? '';
  return {
    url: envUrl || body.trainerUrl?.trim() || '',
    command: envCommand || body.trainerCommand?.trim() || '',
    templateId: normalizeLoraTrainTemplateId(body.templateId),
    kohyaScript: envKohya || body.kohyaScript?.trim() || '',
  };
}

/** Split a command string into argv without invoking a shell. */
function splitCommandArgv(command: string): string[] {
  const matches = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return matches.map(part => {
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return part.slice(1, -1);
    }
    return part;
  });
}

async function postTrainerWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  const safeUrl = assertSafeHttpUrl(url, {
    // Local kohya / sd-scripts runners are almost always on LAN or loopback.
    allowPrivate: true,
  });
  const response = await fetch(safeUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Trainer webhook returned HTTP ${response.status}.`);
  }
}

function attachChildProgress(jobId: string, child: ChildProcess): void {
  const onChunk = (chunk: Buffer | string) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      const progress = parseKohyaTrainProgress(line);
      if (progress == null) {
        continue;
      }
      const current = getDurableTrainJob(jobId);
      if (!current || current.status === 'completed' || current.status === 'error') {
        return;
      }
      if (progress > current.progress) {
        saveJob({ ...current, status: 'running', progress });
      }
    }
  };
  child.stdout?.on('data', onChunk);
  child.stderr?.on('data', onChunk);
}

function spawnArgv(bin: string, args: string[], job: TrainJob): void {
  const child = spawn(bin, args, {
    shell: false,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  childByJobId.set(job.id, child);
  attachChildProgress(job.id, child);

  child.on('error', error => {
    saveJob({
      ...job,
      status: 'error',
      error: error.message || 'Failed to spawn trainer process.',
    });
    childByJobId.delete(job.id);
  });

  child.on('exit', (code, signal) => {
    childByJobId.delete(job.id);
    const current = getDurableTrainJob(job.id);
    if (!current || current.status === 'completed' || current.status === 'error') {
      return;
    }
    if (code === 0) {
      const installed = installTrainLoraIntoComfy(current.outputPath);
      saveJob({
        ...current,
        status: 'completed',
        progress: 1,
        outputPath: installed.filename || current.outputPath,
      });
    } else {
      saveJob({
        ...current,
        status: 'error',
        error: `Trainer exited with code ${code ?? 'null'}${signal ? ` (signal ${signal})` : ''}.`,
      });
    }
  });
}

function spawnTrainerCommand(
  command: string,
  job: TrainJob,
  extras: { datasetPath?: string; baseModel?: string }
): void {
  const argv = splitCommandArgv(command);
  const bin = argv[0];
  if (!bin) {
    throw new Error('Trainer command is empty.');
  }
  const args = [
    ...argv.slice(1),
    ...(extras.datasetPath ? ['--dataset', extras.datasetPath] : []),
    ...(job.outputPath ? ['--output', job.outputPath] : []),
    ...(job.trigger ? ['--trigger', job.trigger] : []),
    ...(extras.baseModel ? ['--base-model', extras.baseModel] : []),
    '--job-id',
    job.id,
  ];
  spawnArgv(bin, args, job);
}

function spawnKohyaTemplate(
  job: TrainJob,
  opts: {
    templateId: LoraTrainTemplateId;
    kohyaScript: string;
    datasetPath: string;
    baseModel: string;
    networkRank?: number;
    maxTrainSteps?: number;
    resolution?: number;
  }
): void {
  const outputDir = loraTrainOutputDir(job.id);
  const outputName = loraOutputStem(job.outputPath || 'lora');
  const argv = buildKohyaTrainArgv(opts.templateId, {
    scriptPath: opts.kohyaScript,
    datasetPath: opts.datasetPath,
    outputDir,
    outputName,
    pretrainedModel: opts.baseModel,
    networkRank: opts.networkRank ?? job.networkRank,
    maxTrainSteps: opts.maxTrainSteps ?? job.maxTrainSteps,
    resolution: opts.resolution ?? job.resolution,
    trigger: job.trigger,
  });
  const script = argv[0]!;
  const isPythonScript = /\.py$/i.test(script);
  const bin = isPythonScript
    ? process.env.TRAINER_PYTHON?.trim() || process.env.PYTHON?.trim() || 'python3'
    : script;
  const args = isPythonScript ? argv : argv.slice(1);

  const expectedOutput = path.join(outputDir, `${outputName}.safetensors`);
  saveJob({ ...job, outputPath: expectedOutput, status: 'running', progress: 0.05 });
  spawnArgv(bin, args, { ...job, outputPath: expectedOutput });
}

async function handleStart(body: StartBody) {
  const { url, command, templateId, kohyaScript } = resolveTrainerTargets(body);
  const trigger = body.trigger?.trim() ?? '';
  const outputPath = body.outputPath?.trim() ?? '';
  const datasetPath = body.datasetPath?.trim() || undefined;
  const baseModel = body.baseModel?.trim() || undefined;
  const resolvedTemplate = templateId ?? (kohyaScript ? 'kohya-sdxl' : undefined);
  const commandOrUrl =
    url || command || (resolvedTemplate && kohyaScript ? resolvedTemplate : '') || 'manual';

  let job = createTrainJob({
    trigger,
    outputPath,
    commandOrUrl,
    status: 'pending',
    progress: 0,
    characterId: body.characterId,
    lookId: body.lookId,
    datasetPath,
    templateId: resolvedTemplate,
    networkRank: body.networkRank,
    maxTrainSteps: body.maxTrainSteps,
    resolution: body.resolution,
  });

  if (url) {
    job = saveJob({ ...job, status: 'running', progress: 0.05 });
    try {
      await postTrainerWebhook(url, {
        jobId: job.id,
        trigger: job.trigger,
        outputPath: job.outputPath,
        datasetPath,
        baseModel,
        templateId: resolvedTemplate,
        networkRank: job.networkRank,
        maxTrainSteps: job.maxTrainSteps,
        resolution: job.resolution,
        callbackHint: 'POST /api/lora-train with action=complete when finished',
      });
      job = saveJob({ ...job, status: 'running', progress: 0.1 });
    } catch (error) {
      job = saveJob({
        ...job,
        status: 'error',
        error: error instanceof Error ? error.message : 'Trainer webhook failed.',
      });
    }
    return job;
  }

  if (command) {
    job = saveJob({ ...job, status: 'running', progress: 0.05 });
    try {
      spawnTrainerCommand(command, job, { datasetPath, baseModel });
    } catch (error) {
      job = saveJob({
        ...job,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to spawn trainer command.',
      });
    }
    return job;
  }

  if (resolvedTemplate && kohyaScript) {
    if (!datasetPath) {
      return saveJob({
        ...job,
        status: 'error',
        error: 'datasetPath is required for kohya template training.',
      });
    }
    if (!baseModel) {
      return saveJob({
        ...job,
        status: 'error',
        error: 'baseModel is required for kohya template training.',
      });
    }
    job = saveJob({ ...job, status: 'running', progress: 0.05, templateId: resolvedTemplate });
    try {
      spawnKohyaTemplate(job, {
        templateId: resolvedTemplate,
        kohyaScript,
        datasetPath,
        baseModel,
        networkRank: body.networkRank,
        maxTrainSteps: body.maxTrainSteps,
        resolution: body.resolution,
      });
      return getDurableTrainJob(job.id) ?? job;
    } catch (error) {
      return saveJob({
        ...job,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to spawn kohya template.',
      });
    }
  }

  // Neither TRAINER_URL, TRAINER_COMMAND, nor a kohya script — manual job.
  return saveJob({
    ...job,
    status: 'manual',
    progress: 0,
    commandOrUrl: 'manual',
  });
}

function handleProgress(body: ProgressBody) {
  const jobId = body.jobId?.trim();
  if (!jobId) {
    throw new Error('jobId is required.');
  }
  const existing = getDurableTrainJob(jobId);
  if (!existing) {
    throw new Error(`Unknown train job: ${jobId}`);
  }
  return saveJob({
    ...existing,
    progress: typeof body.progress === 'number' ? body.progress : existing.progress,
    status: body.status ?? existing.status,
    outputPath: body.outputPath?.trim() || existing.outputPath,
    error: body.error?.trim() || existing.error,
  });
}

function handleComplete(body: CompleteBody) {
  const jobId = body.jobId?.trim();
  if (!jobId) {
    throw new Error('jobId is required.');
  }
  const existing = getDurableTrainJob(jobId) ?? createTrainJob({ id: jobId });
  if (body.error?.trim()) {
    const failed = saveJob({
      ...existing,
      status: 'error',
      error: body.error.trim(),
      outputPath: body.outputPath?.trim() || existing.outputPath,
      trigger: body.trigger?.trim() || existing.trigger,
    });
    return { job: failed, registered: false as const };
  }

  let outputPath = body.outputPath?.trim() || existing.outputPath;
  const installed = installTrainLoraIntoComfy(outputPath);
  if (installed.installed || installed.filename) {
    outputPath = installed.filename;
  }

  const ready = saveJob({
    ...existing,
    status: 'completed',
    progress: 1,
    outputPath,
    trigger: body.trigger?.trim() || existing.trigger,
    error: undefined,
  });

  if (!ready.outputPath.trim()) {
    return {
      job: ready,
      registered: false as const,
      install: installed,
    };
  }

  const registered = registerTrainJobLora(body.library, ready, {
    activateInSession: body.activateInSession === true,
    sessionActiveLoraIds: body.sessionActiveLoraIds,
    label: body.label,
  });
  saveJob(registered.job);
  return {
    job: registered.job,
    registered: true as const,
    entry: registered.entry,
    library: registered.library,
    sessionActiveLoraIds: registered.sessionActiveLoraIds,
    install: installed,
  };
}

function handleExportDataset(body: ExportDatasetBody) {
  const files = (body.files ?? [])
    .map(file => ({
      filename: typeof file.filename === 'string' ? file.filename : '',
      caption: typeof file.caption === 'string' ? file.caption : '',
      imageBase64: typeof file.imageBase64 === 'string' ? file.imageBase64 : '',
    }))
    .filter(file => file.filename && file.imageBase64);

  const result = persistLoraDatasetFiles({
    files,
    trigger: body.trigger,
    characterId: body.characterId,
    lookId: body.lookId,
    datasetId: body.datasetId,
  });
  return result;
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }
  const url = new URL(request.url);
  const jobId = url.searchParams.get('id')?.trim();
  const envUrl = Boolean(process.env.TRAINER_URL?.trim());
  const envCommand = Boolean(process.env.TRAINER_COMMAND?.trim());
  const envKohya = Boolean(process.env.TRAINER_KOHYA_SCRIPT?.trim());

  if (jobId) {
    const job = getDurableTrainJob(jobId);
    if (!job) {
      return apiError(`Unknown train job: ${jobId}`, 404);
    }
    return apiJson({
      job,
      trainer: { envUrl, envCommand, envKohya },
      templates: [
        getLoraTrainTemplate('kohya-sdxl'),
        getLoraTrainTemplate('kohya-sd15'),
        getLoraTrainTemplate('kohya-flux'),
      ],
    });
  }

  return apiJson({
    jobs: listServerJobs(),
    trainer: { envUrl, envCommand, envKohya },
    templates: [
      getLoraTrainTemplate('kohya-sdxl'),
      getLoraTrainTemplate('kohya-sd15'),
      getLoraTrainTemplate('kohya-flux'),
    ],
  });
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }
  try {
    const body = (await request.json()) as LoraTrainBody;
    const action = body.action ?? 'start';

    if (action === 'export-dataset') {
      const result = handleExportDataset(body as ExportDatasetBody);
      return apiJson({ ok: true, ...result });
    }

    if (action === 'start') {
      const job = await handleStart(body as StartBody);
      return apiJson({ ok: true, job, jobs: listServerJobs() });
    }

    if (action === 'progress') {
      const job = handleProgress(body as ProgressBody);
      return apiJson({ ok: true, job, jobs: listServerJobs() });
    }

    if (action === 'complete') {
      const result = handleComplete(body as CompleteBody);
      return apiJson({ ok: true, ...result, jobs: listServerJobs() });
    }

    return apiError(`Unknown action: ${String(action)}`, 400);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'LoRA train request failed.', 400);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
