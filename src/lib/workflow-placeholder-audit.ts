import {
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
} from './comfyui-config';
import { isEditCapableModel, isInpaintModel } from './model-denoise-defaults';
import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
} from './model-checkpoint-map';
import { DEFAULT_UPSCALE_MODEL_TOKEN } from './model-upscale-map';
import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  DEFAULT_CONTROL_IMAGE_TOKEN,
} from './model-controlnet-map';
import { LORA_PLACEHOLDER_TOKEN_PATTERN, isLightningFamilyLoraToken } from './workflow-lora-patch';

const LORA_TOKEN_PATTERN = LORA_PLACEHOLDER_TOKEN_PATTERN;

const PLACEHOLDER_PATTERN = /\{\{[A-Z0-9_]+\}\}/g;

export type WorkflowPlaceholderAuditIssue = {
  severity: 'error' | 'warn';
  message: string;
};

export function findUnresolvedPlaceholderTokens(raw: string): string[] {
  const matches = raw.match(PLACEHOLDER_PATTERN);
  return [...new Set(matches ?? [])];
}

export function auditWorkflowPreviewIssues(input: {
  workflowJson?: string;
  model: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
}): WorkflowPlaceholderAuditIssue[] {
  if (!input.workflowJson?.trim()) {
    return [];
  }

  const issues: WorkflowPlaceholderAuditIssue[] = [];
  const unresolved = findUnresolvedPlaceholderTokens(input.workflowJson);

  for (const token of unresolved) {
    if (token === DEFAULT_INPUT_IMAGE_TOKEN) {
      if (input.hasInputImage) {
        issues.push({
          severity: 'error',
          message:
            'Input image placeholder was not replaced — bind LoadImage → {{INPUT_IMAGE}} in Settings → workflow library (Apply bindings).',
        });
      } else if (isEditCapableModel(input.model)) {
        issues.push({
          severity: 'error',
          message:
            'Workflow expects an input image ({{INPUT_IMAGE}}) but none was provided — upload a source image before you Queue.',
        });
      } else {
        issues.push({
          severity: 'warn',
          message:
            'Workflow contains {{INPUT_IMAGE}} — upload a source image or remove the LoadImage binding.',
        });
      }
      continue;
    }

    if (token === DEFAULT_MASK_IMAGE_TOKEN) {
      if (input.hasMaskImage) {
        issues.push({
          severity: 'error',
          message:
            'Mask placeholder was not replaced — bind LoadImageMask → {{MASK_IMAGE}} in Settings → workflow library.',
        });
      } else if (!isInpaintModel(input.model)) {
        issues.push({
          severity: 'warn',
          message: 'Workflow contains {{MASK_IMAGE}} without a mask upload.',
        });
      }
      continue;
    }

    if (token === DEFAULT_CHECKPOINT_TOKEN) {
      issues.push({
        severity: 'error',
        message:
          'Checkpoint placeholder {{CHECKPOINT}} is unresolved — set Settings → model checkpoint map or a {{CHECKPOINT}} custom token.',
      });
      continue;
    }

    if (token === DEFAULT_UNET_TOKEN) {
      issues.push({
        severity: 'warn',
        message:
          '{{UNET}} is unresolved — map the model in Settings → checkpoint map or add a {{UNET}} custom token.',
      });
      continue;
    }

    if (token === DEFAULT_VAE_TOKEN) {
      issues.push({
        severity: 'warn',
        message:
          '{{VAE}} is unresolved — set a VAE filename in the model checkpoint map or add a {{VAE}} custom token.',
      });
      continue;
    }

    if (token === DEFAULT_UPSCALE_MODEL_TOKEN) {
      issues.push({
        severity: 'warn',
        message:
          '{{UPSCALE_MODEL}} is unresolved — set Settings → upscale model map or add a {{UPSCALE_MODEL}} custom token.',
      });
      continue;
    }

    if (token === DEFAULT_CONTROLNET_MODEL_TOKEN) {
      issues.push({
        severity: 'warn',
        message:
          '{{CONTROLNET_MODEL}} is unresolved — set Settings → ControlNet model map or add a custom token.',
      });
      continue;
    }

    if (token === DEFAULT_CONTROL_IMAGE_TOKEN) {
      issues.push({
        severity: 'warn',
        message:
          '{{CONTROL_IMAGE}} is unresolved — upload a control image or bind LoadImage at queue time.',
      });
      continue;
    }

    if (token === DEFAULT_DENOISE_TOKEN) {
      issues.push({
        severity: 'error',
        message:
          '{{DENOISE}} was not replaced — queue params should patch KSampler denoise to 1.0 for txt2img; re-run Optimize all or queue again after updating.',
      });
      continue;
    }

    if (LORA_TOKEN_PATTERN.test(token)) {
      const isLightningToken = isLightningFamilyLoraToken(token);
      issues.push({
        severity: isLightningToken ? 'error' : 'warn',
        message: isLightningToken
          ? `Unresolved ${token} — map a LightX2V / Lightning .safetensors on this workflow’s token overrides (or Settings → LoRA library as ID “LIGHTNING”). Native turbo models (Boogu/Z-Image Turbo) do not use Lightning LoRAs.`
          : `Unresolved ${token} — add LoRA to library or bind LoRA loader in workflow.`,
      });
      continue;
    }

    issues.push({
      severity: 'warn',
      message: `Unresolved workflow token ${token}.`,
    });
  }

  return issues;
}
