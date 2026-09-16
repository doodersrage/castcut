import {
  COMFY_IMAGE_MODELS,
  COMFY_MODEL_CATEGORIES,
  DEFAULT_COMFY_MODEL,
  type ComfyImageModelDefinition,
  type ComfyModelCategory,
} from '@/lib/comfy-models';
import type { DetailLevel } from '@/lib/detail-level';

export const API_VERSION = '1.1.0';

export type SerializedModel = {
  id: string;
  label: string;
  category: ComfyModelCategory;
  categoryLabel: string;
  comfyNode: string;
  comfyClass?: string;
  description: string;
  profile: ComfyImageModelDefinition['profile'];
  referenceTokenLimit: number;
  limitsByDetail: ComfyImageModelDefinition['limitsByDetail'];
  fluxIgnoresNegative: boolean;
};

const CATEGORY_LABELS = Object.fromEntries(
  COMFY_MODEL_CATEGORIES.map(entry => [entry.id, entry.label])
) as Record<ComfyModelCategory, string>;

export function serializeModel(model: ComfyImageModelDefinition): SerializedModel {
  return {
    id: model.id,
    label: model.label,
    category: model.category,
    categoryLabel: CATEGORY_LABELS[model.category],
    comfyNode: model.comfyNode,
    comfyClass: model.comfyClass,
    description: model.description,
    profile: model.profile,
    referenceTokenLimit: model.referenceTokenLimit,
    limitsByDetail: model.limitsByDetail,
    fluxIgnoresNegative: model.profile.startsWith('flux_'),
  };
}

export function buildModelsPayload(options?: {
  category?: ComfyModelCategory | null;
  id?: string | null;
}) {
  if (options?.id) {
    const model = COMFY_IMAGE_MODELS.find(entry => entry.id === options.id);
    if (!model) {
      return { found: false as const, id: options.id };
    }
    return {
      found: true as const,
      model: serializeModel(model),
    };
  }

  const models = options?.category
    ? COMFY_IMAGE_MODELS.filter(entry => entry.category === options.category)
    : COMFY_IMAGE_MODELS;

  return {
    defaultModel: DEFAULT_COMFY_MODEL,
    count: models.length,
    categories: COMFY_MODEL_CATEGORIES,
    models: models.map(serializeModel),
  };
}

export function buildApiCatalog(baseUrl: string) {
  const detailLevels: DetailLevel[] = ['concise', 'balanced', 'rich'];

  return {
    name: 'ComfyUI Image Prompt API',
    version: API_VERSION,
    baseUrl,
    contentType: 'application/json',
    tools: [
      {
        id: 'generate',
        name: 'Generate',
        description: 'Turn keywords or a brief scene idea into a model-ready prompt.',
        method: 'POST',
        path: '/api/generate',
        request: {
          input: {
            type: 'string',
            required: true,
            maxLength: 4000,
            description: 'Topic, keywords, or edit goal.',
          },
          mode: {
            type: '"positive" | "negative"',
            required: false,
            default: 'positive',
            description: 'Positive scene prompt or negative/preserve conditioning.',
          },
          model: {
            type: 'string',
            required: false,
            default: DEFAULT_COMFY_MODEL,
            description: 'Target model id from GET /api/models.',
          },
          detail: {
            type: '"concise" | "balanced" | "rich"',
            required: false,
            default: 'balanced',
            description: 'Prompt length preset (positive mode only).',
          },
          distinctPeople: {
            type: 'boolean',
            required: false,
            default: true,
            description: 'Split multi-person inputs into distinct individuals (positive mode).',
          },
          alwaysIncludeClothing: {
            type: 'boolean',
            required: false,
            default: true,
            description:
              'Roll catalog wardrobe when people appear in the input and append it if the model omits clothing (positive mode).',
          },
          seedLlmWithIngredients: {
            type: 'boolean',
            required: false,
            default: true,
            description:
              'When true, inject rolled location / wardrobe / environment seeds into the LLM. When false, send keywords/hints only (better for completionist local models).',
          },
          variation: {
            type: 'object',
            required: false,
            properties: {
              enabled: { type: 'boolean', default: true },
              strength: { type: 'number', minimum: 0, maximum: 100, default: 65 },
            },
          },
        },
        response: {
          prompt: 'string',
          mode: '"positive" | "negative"',
          provider: '"llm" | "template"',
          model: 'string',
          comfyNode: 'string',
          limits: {
            minChars: 'number | undefined',
            maxChars: 'number',
            maxSentences: 'number',
            maxTokens: 'number',
          },
        },
        example: {
          request: {
            input: 'neon alley, rain, black cat',
            mode: 'positive',
            model: 'sdxl',
            detail: 'balanced',
          },
          curl: `curl -sS -X POST ${baseUrl}/api/generate -H "Content-Type: application/json" -d '{"input":"neon alley, rain, black cat","mode":"positive","model":"sdxl","detail":"balanced"}'`,
        },
      },
      {
        id: 'format',
        name: 'Format',
        description:
          'Adapt an existing prompt draft for a target model (tag soup, cross-model conversion).',
        method: 'POST',
        path: '/api/format',
        request: {
          input: {
            type: 'string',
            required: true,
            maxLength: 8000,
            description: 'Existing prompt text to restructure.',
          },
          model: {
            type: 'string',
            required: false,
            default: DEFAULT_COMFY_MODEL,
          },
          detail: {
            type: '"concise" | "balanced" | "rich"',
            required: false,
            default: 'balanced',
          },
          mode: {
            type: '"positive" | "negative"',
            required: false,
            default: 'positive',
          },
          smartFormat: {
            type: 'boolean',
            required: false,
            default: true,
            description: 'Use LLM rewrite when enabled; rules-only when false.',
          },
        },
        response: {
          prompt: 'string',
          mode: '"positive" | "negative"',
          model: 'string',
          comfyNode: 'string',
          provider: '"llm" | "rules"',
          limits: {
            minChars: 'number | undefined',
            maxChars: 'number',
            maxSentences: 'number',
            maxTokens: 'number',
          },
          inputChars: 'number',
          outputChars: 'number',
        },
        example: {
          request: {
            input: '1girl, neon alley, rain, masterpiece, best quality',
            model: 'flux-2-klein',
            detail: 'balanced',
            smartFormat: true,
          },
          curl: `curl -sS -X POST ${baseUrl}/api/format -H "Content-Type: application/json" -d '{"input":"1girl, neon alley, rain, masterpiece","model":"flux-2-klein","detail":"balanced","smartFormat":true}'`,
        },
      },
      {
        id: 'topics',
        name: 'Topics',
        description: 'Generate a list of image prompt topic ideas from an optional seed theme.',
        method: 'POST',
        path: '/api/topics',
        request: {
          seedTopic: {
            type: 'string',
            required: false,
            maxLength: 500,
            description: 'Optional theme to riff on. Omit for open-ended variety.',
          },
          count: {
            type: 'number',
            required: false,
            default: 10,
            minimum: 3,
            maximum: 24,
            description: 'Number of topics to return.',
          },
          variety: {
            type: 'number',
            required: false,
            default: 50,
            minimum: 0,
            maximum: 100,
            description: 'How unexpected the topic combinations should be.',
          },
        },
        response: {
          topics: 'string[]',
          provider: '"llm" | "template"',
          seedTopic: 'string | null',
          count: 'number',
        },
        example: {
          request: {
            seedTopic: 'solarpunk',
            count: 8,
            variety: 60,
          },
          curl: `curl -sS -X POST ${baseUrl}/api/topics -H "Content-Type: application/json" -d '{"seedTopic":"solarpunk","count":8,"variety":60}'`,
        },
      },
      {
        id: 'models',
        name: 'Models',
        description: 'List supported ComfyUI image model targets and size limits.',
        method: 'GET',
        path: '/api/models',
        query: {
          category: {
            type: 'string',
            required: false,
            description: 'Filter by architecture family id.',
            enum: COMFY_MODEL_CATEGORIES.map(entry => entry.id),
          },
          id: {
            type: 'string',
            required: false,
            description: 'Return a single model by id.',
          },
        },
        response: {
          defaultModel: 'string',
          count: 'number',
          categories: 'array',
          models: 'SerializedModel[]',
        },
        example: {
          curl: `curl -sS ${baseUrl}/api/models?category=flux`,
        },
      },
      {
        id: 'character',
        name: 'Character',
        description: 'Single-person, duo, or compose-with-background character prompts.',
        method: 'POST',
        path: '/api/character',
      },
      {
        id: 'pet',
        name: 'Pet',
        description: 'Pet and animal scene prompts with optional presets.',
        method: 'POST',
        path: '/api/pet',
      },
      {
        id: 'fantasy',
        name: 'Fantasy',
        description: 'Fantasy character, creature, and environment prompts.',
        method: 'POST',
        path: '/api/fantasy',
      },
      {
        id: 'roleplay',
        name: 'Story',
        description: 'Cast a character, roll story beats, and write still prompts.',
        method: 'POST',
        path: '/api/roleplay',
      },
      {
        id: 'background',
        name: 'Background',
        description: 'People-free environment prompts.',
        method: 'POST',
        path: '/api/background',
      },
      {
        id: 'random-scene',
        name: 'Random scene',
        description: 'Roll random ingredients into a cohesive scene prompt.',
        method: 'POST',
        path: '/api/random-scene',
      },
      {
        id: 'topics-batch',
        name: 'Topics batch',
        description:
          'Turn topic strings into full prompts for generate, character, duo, pet, fantasy, or background.',
        method: 'POST',
        path: '/api/topics/batch',
      },
      {
        id: 'comfyui',
        name: 'ComfyUI queue',
        description: 'Queue one or more prompts to ComfyUI with workflow placeholder injection.',
        method: 'POST',
        path: '/api/comfyui',
      },
      {
        id: 'comfyui-history',
        name: 'ComfyUI history',
        description: 'List completed ComfyUI jobs importable into the gallery.',
        method: 'GET',
        path: '/api/comfyui/history',
      },
      {
        id: 'lint',
        name: 'Lint',
        description: 'Sport/duo/helmet diagnostics for hints and finished prompts.',
        method: 'POST',
        path: '/api/lint',
      },
      {
        id: 'negative',
        name: 'Negative',
        description: 'Sport-aware negative and preserve-subject prompts.',
        method: 'POST',
        path: '/api/negative',
      },
    ],
    enums: {
      detail: detailLevels,
      mode: ['positive', 'negative'],
      categories: COMFY_MODEL_CATEGORIES,
    },
    errors: {
      shape: { error: 'string' },
      statuses: {
        400: 'Invalid or missing request fields.',
        404: 'Unknown model id (GET /api/models?id=…).',
        405: 'Method not allowed; see allowed methods on each endpoint.',
        500: 'Generation/formatting failed.',
      },
    },
  };
}
