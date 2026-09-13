import {
  isIncompleteVisionFragment,
  isThinkingOnlyArtifact,
  repairVisionDraft,
  stripPromptArtifacts,
} from './prompt-cleanup';
import { getLlmTemperature } from './llm-env';
import { acquireLlmSlot, withLlmSlot } from './llm-backpressure';
import { prepareVisionImageDataUrl, splitImageDataUrl } from './vision-image-prepare';

export { allowTemplateFallback, getLlmTemperature, isLlmEnabled } from './llm-env';
export {
  LlmBusyError,
  getLlmInflightCount,
  getLlmMaxInflight,
  isLlmBusy,
} from './llm-backpressure';

export type LlmUsageContext = {
  userId?: string;
  username?: string;
  route?: string;
};

type LlmUsageLogInput = {
  at: number;
  userId?: string;
  username?: string;
  route: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
  ok: boolean;
};

function logLlmUsageSafe(entry: LlmUsageLogInput): void {
  if (typeof window !== 'undefined') {
    return;
  }
  void import('./llm-usage-log').then(({ logLlmUsage }) => logLlmUsage(entry));
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
  /** Ollama native multimodal field (raw base64, no data URL prefix) */
  images?: string[];
};

export type ChatContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel: string;
};

export type LlmEndpointOverride = {
  baseUrl?: string;
  apiKey?: string;
};

export function getLlmConfig(override?: LlmEndpointOverride): LlmConfig {
  const baseUrl =
    override?.baseUrl?.replace(/\/$/, '') ||
    process.env.LLM_API_BASE_URL?.replace(/\/$/, '') ||
    'http://localhost:11434/v1';
  const apiKey = override?.apiKey?.trim() || process.env.LLM_API_KEY || '';
  const model = process.env.LLM_MODEL ?? 'dolphin-llama3';
  const visionModel =
    process.env.LLM_VISION_MODEL?.trim() || process.env.LLM_MODEL?.trim() || model;

  return { baseUrl, apiKey, model, visionModel };
}

/** Prefer a request-scoped override (session vision model) over the server env default. */
export function getVisionModel(override?: string): string {
  const requested = override?.trim();
  if (requested) {
    return requested;
  }
  const visionModel = process.env.LLM_VISION_MODEL?.trim();
  if (!visionModel) {
    throw new Error(
      'LLM_VISION_MODEL is not set. Image → Prompt requires a vision model (e.g. qwen3-vl:latest). Add it to .env.local and restart the dev server.'
    );
  }
  return visionModel;
}

function isOllamaBaseUrl(baseUrl: string): boolean {
  return /ollama\.com/i.test(baseUrl) || /:11434(\/|$)/.test(baseUrl);
}

function ollamaNativeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '');
}

export function extractBase64FromDataUrl(dataUrl: string): {
  mimeType: string;
  base64: string;
} {
  return splitImageDataUrl(dataUrl);
}

type AssistantMessage = {
  content?: string | ChatContentPart[] | null;
  reasoning?: string | null;
  thinking?: string | null;
  /** LM Studio / OpenAI-compat thinking models (Gemma, etc.). */
  reasoning_content?: string | null;
};

function extractContentText(content?: string | ChatContentPart[] | null): string {
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map(part => part.text)
      .join('\n')
      .trim();
  }

  return '';
}

function safeIsThinkingOnlyArtifact(text: string): boolean {
  try {
    return isThinkingOnlyArtifact(text);
  } catch (error) {
    // Checklist / meta heuristics used to mutual-recurse; keep vision usable
    // even if a new recursive edge slips back in.
    if (error instanceof RangeError) {
      return true;
    }
    throw error;
  }
}

function safeStripPromptArtifacts(text: string): string {
  try {
    return stripPromptArtifacts(text);
  } catch (error) {
    if (error instanceof RangeError) {
      return text.replace(/\s+/g, ' ').trim().slice(0, 8_000);
    }
    throw error;
  }
}

function safeRepairVisionDraft(text: string): string {
  try {
    return repairVisionDraft(text);
  } catch (error) {
    if (error instanceof RangeError) {
      return '';
    }
    throw error;
  }
}

/** Cap model dumps before cleanup — unbounded thinking blobs blow regex/JSON stacks. */
function clipVisionModelText(text: string, maxChars = 24_000): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  // Prefer the tail — final prompt usually lands at the end of thinking dumps.
  return trimmed.slice(trimmed.length - maxChars).trim();
}

function extractThinkingFallback(reasoning?: string | null, thinking?: string | null): string {
  for (const raw of [reasoning, thinking]) {
    if (!raw?.trim()) {
      continue;
    }

    let candidate = raw.trim();

    const handoff = candidate.match(
      /(?:final prompt|output prompt|the prompt(?: text)?|prompt output|scene description)\s*[:\n]+\s*([\s\S]+)$/i
    );
    if (handoff?.[1]?.trim()) {
      candidate = handoff[1].trim();
    } else {
      const paragraphs = candidate
        .split(/\n{2,}/)
        .map(part => part.trim())
        .filter(Boolean);
      if (paragraphs.length > 1) {
        const last = paragraphs.at(-1)!;
        if (
          last.length >= 30 &&
          !/^(?:let me|i need to|first,? i|the user wants|analyze)/i.test(last)
        ) {
          candidate = last;
        }
      }
    }

    candidate = safeRepairVisionDraft(safeStripPromptArtifacts(clipVisionModelText(candidate)));
    if (
      candidate.length >= 12 &&
      !safeIsThinkingOnlyArtifact(candidate) &&
      !isIncompleteVisionFragment(candidate)
    ) {
      return candidate;
    }
  }

  return '';
}

function normalizeVisionModelOutput(text: string): string {
  const trimmed = clipVisionModelText(text);
  if (!trimmed) {
    return '';
  }

  const repaired = safeRepairVisionDraft(safeStripPromptArtifacts(trimmed));
  const minUsable = 60;

  if (
    repaired.length >= minUsable &&
    !safeIsThinkingOnlyArtifact(repaired) &&
    !isIncompleteVisionFragment(repaired)
  ) {
    return repaired;
  }

  const lightlyCleaned = safeStripPromptArtifacts(trimmed);
  if (
    lightlyCleaned.length >= minUsable &&
    lightlyCleaned.length > repaired.length &&
    !safeIsThinkingOnlyArtifact(lightlyCleaned) &&
    !isIncompleteVisionFragment(lightlyCleaned)
  ) {
    return lightlyCleaned;
  }

  // Checklist repairs are often short ("A person standing.") — still usable.
  if (
    repaired.length >= 12 &&
    !safeIsThinkingOnlyArtifact(repaired) &&
    !isIncompleteVisionFragment(repaired)
  ) {
    return repaired;
  }

  return '';
}

/** Plain text chat — skip vision normalization (that collapses newlines / rejects lists). */
function extractChatCompletionText(message?: AssistantMessage): string {
  if (!message) {
    return '';
  }

  const contentText = extractContentText(message.content);
  if (contentText) {
    return contentText;
  }

  // Thinking models (e.g. Gemma via LM Studio) often spend max_tokens on
  // reasoning_content and leave content empty — fall back before failing.
  for (const raw of [message.reasoning, message.reasoning_content, message.thinking]) {
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }

  return '';
}

function extractModelOutputText(message?: AssistantMessage): string {
  if (!message) {
    return '';
  }

  try {
    const contentText = extractContentText(message.content);
    if (contentText) {
      const normalized = normalizeVisionModelOutput(contentText);
      if (
        normalized &&
        !safeIsThinkingOnlyArtifact(normalized) &&
        !isIncompleteVisionFragment(normalized)
      ) {
        return normalized;
      }
    }

    const thinkingText = extractThinkingFallback(
      message.reasoning ?? message.reasoning_content,
      message.thinking
    );
    if (
      thinkingText &&
      !isIncompleteVisionFragment(thinkingText) &&
      !safeIsThinkingOnlyArtifact(thinkingText)
    ) {
      return thinkingText;
    }

    if (contentText) {
      const repaired = safeRepairVisionDraft(
        safeStripPromptArtifacts(clipVisionModelText(contentText))
      );
      if (repaired.length >= 12 && !isIncompleteVisionFragment(repaired)) {
        return repaired;
      }
    }

    return '';
  } catch (error) {
    if (error instanceof RangeError) {
      const fallback =
        extractContentText(message.content)?.trim() ||
        String(message.reasoning ?? message.reasoning_content ?? message.thinking ?? '').trim();
      return clipVisionModelText(fallback.replace(/\s+/g, ' '), 4_000);
    }
    throw error;
  }
}

function chatMessageToOllamaContent(content: string | ChatContentPart[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n');
}

function mapExtraBodyToOllamaOptions(extraBody?: Record<string, unknown>): Record<string, unknown> {
  if (!extraBody) {
    return {};
  }

  const options: Record<string, unknown> = {};

  if (typeof extraBody.top_p === 'number') {
    options.top_p = extraBody.top_p;
  }
  if (typeof extraBody.seed === 'number') {
    options.seed = extraBody.seed;
  }
  if (typeof extraBody.frequency_penalty === 'number') {
    options.frequency_penalty = extraBody.frequency_penalty;
  }
  if (typeof extraBody.presence_penalty === 'number') {
    options.presence_penalty = extraBody.presence_penalty;
  }

  return options;
}

async function ollamaNativeChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  extraBody?: Record<string, unknown>;
}): Promise<string> {
  const response = await fetch(`${ollamaNativeBaseUrl(options.baseUrl)}/api/chat`, {
    method: 'POST',
    headers: buildAuthHeaders(options.apiKey, options.baseUrl),
    body: JSON.stringify({
      model: options.model,
      messages: options.messages.map(message => ({
        role: message.role,
        content: chatMessageToOllamaContent(message.content),
      })),
      stream: false,
      think: false,
      options: {
        temperature: getLlmTemperature(options.temperature),
        num_predict: options.maxTokens,
        ...mapExtraBodyToOllamaOptions(options.extraBody),
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama chat request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    message?: {
      content?: string;
      thinking?: string;
      reasoning?: string;
    };
  };

  const text = extractChatCompletionText(data.message);
  if (!text) {
    throw new Error(
      'LLM returned an empty response. If using a thinking model, ensure Ollama supports think:false or returns content.'
    );
  }

  return text;
}

function buildAuthHeaders(apiKey: string, baseUrl?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (baseUrl && /openrouter\.ai/i.test(baseUrl)) {
    headers['HTTP-Referer'] = 'https://github.com';
    headers['X-Title'] = 'Castcut';
  }

  return headers;
}

async function ollamaNativeVisionCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  textPrompt: string;
  imageBase64: string;
  maxTokens: number;
  temperature?: number;
  think?: boolean;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: 'system', content: options.systemPrompt },
      {
        role: 'user',
        content: options.textPrompt,
        images: [options.imageBase64],
      },
    ],
    stream: false,
    options: {
      temperature: getLlmTemperature(options.temperature),
      num_predict: options.maxTokens,
    },
  };

  if (typeof options.think === 'boolean') {
    body.think = options.think;
  }

  let requestBody: string;
  try {
    requestBody = JSON.stringify(body);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error('Vision request payload is too large or too nested to serialize.');
    }
    throw error;
  }

  const response = await fetch(`${ollamaNativeBaseUrl(options.baseUrl)}/api/chat`, {
    method: 'POST',
    headers: buildAuthHeaders(options.apiKey, options.baseUrl),
    body: requestBody,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama vision request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await parseJsonResponseBody(response)) as {
    message?: AssistantMessage;
  };

  const text = extractModelOutputText(data.message);
  if (!text) {
    throw new Error(
      'Vision model returned an empty response. If using a thinking model, ensure Ollama supports think:false or returns content.'
    );
  }

  return text;
}

async function ollamaNativeVisionCompletionWithFallback(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  textPrompt: string;
  imageBase64: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const attempts: Array<boolean | undefined> = [false, true, undefined];

  let lastError: Error | null = null;
  for (const think of attempts) {
    try {
      return await ollamaNativeVisionCompletion({ ...options, think });
    } catch (error) {
      // Stack overflows / deep-parse failures will not succeed on retry.
      if (error instanceof RangeError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw (
    lastError ?? new Error('Vision model returned an empty response after all Ollama attempts.')
  );
}

function unescapeJsonString(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function extractContentFieldFromRawJson(raw: string): string | null {
  // Index-scan instead of a capturing `(.+)` regex — huge replies can make
  // V8's RegExp engine throw RangeError: Maximum call stack size exceeded.
  const key = '"content"';
  const keyIndex = raw.indexOf(key);
  if (keyIndex < 0) {
    return null;
  }

  let index = keyIndex + key.length;
  while (index < raw.length && /\s/.test(raw[index]!)) {
    index += 1;
  }
  if (raw[index] !== ':') {
    return null;
  }
  index += 1;
  while (index < raw.length && /\s/.test(raw[index]!)) {
    index += 1;
  }
  if (raw[index] !== '"') {
    return null;
  }
  index += 1;

  let out = '';
  while (index < raw.length) {
    const char = raw[index]!;
    if (char === '"') {
      return unescapeJsonString(out);
    }
    if (char === '\\') {
      const next = raw[index + 1];
      if (next == null) {
        break;
      }
      out += `\\${next}`;
      index += 2;
      continue;
    }
    out += char;
    index += 1;
    if (out.length > 48_000) {
      return unescapeJsonString(out);
    }
  }

  return out ? unescapeJsonString(out) : null;
}

async function parseJsonResponseBody(response: Response): Promise<unknown> {
  // Read as text first so a deep-parse RangeError can still fall back.
  const raw = await response.text();
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (!(error instanceof RangeError) && !(error instanceof SyntaxError)) {
      throw error;
    }
    try {
      const content = extractContentFieldFromRawJson(raw);
      if (content) {
        return {
          message: { content },
          choices: [{ message: { content } }],
        };
      }
    } catch {
      // fall through
    }
    if (error instanceof RangeError) {
      throw new Error('Vision model returned a response too deeply nested to parse.');
    }
    throw error;
  }
}

async function openAiCompatibleChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  extraBody?: Record<string, unknown>;
}): Promise<string> {
  let requestBody: string;
  try {
    requestBody = JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: getLlmTemperature(options.temperature),
      max_tokens: options.maxTokens,
      stream: false,
      top_p: 0.9,
      think: false,
      ...options.extraBody,
    });
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error('Vision request payload is too large or too nested to serialize.');
    }
    throw error;
  }

  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildAuthHeaders(options.apiKey, options.baseUrl),
    body: requestBody,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await parseJsonResponseBody(response)) as {
    choices?: Array<{
      message?: AssistantMessage;
    }>;
  };

  const text = extractChatCompletionText(data.choices?.[0]?.message);
  if (!text) {
    throw new Error(
      'LLM returned an empty response (content and reasoning_content were blank). Try raising max tokens or disabling thinking on the vision model.'
    );
  }

  return text;
}

/** Decodes a fetch Response body into complete lines, buffering partial chunks. */
async function* readResponseLines(response: Response): AsyncGenerator<string> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.trim()) {
          yield line;
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* ollamaNativeChatCompletionStream(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const response = await fetch(`${ollamaNativeBaseUrl(options.baseUrl)}/api/chat`, {
    method: 'POST',
    headers: buildAuthHeaders(options.apiKey, options.baseUrl),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      messages: options.messages.map(message => ({
        role: message.role,
        content: chatMessageToOllamaContent(message.content),
      })),
      stream: true,
      think: false,
      options: {
        temperature: getLlmTemperature(options.temperature),
        num_predict: options.maxTokens,
        ...mapExtraBodyToOllamaOptions(options.extraBody),
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Ollama chat stream request failed (${response.status}): ${detail.slice(0, 300)}`
    );
  }

  for await (const line of readResponseLines(response)) {
    let parsed: { message?: { content?: string }; done?: boolean; error?: string };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    const delta = parsed.message?.content;
    if (delta) {
      yield delta;
    }

    if (parsed.done) {
      break;
    }
  }
}

async function* openAiCompatibleChatCompletionStream(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildAuthHeaders(options.apiKey, options.baseUrl),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: getLlmTemperature(options.temperature),
      max_tokens: options.maxTokens,
      stream: true,
      top_p: 0.9,
      think: false,
      ...options.extraBody,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM stream request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  for await (const line of readResponseLines(response)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      continue;
    }

    const payload = trimmed.slice('data:'.length).trim();
    if (payload === '[DONE]') {
      break;
    }

    let parsed: { choices?: Array<{ delta?: { content?: string } }> };
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }

    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

/**
 * Streams chat completion text deltas as they arrive from the LLM. Prefers
 * the Ollama native NDJSON stream (falling back to the OpenAI-compatible SSE
 * stream on request-start failure) and mirrors the `think:false` /
 * fallback conventions used by `chatCompletion`. Concurrency is bounded by
 * the same in-flight slot used by `chatCompletion`.
 *
 * Once any delta has been yielded from one transport, errors no longer fall
 * back to the other transport (the caller has already seen partial output).
 */
export async function* chatCompletionStream(options: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  model?: string;
  extraBody?: Record<string, unknown>;
  usageContext?: LlmUsageContext;
  signal?: AbortSignal;
  endpoint?: LlmEndpointOverride;
}): AsyncGenerator<string, void, unknown> {
  const started = Date.now();
  const { baseUrl, apiKey, model } = getLlmConfig(options.endpoint);
  const resolvedModel = options.model ?? model;
  const extraBody = { think: false, ...options.extraBody };
  const release = acquireLlmSlot();
  let ok = false;

  try {
    let yieldedAny = false;

    if (isOllamaBaseUrl(baseUrl)) {
      try {
        for await (const delta of ollamaNativeChatCompletionStream({
          baseUrl,
          apiKey,
          model: resolvedModel,
          messages: options.messages,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          extraBody,
          signal: options.signal,
        })) {
          yieldedAny = true;
          yield delta;
        }
        ok = true;
        return;
      } catch (nativeError) {
        if (yieldedAny) {
          throw nativeError;
        }
        console.warn(
          '[llm-client] Ollama native chat stream failed, trying OpenAI-compatible stream:',
          nativeError instanceof Error ? nativeError.message : nativeError
        );
      }
    }

    for await (const delta of openAiCompatibleChatCompletionStream({
      baseUrl,
      apiKey,
      model: resolvedModel,
      messages: options.messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      extraBody,
      signal: options.signal,
    })) {
      yieldedAny = true;
      yield delta;
    }
    ok = true;
  } finally {
    release();
    logLlmUsageSafe({
      at: started,
      userId: options.usageContext?.userId,
      username: options.usageContext?.username,
      route: options.usageContext?.route ?? 'chat-stream',
      model: resolvedModel,
      durationMs: Date.now() - started,
      ok,
    });
  }
}

export async function chatCompletion(options: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  model?: string;
  extraBody?: Record<string, unknown>;
  usageContext?: LlmUsageContext;
  endpoint?: LlmEndpointOverride;
}): Promise<string> {
  return withLlmSlot(() => chatCompletionUnthrottled(options));
}

async function chatCompletionUnthrottled(options: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  model?: string;
  extraBody?: Record<string, unknown>;
  usageContext?: LlmUsageContext;
  endpoint?: LlmEndpointOverride;
}): Promise<string> {
  const started = Date.now();
  const { baseUrl, apiKey, model } = getLlmConfig(options.endpoint);
  const resolvedModel = options.model ?? model;
  const extraBody = { think: false, ...options.extraBody };

  try {
    if (isOllamaBaseUrl(baseUrl)) {
      try {
        const text = await ollamaNativeChatCompletion({
          baseUrl,
          apiKey,
          model: resolvedModel,
          messages: options.messages,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          extraBody,
        });
        logLlmUsageSafe({
          at: started,
          userId: options.usageContext?.userId,
          username: options.usageContext?.username,
          route: options.usageContext?.route ?? 'chat',
          model: resolvedModel,
          durationMs: Date.now() - started,
          ok: true,
        });
        return text;
      } catch (nativeError) {
        console.warn(
          '[llm-client] Ollama native chat failed, trying OpenAI-compatible endpoint:',
          nativeError instanceof Error ? nativeError.message : nativeError
        );
      }
    }

    const text = await openAiCompatibleChatCompletion({
      baseUrl,
      apiKey,
      model: resolvedModel,
      messages: options.messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      extraBody,
    });
    logLlmUsageSafe({
      at: started,
      userId: options.usageContext?.userId,
      username: options.usageContext?.username,
      route: options.usageContext?.route ?? 'chat',
      model: resolvedModel,
      durationMs: Date.now() - started,
      ok: true,
    });
    return text;
  } catch (error) {
    logLlmUsageSafe({
      at: started,
      userId: options.usageContext?.userId,
      username: options.usageContext?.username,
      route: options.usageContext?.route ?? 'chat',
      model: resolvedModel,
      durationMs: Date.now() - started,
      ok: false,
    });
    throw error;
  }
}

export async function visionCompletion(options: {
  systemPrompt: string;
  textPrompt: string;
  imageDataUrl: string;
  maxTokens: number;
  temperature?: number;
  /** Request-scoped vision model override (falls back to LLM_VISION_MODEL). */
  model?: string;
  usageContext?: LlmUsageContext;
  endpoint?: LlmEndpointOverride;
}): Promise<string> {
  const started = Date.now();
  const resolvedModel = getVisionModel(options.model);
  let ok = false;
  try {
    const result = await visionCompletionUnsafe(options);
    ok = true;
    return result;
  } catch (error) {
    if (error instanceof RangeError) {
      const site =
        error.stack
          ?.split('\n')
          .map(line => line.trim())
          .find(line =>
            /vision-image-prepare|prompt-cleanup|llm-client|JSON|parse|stringify/i.test(line)
          ) ??
        error.stack?.split('\n')[1]?.trim() ??
        'unknown';
      throw new Error(
        `Vision model reply could not be processed (call stack limit @ ${site}). Try a smaller reference image or a different vision model.`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    logLlmUsageSafe({
      at: started,
      userId: options.usageContext?.userId,
      username: options.usageContext?.username,
      route: options.usageContext?.route ?? 'vision',
      model: resolvedModel,
      durationMs: Date.now() - started,
      ok,
    });
  }
}

async function visionCompletionUnsafe(options: {
  systemPrompt: string;
  textPrompt: string;
  imageDataUrl: string;
  maxTokens: number;
  temperature?: number;
  model?: string;
  endpoint?: LlmEndpointOverride;
}): Promise<string> {
  const { baseUrl, apiKey } = getLlmConfig(options.endpoint);
  const visionModel = getVisionModel(options.model);

  // Always downscale/recompress before leaving this process — large camera
  // originals are the main trigger for serialize/parse stack blow-ups.
  let prepared;
  try {
    prepared = await prepareVisionImageDataUrl(options.imageDataUrl);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error(
        'Reference image is too large to prepare for vision. Upload a smaller image.',
        { cause: error }
      );
    }
    // Fall back to the raw payload if sharp rejects an exotic format.
    const split = extractBase64FromDataUrl(options.imageDataUrl);
    prepared = {
      imageDataUrl: options.imageDataUrl,
      mimeType: split.mimeType,
      base64: split.base64,
      width: 0,
      height: 0,
      bytes: Buffer.byteLength(split.base64, 'base64'),
      resized: false,
    };
  }

  if (isOllamaBaseUrl(baseUrl)) {
    try {
      return await ollamaNativeVisionCompletionWithFallback({
        baseUrl,
        apiKey,
        model: visionModel,
        systemPrompt: options.systemPrompt,
        textPrompt: options.textPrompt,
        imageBase64: prepared.base64,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });
    } catch (nativeError) {
      if (nativeError instanceof RangeError) {
        throw nativeError;
      }
      console.warn(
        '[llm-client] Ollama native vision failed, trying OpenAI-compatible endpoint:',
        nativeError instanceof Error ? nativeError.message : nativeError
      );
    }
  }

  return openAiCompatibleChatCompletion({
    baseUrl,
    apiKey,
    model: visionModel,
    messages: [
      { role: 'system', content: options.systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: options.textPrompt },
          { type: 'image_url', image_url: { url: prepared.imageDataUrl } },
        ],
      },
    ],
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    extraBody: { think: false },
  });
}
