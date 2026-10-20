import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseWorkflowJson } from './config';

export type ServerWorkflowFile = {
  id: string;
  name: string;
  /** Internal filesystem path — never send to clients. */
  path: string;
};

function resolveWorkflowPath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(/* turbopackIgnore: true */ process.cwd(), filePath);
}

function readWorkflowPathsFromDirectory(dirPath: string): string[] {
  try {
    const resolvedDir = resolveWorkflowPath(dirPath);
    return fs
      .readdirSync(resolvedDir)
      .filter(entry => entry.toLowerCase().endsWith('.json'))
      .map(entry => path.join(dirPath, entry).replace(/\\/g, '/'));
  } catch {
    return [];
  }
}

export function listServerWorkflowPaths(): string[] {
  const paths = new Set<string>();

  const workflowDir = process.env.COMFYUI_WORKFLOW_DIR?.trim();
  if (workflowDir) {
    for (const entry of readWorkflowPathsFromDirectory(workflowDir)) {
      paths.add(entry);
    }
  }

  const workflowPaths = process.env.COMFYUI_WORKFLOW_PATHS?.trim();
  if (workflowPaths) {
    for (const entry of workflowPaths.split(',')) {
      const trimmed = entry.trim();
      if (trimmed) {
        paths.add(trimmed);
      }
    }
  }

  const defaultPath = process.env.COMFYUI_WORKFLOW_PATH?.trim();
  if (defaultPath) {
    paths.add(defaultPath);
  }

  return [...paths].sort((left, right) => left.localeCompare(right));
}

export function serverWorkflowIdForPath(filePath: string): string {
  const resolved = path.resolve(resolveWorkflowPath(filePath));
  return crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
}

export function listServerWorkflowFiles(): ServerWorkflowFile[] {
  return listServerWorkflowPaths().map(filePath => ({
    id: serverWorkflowIdForPath(filePath),
    name: path
      .basename(filePath)
      .replace(/\.api\.json$/i, '')
      .replace(/\.json$/i, ''),
    path: filePath,
  }));
}

export function isAllowedServerWorkflowPath(filePath: string): boolean {
  const trimmed = filePath.trim();
  if (!trimmed || trimmed.includes('\0')) {
    return false;
  }

  const requested = path.resolve(resolveWorkflowPath(trimmed));
  return listServerWorkflowPaths().some(allowed => {
    return path.resolve(resolveWorkflowPath(allowed)) === requested;
  });
}

export function resolveServerWorkflowPath(fileIdOrPath: string): string | null {
  const trimmed = fileIdOrPath.trim();
  if (!trimmed || trimmed.includes('\0')) {
    return null;
  }

  for (const filePath of listServerWorkflowPaths()) {
    if (serverWorkflowIdForPath(filePath) === trimmed) {
      return filePath;
    }
  }

  // Backward compatibility for older clients that stored absolute/relative paths.
  if (isAllowedServerWorkflowPath(trimmed)) {
    return trimmed;
  }

  return null;
}

export function loadServerWorkflowJson(fileIdOrPath: string): Record<string, unknown> | null {
  try {
    const filePath = resolveServerWorkflowPath(fileIdOrPath);
    if (!filePath) {
      return null;
    }
    const resolved = resolveWorkflowPath(filePath);
    return parseWorkflowJson(fs.readFileSync(resolved, 'utf8'));
  } catch {
    return null;
  }
}
