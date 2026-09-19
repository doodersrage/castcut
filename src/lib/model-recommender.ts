export type ModelRecommendation = {
  model: string;
  reason: string;
  confidence: number;
};

const RULES: Array<{ pattern: RegExp; model: string; reason: string }> = [
  {
    pattern: /\b(edit|replace|keep the subject|unchanged)\b/i,
    model: 'qwen-image-edit-2511',
    reason: 'Edit-style instruction detected',
  },
  {
    pattern: /\b(rapid aio|qwen aio|phr00t aio|qwen-rapid)\b/i,
    model: 'qwen-rapid-aio-edit',
    reason: 'Rapid AIO checkpoint workflow',
  },
  {
    pattern: /\b(rapid aio sfw|aio sfw)\b/i,
    model: 'qwen-rapid-aio-sfw',
    reason: 'Rapid AIO SFW checkpoint',
  },
  {
    pattern: /\b(rapid aio nsfw edit|aio nsfw edit|rapid edit nsfw)\b/i,
    model: 'qwen-rapid-aio-edit-nsfw',
    reason: 'Rapid AIO NSFW Edit checkpoint',
  },
  {
    pattern: /\b(rapid aio nsfw|aio nsfw)\b/i,
    model: 'qwen-rapid-aio-nsfw',
    reason: 'Rapid AIO NSFW checkpoint',
  },
  {
    pattern: /\b(lightning|lightx2v|fast qwen|4[\s-]?step qwen)\b/i,
    model: 'qwen-image-2512-lightning-4',
    reason: 'Fast Lightning 4-step generation',
  },
  {
    pattern: /\b(8[\s-]?step qwen|qwen lightning 8)\b/i,
    model: 'qwen-image-2512-lightning-8',
    reason: 'Lightning 8-step quality/speed balance',
  },
  {
    pattern: /\b(wan\s*lightning|wan\s*4[\s-]?step|lightning\s*video|fast\s*wan)\b/i,
    model: 'wan-video-lightning-4',
    reason: 'WAN Video Lightning 4-step (CFG-1 optimized)',
  },
  {
    pattern:
      /\b(wan\s*rapid|phr00t\s*wan|wan\s*aio|rapid\s*aio\s*wan|wan\s*all[\s-]?in[\s-]?one)\b/i,
    model: 'wan-video-rapid-aio',
    reason: 'WAN Video Phr00t Rapid AIO (CFG-1 optimized)',
  },
  {
    pattern: /\b(wan\s*video|video\s*motion|camera\s*move|i2v|t2v|image[\s-]?to[\s-]?video)\b/i,
    model: 'wan-video',
    reason: 'WAN Video — preferred for people and complex motion',
  },
  {
    pattern: /\b(duo|two people|couple|sport|team)\b/i,
    model: 'sdxl',
    reason: 'Multi-person or sport scene',
  },
  {
    pattern: /\b(ultrareal|ultra[\s-]?real|danrisi)\b/i,
    model: 'flux-ultrareal-v4',
    reason: 'UltraReal Fine-Tune v4 realism checkpoint',
  },
  {
    pattern: /\b(photoreal|photo[- ]?real|dslr|raw\s+photo|skin pores|candid)\b/i,
    model: 'flux-ultrareal-v4',
    reason: 'Photoreal people/scenes fit UltraReal Fine-Tune v4',
  },
  {
    pattern: /\b(flux|bokeh|lens|35mm)\b/i,
    model: 'flux-2-klein-9b-distilled',
    reason: 'Fast FLUX Klein 9B distilled for photographic prose drafts',
  },
  {
    pattern: /\b(fast flux|klein 4b|lightweight flux|klein distilled)\b/i,
    model: 'flux-2-klein-4b-distilled',
    reason: 'Fast 4B Klein distilled for quick photographic drafts',
  },
  {
    pattern: /\b(klein base|klein fine.?tun)\b/i,
    model: 'flux-2-klein',
    reason: 'Klein base model for flexible multi-step generation',
  },
  {
    pattern: /\b(tag|1girl|masterpiece|best quality)\b/i,
    model: 'sd1.5',
    reason: 'Tag-style brief detected',
  },
  {
    pattern: /\b(fantasy|wizard|dragon|magic)\b/i,
    model: 'sdxl',
    reason: 'Rich fantasy scene prose',
  },
  { pattern: /\b(pet|dog|cat|animal)\b/i, model: 'sdxl', reason: 'Pet-focused descriptive scene' },
];

export function recommendModels(input: string, limit = 3): ModelRecommendation[] {
  const text = input.trim();
  if (!text) {
    return [{ model: 'sdxl', reason: 'Balanced default for general scenes', confidence: 0.5 }];
  }

  const scores = new Map<string, { reason: string; confidence: number }>();
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      const existing = scores.get(rule.model);
      scores.set(rule.model, {
        reason: rule.reason,
        confidence: (existing?.confidence ?? 0) + 0.35,
      });
    }
  }

  if (scores.size === 0) {
    scores.set('sdxl', { reason: 'General natural-language scene', confidence: 0.55 });
    scores.set('flux-ultrareal-v4', {
      reason: 'UltraReal Fine-Tune v4 for photoreal people/scenes',
      confidence: 0.48,
    });
    scores.set('flux-2-klein-9b-distilled', {
      reason: 'Fast Klein distilled draft alternative',
      confidence: 0.4,
    });
  }

  return [...scores.entries()]
    .map(([model, meta]) => ({
      model,
      reason: meta.reason,
      confidence: Math.min(1, meta.confidence),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}
