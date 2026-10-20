export type SessionLlmProvider = 'server' | 'openrouter' | 'groq';

export type LlmModelKind = 'text' | 'vision' | 'embed';

export type LlmCatalogEntry = {
  id: string;
  kind: LlmModelKind;
  ownedBy?: string;
  contextLength?: number;
  sizeLabel?: string;
  free?: boolean;
};

export const LLM_PUBLIC_PROVIDERS: Record<
  Exclude<SessionLlmProvider, 'server'>,
  {
    id: Exclude<SessionLlmProvider, 'server'>;
    label: string;
    baseUrl: string;
    keysUrl: string;
    hint: string;
    listWithoutKey: boolean;
  }
> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keysUrl: 'https://openrouter.ai/keys',
    hint: 'Hosted models, including free :free ids. Paste an OpenRouter key — no local LLM required.',
    listWithoutKey: true,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keysUrl: 'https://console.groq.com/keys',
    hint: 'Fast hosted Llama / Mixtral. Requires a Groq API key.',
    listWithoutKey: false,
  },
};

export function normalizeSessionLlmProvider(value: string | null | undefined): SessionLlmProvider {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase();
  if (trimmed === 'openrouter' || trimmed === 'groq') {
    return trimmed;
  }
  return 'server';
}

export function classifyLlmModelKind(
  id: string,
  extra?: {
    modality?: string;
    family?: string;
    families?: string[];
  }
): LlmModelKind {
  const haystack = [id, extra?.modality, extra?.family, ...(extra?.families ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/embed|text-embedding|nomic-embed|\bbge-|\be5-|\bgte-|\bminilm\b|embedding/.test(haystack)) {
    return 'embed';
  }

  const modality = extra?.modality?.toLowerCase() ?? '';
  if (
    /image|vision|\bvl\b|llava|minicpm-v|pixtral|moondream|gpt-4o|gpt-5|claude-3|gemini/.test(
      haystack
    ) ||
    (modality.includes('image') && modality.includes('text'))
  ) {
    return 'vision';
  }

  return 'text';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function formatByteSize(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_048_576)} MB`;
  }
  return `${bytes} B`;
}

function catalogIdFromRecord(record: Record<string, unknown>): string {
  const id = readString(record.id);
  if (id) {
    return id;
  }
  const name = readString(record.name).replace(/^models\//, '');
  if (name) {
    return name;
  }
  return readString(record.model);
}

function architectureOf(record: Record<string, unknown>): {
  modality?: string;
  family?: string;
  families?: string[];
} {
  const architecture =
    record.architecture && typeof record.architecture === 'object'
      ? (record.architecture as Record<string, unknown>)
      : null;
  const details =
    record.details && typeof record.details === 'object'
      ? (record.details as Record<string, unknown>)
      : null;
  const familiesRaw = details?.families;
  return {
    modality: readString(architecture?.modality) || undefined,
    family: readString(details?.family) || readString(architecture?.tokenizer) || undefined,
    families: Array.isArray(familiesRaw)
      ? familiesRaw.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

function isPricingFree(record: Record<string, unknown>): boolean | undefined {
  const pricing =
    record.pricing && typeof record.pricing === 'object'
      ? (record.pricing as Record<string, unknown>)
      : null;
  if (!pricing) {
    return undefined;
  }
  const prompt = String(pricing.prompt ?? '').trim();
  const completion = String(pricing.completion ?? '').trim();
  if (!prompt && !completion) {
    return undefined;
  }
  const promptCost = Number(prompt);
  const completionCost = Number(completion);
  return (prompt === '0' || promptCost === 0) && (completion === '0' || completionCost === 0);
}

export function parseLlmCatalogEntries(payload: unknown): LlmCatalogEntry[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const root = payload as { data?: unknown; models?: unknown };
  const rows = Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : [];
  const byId = new Map<string, LlmCatalogEntry>();

  for (const row of rows) {
    if (typeof row === 'string') {
      const id = row.trim();
      if (id) {
        byId.set(id, { id, kind: classifyLlmModelKind(id) });
      }
      continue;
    }
    if (!row || typeof row !== 'object') {
      continue;
    }
    const record = row as Record<string, unknown>;
    const id = catalogIdFromRecord(record);
    if (!id) {
      continue;
    }
    const extra = architectureOf(record);
    const sizeBytes = readNumber(record.size);
    const parameterSize = readString(
      record.details && typeof record.details === 'object'
        ? (record.details as Record<string, unknown>).parameter_size
        : undefined
    );
    const quantization = readString(
      record.details && typeof record.details === 'object'
        ? (record.details as Record<string, unknown>).quantization_level
        : undefined
    );
    const sizeLabel =
      [parameterSize, quantization].filter(Boolean).join(' · ') ||
      (sizeBytes ? formatByteSize(sizeBytes) : undefined);
    const ownedBy = readString(record.owned_by) || extra.family;
    const contextLength =
      readNumber(record.context_length) ??
      readNumber(record.context_window) ??
      readNumber(record.max_context_length);
    const freeFromPrice = isPricingFree(record);
    const free = id.endsWith(':free') || freeFromPrice === true ? true : freeFromPrice;
    byId.set(id, {
      id,
      kind: classifyLlmModelKind(id, extra),
      ...(ownedBy ? { ownedBy } : {}),
      ...(contextLength ? { contextLength } : {}),
      ...(sizeLabel ? { sizeLabel } : {}),
      ...(typeof free === 'boolean' ? { free } : {}),
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { sensitivity: 'base' })
  );
}

export function catalogEntryIds(entries: LlmCatalogEntry[]): string[] {
  return entries.map(entry => entry.id);
}

export function groupLlmCatalogEntries(entries: LlmCatalogEntry[]): {
  vision: LlmCatalogEntry[];
  text: LlmCatalogEntry[];
  embed: LlmCatalogEntry[];
} {
  const vision: LlmCatalogEntry[] = [];
  const text: LlmCatalogEntry[] = [];
  const embed: LlmCatalogEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'vision') {
      vision.push(entry);
    } else if (entry.kind === 'embed') {
      embed.push(entry);
    } else {
      text.push(entry);
    }
  }
  return { vision, text, embed };
}

export function filterOpenRouterFreeEntries(entries: LlmCatalogEntry[]): LlmCatalogEntry[] {
  const free = entries.filter(entry => entry.free === true || entry.id.endsWith(':free'));
  return free.length > 0 ? free : entries;
}
