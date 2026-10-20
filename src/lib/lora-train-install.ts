/**
 * Copy a finished LoRA weight into COMFYUI_ROOT/models/loras.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  canWriteComfyModelsRoot,
  getComfyUiRoot,
  resolveAssetDestinationPath,
} from './comfyui/comfy-asset-paths';

export type InstallTrainLoraResult = {
  installed: boolean;
  /** Basename under models/loras (ComfyUI token value). */
  filename: string;
  destPath?: string;
  sourcePath?: string;
  skippedReason?: string;
};

function resolveSourceSafetensors(outputPath: string): string | null {
  const trimmed = outputPath.trim();
  if (!trimmed) {
    return null;
  }

  const candidates: string[] = [];
  if (path.isAbsolute(trimmed)) {
    candidates.push(trimmed);
  } else {
    candidates.push(path.resolve(/* turbopackIgnore: true */ process.cwd(), trimmed));
  }

  // If outputPath is a directory or missing extension, look for *.safetensors beside it.
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        const files = fs
          .readdirSync(candidate)
          .filter(name => name.toLowerCase().endsWith('.safetensors'))
          .sort();
        if (files[0]) {
          return path.join(candidate, files[0]);
        }
      }
      const withExt = candidate.toLowerCase().endsWith('.safetensors')
        ? candidate
        : `${candidate}.safetensors`;
      if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
        return withExt;
      }
      const parent = path.dirname(candidate);
      const stem = path.basename(candidate).replace(/\.safetensors$/i, '');
      if (fs.existsSync(parent) && fs.statSync(parent).isDirectory()) {
        const match = fs
          .readdirSync(parent)
          .filter(
            name =>
              name.toLowerCase().endsWith('.safetensors') &&
              name.toLowerCase().startsWith(stem.toLowerCase())
          )
          .sort();
        if (match[0]) {
          return path.join(parent, match[0]);
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Copy job output `.safetensors` into ComfyUI models/loras.
 * Returns the Comfy-relative filename for library registration.
 */
export function installTrainLoraIntoComfy(outputPath: string): InstallTrainLoraResult {
  const source = resolveSourceSafetensors(outputPath);
  const fallbackName =
    path.basename(outputPath.trim() || 'lora.safetensors').replace(/\.safetensors$/i, '') +
    '.safetensors';

  if (!source) {
    return {
      installed: false,
      filename: fallbackName,
      skippedReason: 'Output .safetensors not found on disk yet.',
    };
  }

  const filename = path.basename(source);
  const root = getComfyUiRoot();
  if (!root) {
    return {
      installed: false,
      filename,
      sourcePath: source,
      skippedReason: 'COMFYUI_ROOT is not set.',
    };
  }
  if (!canWriteComfyModelsRoot(root)) {
    return {
      installed: false,
      filename,
      sourcePath: source,
      skippedReason: `Cannot write under ${root}/models/loras.`,
    };
  }

  const { destPath } = resolveAssetDestinationPath({
    root,
    kind: 'lora',
    filename,
  });

  if (
    path.resolve(/* turbopackIgnore: true */ source) ===
    path.resolve(/* turbopackIgnore: true */ destPath)
  ) {
    return { installed: true, filename, destPath, sourcePath: source };
  }

  fs.mkdirSync(path.dirname(/* turbopackIgnore: true */ destPath), { recursive: true });
  fs.copyFileSync(/* turbopackIgnore: true */ source, /* turbopackIgnore: true */ destPath);
  return { installed: true, filename, destPath, sourcePath: source };
}
