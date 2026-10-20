export function extractShortTopic(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return 'the scene';
  }

  const firstSegment = trimmed.split(/[,;|]+/)[0]?.trim() || trimmed;
  if (firstSegment.length <= 48) {
    return firstSegment.toLowerCase();
  }

  const words = firstSegment.split(/\s+/).slice(0, 5).join(' ');
  return words.toLowerCase();
}

const MAX_JSON_ARTIFACT_CHARS = 200_000;

export function stripPromptArtifacts(raw: string): string {
  try {
    return stripPromptArtifactsUnsafe(raw);
  } catch (error) {
    if (error instanceof RangeError) {
      return String(raw ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8_000);
    }
    throw error;
  }
}

function stripPromptArtifactsUnsafe(raw: string): string {
  let text = raw.trim();
  if (!text) {
    return text;
  }

  // Fast-path for short prompts with no artifacts to strip — skip JSON parse and heavy regexes entirely.
  if (
    text.length < 80 &&
    !text.includes('"prompt"') &&
    !text.startsWith('{') &&
    !text.startsWith('<|') &&
    !text.includes('\`\`\`')
  ) {
    // Only run the lightest post-processing for very short clean texts.
    text = text
      .replace(/^\s*["'`"''']+|["'`"''']+\s*$/g, '')
      .replace(/\\n/g, ' ')
      .replace(/\\t/g, ' ')
      .trim();
    // Still cheap even on short strings (a handful of regex replaces), and
    // without it a short "Target model: X. ..." / "FLUX.2 Klein: ..." leak
    // sails through this fast path untouched.
    text = stripModelDirectiveLeaks(text);
    return stripThinkingArtifacts(text);
  }

  // Bound pathological LLM dumps before regex / JSON work — deep JSON.parse
  // and some RegExp paths throw RangeError: Maximum call stack size exceeded.
  if (text.length > MAX_JSON_ARTIFACT_CHARS) {
    text = text.slice(0, MAX_JSON_ARTIFACT_CHARS);
  }

  try {
    // Avoid [\s\S]*? over huge brace soups — scan for "prompt" instead.
    if (text.startsWith('{') && text.includes('"prompt"')) {
      const promptKey = text.indexOf('"prompt"');
      const afterKey = text.slice(promptKey + '"prompt"'.length);
      const valueMatch = afterKey.match(/^\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (valueMatch?.[1]) {
        text = valueMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\t/g, ' ').trim();
      }
    }
  } catch {
    // ignore catastrophic regex failures on hostile dumps
  }

  try {
    text = text.replace(/^```(?:[\w-]+)?\s*\n?([\s\S]*?)```$/m, '$1').trim();
  } catch {
    // keep text
  }

  if (text.length <= 50_000 && text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text) as { prompt?: unknown; text?: unknown };
      const candidate =
        typeof parsed.prompt === 'string'
          ? parsed.prompt
          : typeof parsed.text === 'string'
            ? parsed.text
            : null;
      if (candidate) {
        text = candidate.trim();
      }
    } catch {
      // keep original text (incl. RangeError on deeply nested JSON)
    }
  }

  text = text
    .replace(/<\|im_start\|>[\s\S]*?(<\|im_end\|>|<\|redacted_im_end\|>)\s*/gi, '')
    .replace(/<\|im_start\|>[\s\S]*$/gi, '')
    .replace(
      /<\|(?:im_end|redacted_im_end|vision_start|vision_end|image_pad|redacted_start_header_id|redacted_end_header_id)\|>/gi,
      ''
    )
    .replace(
      /^Describe the image by detailing the color, shape, size, texture, quantity, text, spatial relationships of the objects and background:\s*/i,
      ''
    )
    .replace(/^Describe the key features of the input image[^:]*:\s*/i, '')
    .replace(/^(?:system|user|assistant)\s*/i, '')
    .replace(/^"{3}\s*|"{3}\s*$/g, '')
    .replace(/"{3}/g, '')
    .replace(/^'{3}\s*|'{3}\s*$/g, '')
    .trim();

  text = stripFormatToolPreambles(text);
  text = stripModelDirectiveLeaks(text);

  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').trim();
    if (next === text) {
      break;
    }
    text = next;
  }

  text = text
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  text = stripThinkingArtifacts(text);

  return text;
}

/** Strip LLM meta labels like "the prompt adapted for Qwen-Image-2512:" from format-tool output. */
function stripFormatToolPreambles(text: string): string {
  let cleaned = text.trim();
  if (!cleaned) {
    return cleaned;
  }

  const preamblePatterns = [
    FLUX_KLEIN_LABEL_LEAD,
    /^(?:(?:here(?:'s| is)\s+(?:the\s+)?)?)(?:the\s+)?(?:prompt\s+)?(?:adapted|formatted|rewritten|converted|optimized)\s+(?:prompt\s+)?(?:for\s+).+?\.\s+(?=[A-Z])/i,
    /^(?:adapted|formatted|rewritten|converted|optimized)\s+(?:prompt\s+)?(?:for\s+).+?\.\s+(?=[A-Z])/i,
    /^(?:here(?:'s| is)|adapted prompt|formatted prompt|positive prompt|negative prompt|output|prompt|result)\s*:?\s*/i,
    /^adapt this draft for.+?\.\s+(?=[A-Z])/i,
    /^draft to adapt:\s*-{2,}\s*/i,
  ];

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const pattern of preamblePatterns) {
      const next = cleaned.replace(pattern, '').trim();
      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  return cleaned.replace(/\s*-{2,}\s*$/g, '').trim();
}

/** Known model-label echoes (labels contain dots — avoid naive [^.] patterns). */
const FLUX_KLEIN_LABEL_LEAD =
  /^(?:(?:target model|the prompt adapted for|adapted for|formatted for|written for):\s*)?FLUX\.2\s+Klein(?:\s+\d+B)?(?:\s+(?:Base|Distilled))?(?:\s+in ComfyUI(?:\s*\([^)]*\))?)?\.\s*/i;

const FLUX_KLEIN_ORPHAN_LEAD = /^(?:\d+\s+)?Klein(?:\s+\d+B)?(?:\s+(?:Base|Distilled))?\.\s*/i;

export function stripModelDirectiveLeaks(text: string): string {
  let cleaned = text.trim();
  if (!cleaned) {
    return cleaned;
  }

  for (let pass = 0; pass < 3; pass += 1) {
    const before = cleaned;
    cleaned = cleaned
      .replace(FLUX_KLEIN_LABEL_LEAD, '')
      .replace(FLUX_KLEIN_ORPHAN_LEAD, '')
      .replace(/^target model:\s*.+?\.\s+(?=[A-Z])/i, '')
      .replace(
        /^FLUX\.(?:1|2)(?:\.\d+)?(?:\s+Klein(?:\s+\d+B)?(?:\s+(?:Base|Distilled))?)?(?:\s+in ComfyUI(?:\s*\([^)]*\))?)?\s*[:.]\s*/i,
        ''
      )
      .replace(/^Qwen(?:-Image)?[^:.\n]{0,48}(?:\s+in ComfyUI(?:\s*\([^)]*\))?)?\s*[:.]\s*/i, '')
      .replace(/^write (?:exactly )?\d+[^.!?]*[.!?]\s+/i, '')
      .replace(
        /^(?:for|using|with|on|in)\s+FLUX\.2\s+Klein(?:\s+\d+B)?(?:\s+(?:Base|Distilled))?[,:]\s*/i,
        ''
      );
    if (cleaned === before) {
      break;
    }
  }

  return cleaned.trim();
}

function looksLikePromptProse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 40) {
    return false;
  }

  if (/^(?:a\s+)?thinking process:/i.test(trimmed)) {
    return false;
  }

  if (/^\d+\.\s*\*\*/.test(trimmed)) {
    return false;
  }

  if (
    /\b(?:Analyze User Input|Character direction|Style seed|Scene seed|Need to merge|matching .* rules)\b/i.test(
      trimmed
    )
  ) {
    return false;
  }

  if (/^\*\*[^*]+\*\*:?\s*[-*•]/.test(trimmed)) {
    return false;
  }

  // Never call looksLikeUnrepairedVisionReasoning here — that helper used to
  // call back into looksLikePromptProse (checklist path) and overflow the stack.
  if (looksLikeVisionChecklist(trimmed)) {
    return false;
  }

  if (/^(?:wait(?:,\s*)?|let me|check(?:ing)? if|i need to)\b/i.test(trimmed)) {
    return false;
  }

  if (VISION_ORDINAL_LABEL.test(trimmed)) {
    return false;
  }

  if (isIncompleteVisionFragment(trimmed)) {
    return false;
  }

  if (
    /^(?:so|the first sentence|i(?:'ll| will)|let me)\b/i.test(trimmed) &&
    /\b(?:should be|needs to be|must be|will be|start with|write)\b/i.test(trimmed)
  ) {
    return false;
  }

  return true;
}

function stripLeadingNumberedAnalysisSteps(text: string): string {
  let cleaned = text.trim();
  const stepPattern = /^\d+\.\s*\*\*[^*]+\*\*:?\s*/;

  while (stepPattern.test(cleaned)) {
    const nextStep = cleaned.search(/\n\s*\d+\.\s*\*\*/);
    if (nextStep > 0) {
      cleaned = cleaned.slice(nextStep).trim();
      continue;
    }

    if (
      /\b(?:Analyze User Input|Character direction|Style seed|Scene seed|Need to merge|matching .* rules)\b/i.test(
        cleaned
      )
    ) {
      return '';
    }

    break;
  }

  return cleaned.trim();
}

function extractPromptProseAfterAnalysis(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/);
  for (let index = 0; index < parts.length; index += 1) {
    const candidate = parts.slice(index).join(' ').trim();
    if (looksLikePromptProse(candidate)) {
      return candidate;
    }
  }

  return '';
}

export function stripThinkingArtifacts(text: string): string {
  let cleaned = text.trim();
  if (!cleaned) {
    return cleaned;
  }

  cleaned = cleaned.replace(/^[\s\S]*?<\/think>\s*/i, '').trim();

  const finalMarkers = [
    /\*\*(?:Final(?:\s+Prompt)?|Output|Draft(?:\s+Prompt)?|Scene(?:\s+Description)?|Prompt)(?::\*\*|\*\*:?)\s*/gi,
    /(?:^|\n)(?:Final prompt|Output prompt|Scene description):\s*/gi,
  ];

  for (const marker of finalMarkers) {
    const matches = [...cleaned.matchAll(marker)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const rest = cleaned.slice(last.index! + last[0].length).trim();
      if (rest.length >= 30) {
        cleaned = rest;
        break;
      }
    }
  }

  if (
    /^(?:a\s+)?thinking process:/i.test(cleaned) ||
    /^\d+\.\s*\*\*(?:Analyze|Plan|Merge|Draft)/i.test(cleaned)
  ) {
    const prose = extractPromptProseAfterAnalysis(cleaned);
    cleaned = prose || '';
  }

  cleaned = cleaned.replace(/^(?:a\s+)?thinking process:\s*/i, '');
  cleaned = stripLeadingNumberedAnalysisSteps(cleaned);
  cleaned = cleaned.replace(
    /^[-*•]\s*(?:Character direction|Style seed|Scene seed|Framing):[^.!?]*[.!?]?\s*/gi,
    ''
  );

  return cleaned.replace(/\s+/g, ' ').trim();
}

export function isThinkingOnlyArtifact(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  if (/^(?:a\s+)?thinking process:/i.test(trimmed)) {
    return true;
  }

  if (/^\d+\.\s*\*\*(?:Analyze|Plan|Merge|Draft)/i.test(trimmed)) {
    return true;
  }

  if (/\*\*Analyze User Input:\*\*/i.test(trimmed)) {
    return true;
  }

  if (
    /\b(?:Character direction|Style seed|Scene seed):\s*"/i.test(trimmed) &&
    !looksLikePromptProse(trimmed)
  ) {
    return true;
  }

  if (looksLikeUnrepairedVisionReasoning(trimmed)) {
    return true;
  }

  return false;
}

const VISION_ORDINAL_LABEL =
  /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d{1,2})(?:st|nd|rd|th)?\s*[:\.)]\s*/i;

export function isIncompleteVisionFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  if (VISION_ORDINAL_LABEL.test(trimmed)) {
    return true;
  }

  if (
    !/[.!?]$/.test(trimmed) &&
    /\b(includes?|should be|need to|check if|let me|the user wants|location context)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }

  if (!/[.!?]$/.test(trimmed) && trimmed.length < 100 && /^["']/.test(trimmed)) {
    return true;
  }

  return false;
}

function parseNumberedVisionItems(text: string): string[] {
  const normalized = normalizeAsciiQuotes(text).replace(/\s+/g, ' ');
  const parts = normalized.split(
    /\s*(?=(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d{1,2})(?:st|nd|rd|th)?\s*[:\.)]\s*)/i
  );

  const values: string[] = [];
  for (const part of parts) {
    const match = part.match(
      /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d{1,2})(?:st|nd|rd|th)?\s*[:\.)]\s*(.+)$/i
    );
    if (!match?.[1]) {
      continue;
    }

    const value = match[1]
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/[,.;]+$/, '')
      .trim();
    if (value.length >= 8) {
      values.push(value);
    }
  }

  return values;
}

function composeFromNumberedVisionItems(text: string): string | null {
  const items = parseNumberedVisionItems(text);
  if (items.length < 2) {
    return null;
  }

  const phrases = items.map(item => item.replace(/[.!?]+$/, '').trim()).filter(Boolean);
  if (phrases.length < 2) {
    return null;
  }

  return capitalizeSentence(`${phrases.join(', ')}.`);
}

function stripVisionNumberedReasoning(text: string): string {
  const composed = composeFromNumberedVisionItems(text);
  if (composed && !isIncompleteVisionFragment(composed)) {
    return composed;
  }

  if (VISION_ORDINAL_LABEL.test(text.trim())) {
    const remainder = text.trim().replace(VISION_ORDINAL_LABEL, '').trim();
    if (remainder.length >= 40 && !isIncompleteVisionFragment(remainder)) {
      return finalizeVisionPromptFragment(remainder);
    }
    return '';
  }

  return text;
}

const VISION_REASONING_LEAD =
  /^(?:wait(?:,\s*)?|let me(?:\s+\w+){0,5}|i(?:'ll| will)?(?:\s+\w+){0,4}|check(?:ing)?(?:\s+\w+){0,8}|okay(?:,\s*)?|now(?:,\s*)?)[^.!?]*[.!?]\s*/i;

const VISION_META_WRAPPER =
  /^(?:so(?:,\s*)?|therefore(?:,\s*)?|thus(?:,\s*)?|okay(?:,\s*)?|now(?:,\s*)?|next(?:,\s*)?|then(?:,\s*)?)?(?:the )?(?:first sentence|prompt|output|description|result)?[^:]{0,140}?(?:should be|needs to be|must be|will be|would be|could be|is going to be|i(?:'ll| will) (?:write|use|start with|begin with))[^:]{0,140}:\s*/i;

const VISION_META_SENTENCE =
  /^(?:so|therefore|thus|okay|now|next|then|the first sentence|i(?:'ll| will)|let me)\b[^.!?]*(?:should be|needs to be|must be|will be|would be|has to be|start with|begin with|write)\b[^.!?]*[.!?]\s*/i;

function capitalizeSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function stripVisionReasoningLead(text: string): string {
  let cleaned = text.trim();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = cleaned.replace(VISION_REASONING_LEAD, '').trim();
    if (next === cleaned) {
      break;
    }
    cleaned = next;
  }
  return cleaned;
}

function extractQuotedPromptFragment(text: string): string | null {
  const normalized = normalizeAsciiQuotes(text.trim());
  const closedQuotes = [...normalized.matchAll(/"([^"]{15,})"/g)].map(match => match[1]!.trim());
  if (closedQuotes.length > 0) {
    return closedQuotes.at(-1)!;
  }

  const openQuote = normalized.match(/:\s*"([^"]{15,})$/);
  if (openQuote?.[1]) {
    return openQuote[1].trim();
  }

  const leadingQuote = normalized.match(/^"([^"]{15,})$/);
  if (leadingQuote?.[1]) {
    return leadingQuote[1].trim();
  }

  return null;
}

function finalizeVisionPromptFragment(text: string): string {
  let cleaned = normalizeAsciiQuotes(text.trim())
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return cleaned;
  }

  if (!/[.!?]$/.test(cleaned)) {
    cleaned = `${cleaned}.`;
  }

  return capitalizeSentence(cleaned);
}

function extractPromptAfterMetaColon(rest: string): string {
  const text = normalizeAsciiQuotes(rest.trim());
  if (!text) {
    return text;
  }

  if (text.startsWith('"') && text.endsWith('"') && text.slice(1, -1).trim().length > 0) {
    return text.slice(1, -1).trim();
  }

  return text.replace(/^"([^"]*)"\s*/, '$1 ').trim();
}

function stripVisionMetaInstruction(text: string): string {
  const cleaned = normalizeAsciiQuotes(text.trim());
  if (!cleaned) {
    return cleaned;
  }

  const wrapperMatch = cleaned.match(VISION_META_WRAPPER);
  if (wrapperMatch) {
    const rest = cleaned.slice(wrapperMatch[0].length).trim();
    const tail = extractPromptAfterMetaColon(rest);
    if (tail.length >= 40 && !looksLikeUnrepairedVisionReasoning(tail)) {
      return finalizeVisionPromptFragment(tail);
    }

    const quoted = extractQuotedPromptFragment(rest);
    if (quoted && quoted.length >= 60) {
      return finalizeVisionPromptFragment(quoted);
    }
    if (rest.length >= 40 && !looksLikeUnrepairedVisionReasoning(rest)) {
      return finalizeVisionPromptFragment(extractPromptAfterMetaColon(rest));
    }
  }

  if (
    /^(?:so|the first sentence|i(?:'ll| will)|let me)\b/i.test(cleaned) &&
    /\b(?:should be|needs to be|must be|will be|start with|write)\b/i.test(cleaned) &&
    cleaned.includes(':')
  ) {
    const rest = cleaned.slice(cleaned.indexOf(':') + 1).trim();
    const tail = extractPromptAfterMetaColon(rest);
    if (tail.length >= 40) {
      return finalizeVisionPromptFragment(tail);
    }
  }

  const embeddedQuote = extractQuotedPromptFragment(cleaned);
  if (
    embeddedQuote &&
    embeddedQuote.length >= 60 &&
    /\b(?:should be|needs to be|must be|will be|start with|write|location context)\b/i.test(cleaned)
  ) {
    return finalizeVisionPromptFragment(embeddedQuote);
  }

  return cleaned;
}

function looksLikeVisionChecklist(text: string): boolean {
  const labels = text.match(/(?:^|[.!?]\s+|,\s*)(?:The\s+)?[A-Za-z][^:,.!?]{0,55}:\s/g) ?? [];
  return labels.length >= 2;
}

function looksLikeUnrepairedVisionReasoning(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (/^(?:wait(?:,\s*)?|let me|check(?:ing)? if|i need to)\b/i.test(trimmed)) {
    return true;
  }

  if (VISION_META_WRAPPER.test(trimmed) || VISION_META_SENTENCE.test(trimmed)) {
    return true;
  }

  if (VISION_ORDINAL_LABEL.test(trimmed)) {
    return true;
  }

  if (isIncompleteVisionFragment(trimmed)) {
    return true;
  }

  if (
    /^(?:so|the first sentence|i(?:'ll| will)|let me)\b/i.test(trimmed) &&
    /\b(?:should be|needs to be|must be|will be|start with|write)\b/i.test(trimmed)
  ) {
    return true;
  }

  // Do not call looksLikePromptProse here — it calls this helper and used to
  // mutual-recurse on checklist-shaped model output (Refine prompt crash).
  if (looksLikeVisionChecklist(trimmed)) {
    return true;
  }

  return false;
}

type VisionChecklistItem = { label: string; value: string };

function parseVisionChecklistItems(text: string): VisionChecklistItem[] {
  const normalized = text
    .replace(/\bis visible\b/gi, '')
    .replace(/\bare visible\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const chunks = normalized
    .split(/(?<=[.!?])\s+|,\s+(?=(?:The\s+)?[A-Za-z][^:]{0,40}:)/)
    .map(part => part.trim())
    .filter(Boolean);

  const items: VisionChecklistItem[] = [];

  for (const chunk of chunks) {
    const colonIndex = chunk.indexOf(':');
    if (colonIndex <= 0) {
      continue;
    }

    const label = chunk
      .slice(0, colonIndex)
      .replace(/^the\s+/i, '')
      .trim()
      .toLowerCase();
    const value = chunk
      .slice(colonIndex + 1)
      .trim()
      .replace(/[,.;]+$/, '')
      .trim();

    if (label && value) {
      items.push({ label, value });
    }
  }

  return items;
}

function normalizeAsciiQuotes(text: string): string {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function composePromptFromVisionChecklist(items: VisionChecklistItem[]): string {
  // Single-pass reduce → build a label-keyed lookup so every field is resolved in O(N) instead of O(N×15).
  const labelMap = new Map<string, VisionChecklistItem>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Collapse the first matching alias into a single canonical key.
    let key: string | undefined;
    if (
      /^pose$/.test(item.label) ||
      /action/.test(item.label) ||
      /activity/.test(item.label) ||
      /movement/.test(item.label)
    ) {
      key = '__pose__';
    } else if (
      /^clothing$/.test(item.label) ||
      /^outfit$/.test(item.label) ||
      /^attire$/.test(item.label) ||
      /^wardrobe$/.test(item.label)
    ) {
      key = '__clothingGeneric__';
    } else if (
      /^lighting$/.test(item.label) ||
      /^light$/.test(item.label) ||
      /^illumination$/.test(item.label)
    ) {
      key = '__lighting__';
    } else if (
      /^background$/.test(item.label) ||
      /^setting$/.test(item.label) ||
      /^environment$/.test(item.label) ||
      /^location$/.test(item.label) ||
      /^scene$/.test(item.label)
    ) {
      key = '__background__';
    } else if (
      /color of the top/.test(item.label) ||
      /top color/.test(item.label) ||
      /^top$/.test(item.label) ||
      /^shirt$/.test(item.label) ||
      /upper body/.test(item.label)
    ) {
      key = '__topColor__';
    } else if (
      /shirt.*text/.test(item.label) ||
      /text on/.test(item.label) ||
      /print/.test(item.label) ||
      /logo/.test(item.label) ||
      /slogan/.test(item.label)
    ) {
      key = '__shirtText__';
    } else if (
      /^shorts$/.test(item.label) ||
      /^pants$/.test(item.label) ||
      /^jeans$/.test(item.label) ||
      /bottoms/.test(item.label)
    ) {
      key = '__bottoms__';
    } else if (
      /^shoes$/.test(item.label) ||
      /^footwear$/.test(item.label) ||
      /^sneakers$/.test(item.label)
    ) {
      key = '__shoes__';
    } else if (/^hair$/.test(item.label) || /hairstyle/.test(item.label)) {
      key = '__hair__';
    } else if (/^expression$/.test(item.label) || /facial expression/.test(item.label)) {
      key = '__expression__';
    } else if (
      /^subject$/.test(item.label) ||
      /^person$/.test(item.label) ||
      /^woman$/.test(item.label) ||
      /^man$/.test(item.label) ||
      /^girl$/.test(item.label) ||
      /^boy$/.test(item.label)
    ) {
      key = '__subject__';
    }

    if (key && !labelMap.has(key)) {
      labelMap.set(key, item);
    }
  }

  const pose = labelMap.get('__pose__')?.value;
  const clothingGeneric = labelMap.get('__clothingGeneric__')?.value;
  const lighting = labelMap.get('__lighting__')?.value;
  const background = labelMap.get('__background__')?.value;
  const topColor = labelMap.get('__topColor__')?.value;
  const shirtText = labelMap.get('__shirtText__')?.value;
  const bottoms = labelMap.get('__bottoms__')?.value;
  const shoes = labelMap.get('__shoes__')?.value;
  const hair = labelMap.get('__hair__')?.value;
  const expression = labelMap.get('__expression__')?.value;
  const subject = labelMap.get('__subject__')?.value;

  const clothing: string[] = [];
  if (topColor || shirtText) {
    let detail = '';
    if (shirtText) {
      const normalizedShirt = normalizeAsciiQuotes(shirtText);
      const graphicMatch = normalizedShirt.match(/\bwith the graphic\s*\(([^)]+)\)/i);
      const graphic = graphicMatch?.[1]?.trim();
      const quoted =
        normalizedShirt
          .match(/["']([^"']+)["']/)?.[1]
          ?.trim()
          .replace(/[,.]+$/, '') ??
        normalizedShirt
          .replace(/\bwith the graphic\s*\([^)]+\)/i, '')
          .replace(/^["'`]+|["'`]+$/g, '')
          .trim();

      const detailParts: string[] = [];
      if (quoted) {
        detailParts.push(`"${quoted}" text`);
      }
      if (graphic) {
        detailParts.push(`a ${graphic} graphic`);
      }
      detail = detailParts.join(' and ');
    }

    if (topColor && detail) {
      clothing.push(`${topColor} top with ${detail}`);
    } else if (topColor) {
      clothing.push(`${topColor} top`);
    } else if (detail) {
      clothing.push(`top with ${detail}`);
    }
  }
  if (bottoms) {
    clothing.push(/\b(shorts|pants|jeans)\b/i.test(bottoms) ? bottoms : `${bottoms} shorts`);
  }
  if (shoes) {
    clothing.push(/\b(shoes|sneakers|boots)\b/i.test(shoes) ? shoes : `${shoes} shoes`);
  }

  let lead = subject ?? 'A person';
  if (!/^a(n)?\s/i.test(lead)) {
    lead = /^((?:woman|man|person|girl|boy)\b)/i.test(lead) ? `A ${lead}` : `A ${lead}`;
  }

  const traits: string[] = [];
  if (pose) {
    traits.push(pose.replace(/^[,.\s]+/, '').replace(/[,.]$/, ''));
  }
  if (hair) {
    traits.push(`${hair} hair`);
  }
  if (expression) {
    traits.push(`${expression} expression`);
  }
  if (clothing.length > 0) {
    traits.push(`wearing ${clothing.join(', ')}`);
  } else if (clothingGeneric) {
    traits.push(`wearing ${clothingGeneric}`);
  }

  let sentence = traits.length > 0 ? `${lead}${pose ? ' ' : ', '}${traits.join(', ')}` : lead;

  if (pose && traits.length > 1) {
    sentence = `${lead} ${pose.replace(/^[,.\s]+/, '').replace(/[,.]$/, '')}, ${traits
      .slice(1)
      .join(', ')}`;
  }

  const settingBits = [background, lighting].filter(Boolean);
  if (settingBits.length > 0) {
    sentence = `${sentence.replace(/[.!?]+$/, '')}, ${settingBits.join(', ')}`;
  }

  if (!/[.!?]$/.test(sentence)) {
    sentence = `${sentence}.`;
  }

  return capitalizeSentence(sentence);
}

function trimIncompleteVisionTail(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }

  if (/,\s*[^,.!?]{0,40}$/.test(trimmed) && !looksLikePromptProse(trimmed)) {
    return trimmed.replace(/,\s*[^,.!?]{0,80}$/, '').trim();
  }

  return trimmed;
}

export function repairVisionDraft(text: string): string {
  let cleaned = stripVisionNumberedReasoning(
    stripVisionMetaInstruction(stripVisionReasoningLead(text))
  );
  if (!cleaned) {
    return '';
  }

  cleaned = cleaned
    .replace(/\bis visible\b/gi, '')
    .replace(/\bare visible\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (looksLikeVisionChecklist(cleaned)) {
    const items = parseVisionChecklistItems(cleaned);
    if (items.length >= 2) {
      cleaned = composePromptFromVisionChecklist(items);
    }
  }

  cleaned = trimIncompleteVisionTail(cleaned);
  cleaned = stripVisionMetaInstruction(cleaned);
  cleaned = stripVisionNumberedReasoning(cleaned);
  cleaned = cleaned.replace(/^(?:wait(?:,\s*)?|let me|check(?:ing)? if)[^.!?]*[.!?]\s*/i, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (isIncompleteVisionFragment(cleaned)) {
    return '';
  }

  return cleaned;
}

const VISION_SUBJECT_TERMS =
  /\b(?:woman|man|person|girl|boy|female|male|runner|running|jogging|running woman|walking|standing|sitting|wearing|dressed|hair|face|pose|shirt|top|tank top|shorts|shoes|jacket|hoodie|expression|smiling|looking|holding|arms|legs|figure|character|subject|graphic|printed|logo|slogan|tee|t-shirt|sneakers|denim|athlete|jogger|cyclist|portrait)\b/i;

function splitVisionSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function looksLikeVisionTags(text: string): boolean {
  if (/[.!?]\s/.test(text) && text.split(/[.!?]/).filter(Boolean).length >= 2) {
    return false;
  }

  const parts = text
    .split(/[,;|]+/)
    .map(part => part.trim())
    .filter(Boolean);

  return parts.length >= 3 && parts.every(part => part.split(/\s+/).length <= 8);
}

const VISION_ENVIRONMENT_TERMS =
  /\b(?:architecture|architectural|building|buildings|houses?|homes?|suburban|residential|tree-lined|trees|foliage|sky|clouds|horizon|landscape|neighborhood|streetscape|street surface|lamppost|lampposts|sidewalk|pavement|facade|rooftops?|lawns?|gardens?|scenery|surroundings|background|midground|foreground|parked|vehicles?|cars|fence|fences|mountains?|ocean|beach|sunset|sunrise|overcast|atmospheric|depth layers|street-level|neighbourhood)\b/i;

const VISION_LOCATION_PHRASE =
  /\b(?:on|in|along|at|through)\s+(?:a |an |the )?(?:[\w-]+\s+){0,6}(?:street|road|alley|path|sidewalk|track|trail|beach|park|forest|field|gym|studio|room|hall|kitchen|office|rooftop|neighborhood|neighbourhood)\b(?:\s+[\w-]+){0,4}/i;

const VISION_BRIEF_LOCATION =
  /\b(?:tree-lined|residential|urban|quiet|busy|sunny|shaded)\s+(?:street|road|path|alley|neighborhood|neighbourhood)\b(?:\s+[\w-]+){0,3}/i;

function isPureEnvironmentSentence(sentence: string): boolean {
  return VISION_ENVIRONMENT_TERMS.test(sentence) && !VISION_SUBJECT_TERMS.test(sentence);
}

function extractBriefLocationPhrase(text: string): string | null {
  for (const pattern of [VISION_LOCATION_PHRASE, VISION_BRIEF_LOCATION]) {
    const match = text.match(pattern);
    if (!match?.[0]) {
      continue;
    }

    const phrase = match[0].trim();
    if (phrase.split(/\s+/).length <= 12) {
      return phrase;
    }
  }

  return null;
}

function locationPhraseAlreadyPresent(text: string, phrase: string): boolean {
  const haystack = text.toLowerCase();
  const needle = phrase.toLowerCase().trim();
  if (haystack.includes(needle)) {
    return true;
  }

  const stem = needle.replace(/^(?:on|in|along|at|through)\s+(?:a |an |the )?/i, '');
  return stem.length >= 6 && haystack.includes(stem);
}

function stripEnvironmentClausesFromSentence(sentence: string): string {
  let cleaned = sentence;

  cleaned = cleaned.replace(
    /,\s*(?:with|while|as|where|and(?:\s+also)?)\s+(?:[^,.!?]*(?:background|sky|trees|houses|buildings|streetscape|horizon|neighborhood|landscape|scenery|foliage|architecture|residential|suburban|midground|foreground|surroundings|lamppost|sidewalk|pavement|facade|parked)[^,.!?]*)[.!?]?$/gi,
    ''
  );
  cleaned = cleaned.replace(
    /,\s*(?:[^,.!?]*\b(?:in the background|behind (?:her|him|them|the subject)|under (?:a |the )?(?:blue|clear|cloudy|overcast) sky|beneath (?:a |the )?(?:blue|clear) sky|against (?:a |the )?(?:blue|clear) sky)\b[^,.!?]*)[.!?]?$/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\b(?:with|and)\s+(?:sunny|green|tall|leafy|residential|suburban)\s+(?:houses|homes|trees|foliage|buildings|neighborhood|neighbourhood)[^,.!?]*/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\b(?:houses|homes|buildings|trees|foliage|sky|clouds|horizon|landscape|neighborhood|neighbourhood|streetscape|architecture|scenery|residential area)\s+(?:line|lining|stretch|visible|appear|show|feature|fill)[^,.!?]*/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\b(?:in the background|in the distance|behind (?:her|him|them)|background (?:shows|features|includes)|surrounded by (?:trees|houses|buildings|foliage))[^,.!?]*/gi,
    ''
  );

  return cleaned
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ', ')
    .replace(/,\s*\./g, '.')
    .replace(/,\s+(?=[.!?]|$)/g, '')
    .trim();
}

function appendBriefLocationPhrase(text: string, location: string): string {
  const base = text.replace(/[.!?]\s*$/, '').trim();
  if (!base) {
    return location.endsWith('.') ? location : `${location}.`;
  }

  const suffix = /^(?:on|in|along|at|through)\b/i.test(location) ? location : `on ${location}`;

  return `${base}, ${suffix}.`;
}

function trimProseForSubjectFocus(text: string): string {
  const sentences = splitVisionSentences(text);

  if (sentences.length === 0) {
    return polishImagePromptProse(stripEnvironmentClausesFromSentence(text));
  }

  const hasSubject = sentences.some(sentence => VISION_SUBJECT_TERMS.test(sentence));
  // Environment-first scenes (no person/prop lexicon) keep full wording.
  if (!hasSubject) {
    return polishImagePromptProse(text);
  }

  const pureEnvCount = sentences.filter(isPureEnvironmentSentence).length;
  const dropPureEnvironment = pureEnvCount >= 2;

  const subjectParts: string[] = [];
  const environmentParts: string[] = [];

  for (const sentence of sentences) {
    if (isPureEnvironmentSentence(sentence)) {
      // Keep a lone environment sentence; only drop when env clutter is heavy.
      if (!dropPureEnvironment) {
        subjectParts.push(sentence);
      } else {
        environmentParts.push(sentence);
      }
      continue;
    }

    if (VISION_SUBJECT_TERMS.test(sentence)) {
      subjectParts.push(stripEnvironmentClausesFromSentence(sentence));
      continue;
    }

    environmentParts.push(sentence);
  }

  const location =
    extractBriefLocationPhrase(environmentParts.join(' ')) ?? extractBriefLocationPhrase(text);

  let result = subjectParts.filter(Boolean).join(' ').trim();

  if (!result) {
    const fallback =
      sentences.find(sentence => VISION_SUBJECT_TERMS.test(sentence)) ?? sentences[0] ?? text;
    result = stripEnvironmentClausesFromSentence(fallback);
  }

  if (location && !locationPhraseAlreadyPresent(result, location)) {
    result = appendBriefLocationPhrase(result, location);
  }

  return polishImagePromptProse(result);
}

const VISION_ENVIRONMENT_TAG =
  /\b(?:architecture|building|houses?|homes?|suburban|residential|tree(?:s|-lined)?|foliage|sky|clouds|horizon|landscape|neighborhood|streetscape|lamppost|sidewalk|pavement|facade|rooftops?|scenery|background|midground|foreground|parked|sunset|sunrise|overcast|atmospheric|depth of field|bokeh background|neighbourhood)\b/i;

function isEnvironmentOnlyTag(tag: string): boolean {
  return VISION_ENVIRONMENT_TAG.test(tag) && !VISION_SUBJECT_TERMS.test(tag);
}

function isLocationTag(tag: string): boolean {
  return (
    VISION_LOCATION_PHRASE.test(tag) ||
    VISION_BRIEF_LOCATION.test(tag) ||
    /^(?:tree-lined|residential|urban)\s+(?:street|road|path|alley)/i.test(tag)
  );
}

function trimTagsForSubjectFocus(text: string): string {
  const tags = text
    .split(/[,;|]+/)
    .map(tag => tag.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    return text;
  }

  const subjectTags = tags.filter(tag => !isEnvironmentOnlyTag(tag));
  const locationTags = tags.filter(tag => isLocationTag(tag) && !subjectTags.includes(tag));

  const kept =
    subjectTags.length > 0 ? [...subjectTags] : tags.filter(tag => VISION_SUBJECT_TERMS.test(tag));

  if (kept.length === 0) {
    kept.push(...tags.filter(tag => !isPureEnvironmentSentence(tag)));
  }

  if (locationTags.length > 0 && kept.length > 0) {
    kept.push(locationTags[0]!);
  }

  return kept.join(', ');
}

export function isSubjectPromptBackgroundHeavy(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return false;
  }

  if (looksLikeVisionTags(trimmed)) {
    const envTags = trimmed
      .split(/[,;|]+/)
      .map(tag => tag.trim())
      .filter(tag => isEnvironmentOnlyTag(tag));
    return envTags.length > 1;
  }

  const pureEnvironmentSentences = splitVisionSentences(trimmed).filter(isPureEnvironmentSentence);
  if (pureEnvironmentSentences.length >= 1) {
    return true;
  }

  const envMatches = trimmed.match(
    /\b(?:architecture|building|houses?|homes?|tree(?:s|-lined)?|foliage|sky|clouds|horizon|landscape|neighborhood|streetscape|lamppost|sidewalk|facade|scenery|background|midground|foreground|parked|residential|suburban|sunset|sunrise)\b/gi
  );

  return (envMatches?.length ?? 0) >= 4;
}

export type VisionPromptFocus = 'full' | 'subject' | 'background' | 'style';

export function applyVisionFocusTrim(
  text: string,
  focus: VisionPromptFocus,
  profile?: string
): string {
  const trimmed = text.trim();
  if (!trimmed || focus !== 'subject') {
    return trimmed;
  }

  if (profile === 'sd15_weighted' || looksLikeVisionTags(trimmed)) {
    return trimTagsForSubjectFocus(trimmed);
  }

  return trimProseForSubjectFocus(trimmed);
}

export function visionPromptMinChars(detail: 'concise' | 'balanced' | 'rich'): number {
  if (detail === 'rich') {
    return 100;
  }
  if (detail === 'concise') {
    return 45;
  }
  return 70;
}

export function visionPromptTargetChars(
  detail: 'concise' | 'balanced' | 'rich',
  maxChars: number
): number {
  const floor = visionPromptMinChars(detail);
  return Math.min(Math.max(floor, Math.floor(maxChars * 0.22)), maxChars);
}

export function isVisionPromptHardFailure(prompt: string, focus: VisionPromptFocus): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 35) {
    return true;
  }

  if (isIncompleteVisionFragment(trimmed)) {
    return true;
  }

  if (focus === 'subject' && !VISION_SUBJECT_TERMS.test(trimmed)) {
    return true;
  }

  return false;
}

export function describeVisionPromptIssue(
  prompt: string,
  focus: VisionPromptFocus,
  detail: 'concise' | 'balanced' | 'rich',
  maxChars: number
): string | null {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return 'empty response';
  }

  if (focus === 'subject' && !VISION_SUBJECT_TERMS.test(trimmed)) {
    return 'missing subject detail (pose, clothing, or identity)';
  }

  if (focus === 'subject' && isSubjectPromptBackgroundHeavy(trimmed)) {
    return 'includes too much background or scenery for subject focus';
  }

  const target = visionPromptTargetChars(detail, maxChars);
  if (trimmed.length < visionPromptMinChars(detail)) {
    return `only ${trimmed.length} characters (minimum ~${visionPromptMinChars(detail)})`;
  }

  if (trimmed.length < target) {
    return `shorter than ideal (${trimmed.length}/${target} chars)`;
  }

  return null;
}

export function isVisionPromptInsufficient(
  prompt: string,
  focus: VisionPromptFocus,
  detail: 'concise' | 'balanced' | 'rich',
  // Accepted for API-shape parity with callers' DetailLimits, but the length floor
  // here is intentionally the fixed per-detail-level visionPromptMinChars(detail),
  // not the caller's limits — flagging in case that divergence is unintentional.
  _limits: { minChars?: number; maxChars: number }
): boolean {
  if (isVisionPromptHardFailure(prompt, focus)) {
    return true;
  }

  if (focus === 'subject' && isSubjectPromptBackgroundHeavy(prompt)) {
    return true;
  }

  return prompt.trim().length < visionPromptMinChars(detail);
}

const EXPANSION_PADDING_FRAGMENTS = [
  'Foreground and background elements read in clear spatial layers under the same light.',
  'Surface color and texture stay consistent across the frame with readable depth.',
  'The main subject remains centered in the midground with supporting details placed left and right.',
  'Lighting stays even enough to preserve shape, material, and any visible text in the scene.',
  'Fine surface textures read clearly in the directional light',
  'The lighting mixes a warm key from camera-left with cooler ambient fill',
  'In the midground, supporting elements settle into layered depth',
  'Material weight grounds the image',
  'The composition holds at a natural eye level with moderate depth of field',
  'Small environmental details in the distance',
];

export function stripExpansionPadding(text: string): string {
  let cleaned = text;
  for (const fragment of EXPANSION_PADDING_FRAGMENTS) {
    cleaned = cleaned.replace(new RegExp(`\\s*${escapeRegExp(fragment)}[^.!?]*[.!?,]?`, 'gi'), '');
  }

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const filtered = sentences.filter(sentence => {
    const lower = sentence.toLowerCase();
    return !EXPANSION_PADDING_FRAGMENTS.some(fragment =>
      lower.includes(fragment.toLowerCase().slice(0, 32))
    );
  });

  return filtered.join(' ').replace(/\s+/g, ' ').trim();
}

function polishImagePromptProse(text: string): string {
  return text
    .replace(/\.,\s*/g, '. ')
    .replace(/\.\s*,/g, '. ')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s+,/g, ', ')
    .replace(/^,\s*/, '')
    .replace(/,\s+(?=[.!?]|$)/g, '')
    .replace(/(\.\s+)([a-z])/g, (_, prefix: string, letter: string) => {
      return `${prefix}${letter.toUpperCase()}`;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSectionEnding(text: string): string {
  const trimmed = text.trim().replace(/[,.;\s]+$/, '');
  if (!trimmed) {
    return '';
  }

  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}.`;
}

function clauseOverlapRatio(clause: string, subjectLower: string): number {
  const words = clause.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  if (words.length === 0) {
    return 0;
  }

  return words.filter(word => subjectLower.includes(word)).length / words.length;
}

function stripRedundantDetailSentences(subject: string, details: string): string {
  const subjectLower = subject.toLowerCase();
  const clauses = details
    .split(/,\s+(?=[A-Za-z])|(?<=[.!?])\s+/)
    .map(clause => clause.trim().replace(/^[.!?]+|[.!?]+$/g, ''))
    .filter(Boolean);

  const unique = clauses.filter(clause => {
    const overlap = clauseOverlapRatio(clause, subjectLower);
    if (overlap < 0.55) {
      return true;
    }

    return /\b(necklace|pendant|earring|tattoo|bracelet|ring|looking|gazing|smiling|facing)\b/i.test(
      clause
    );
  });

  return unique
    .map(clause => (/[.!?]$/.test(clause) ? clause : `${clause}.`))
    .join(' ')
    .trim();
}

const MARKDOWN_SECTION_PATTERN =
  /\*\*(Subject|Setting|Details|Background|Composition|Lighting)(?::\*\*|\*\*:?)\s*/gi;
function flattenMarkdownSections(text: string): string {
  const matches = [...text.matchAll(MARKDOWN_SECTION_PATTERN)];

  if (matches.length === 0) {
    return text
      .replace(MARKDOWN_SECTION_PATTERN, '')
      .replace(/\*\*([^*]+)\*\*:?\s*/g, '$1, ')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^\s*[-*•]\s+/gm, '')
      .replace(/\s*[-*•]\s+/g, ', ');
  }

  const sections: Array<{ label: string; body: string }> = [];
  let subjectBody = '';

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1] ?? '';
    const start = match.index! + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    let body = text.slice(start, end).trim();

    body = body
      .replace(/^[-*•]\s*/gm, '')
      .replace(/\*\*(Woman|Man|Person)(?::\*\*|\*\*:?)\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!body) {
      continue;
    }

    if (/^details$/i.test(label) && subjectBody) {
      body = stripRedundantDetailSentences(subjectBody, body);
      if (!body) {
        continue;
      }
    }

    if (/^subject$/i.test(label)) {
      subjectBody = body;
    }

    sections.push({ label, body });
  }

  return sections
    .map(({ body }) => normalizeSectionEnding(body))
    .filter(Boolean)
    .join(' ');
}

export function stripVisionAnalysisArtifacts(text: string): string {
  let cleaned = repairVisionDraft(text);
  if (!cleaned) {
    return cleaned;
  }

  cleaned = cleaned
    .replace(/^The user wants[^.!?]*(?:[.!?]|(?=\*\*))/i, '')
    .replace(/^This (?:image|photo|picture)[^.!?]*[.!?]\s*/i, '')
    .replace(/^Here(?:'s| is) (?:a |the )?(?:detailed )?(?:description|prompt)[^.!?]*[.!?]\s*/i, '')
    .replace(/^For (?:Qwen|ComfyUI|the target model)[^.!?]*[.!?]\s*/i, '')
    .replace(/^Convert(?:ing)? this image[^.!?]*[.!?]\s*/i, '')
    .replace(
      /^(?:so|therefore|thus|okay|now|next|then|the first sentence)[^.!?]*(?:should be|needs to be|must be|will be|start with|write)[^.!?]*[.!?]\s*/i,
      ''
    )
    .trim();

  cleaned = flattenMarkdownSections(cleaned);

  cleaned = cleaned
    .replace(/\b(Subject|Setting|Details|Background|Composition|Lighting):\s*/gi, '')
    .replace(/\b(Woman|Man|Person):\s*/gi, '')
    .replace(/\s[-*•]\s+\*\*[^*]+\*\*:?\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = stripExpansionPadding(cleaned);
  cleaned = stripMetaInstructions(cleaned);
  cleaned = polishImagePromptProse(cleaned);

  return cleaned;
}

export function stripMetaInstructions(text: string): string {
  return text
    .replace(
      /\b(DISTINCT INDIVIDUALS MODE|GROUPED \/ COUPLE MODE|MANDATORY|DETAIL LEVEL|Target model|PEOPLE \(mandatory\)).*?\./gi,
      ''
    )
    .replace(/\bWrite EXACTLY[^.!?]*[.!?]/gi, '')
    .replace(/\bWrite \d+[^.!?]*characters[^.!?]*[.!?]/gi, '')
    .replace(/\bOptional flavor only[^.!?]*[.!?]/gi, '')
    .replace(/\bPerson [AB] must read as:[^.!?]*[.!?]/gi, '')
    .replace(/\bprompt:\s*/gi, '')
    .replace(/\boutput:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
