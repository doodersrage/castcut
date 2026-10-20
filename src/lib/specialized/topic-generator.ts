import { buildMandatoryLocationBlock, parseSettingHint } from '../prompt/hint-location';
import { chatCompletion } from '../llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  resolveRequestTemplateFallback,
} from '../llm/request-options';
import { buildTemplateTopicList } from './scene-pools';
import { mergeLocationExclusions } from '../scene/location-exclusions';
import { parseTopicLines } from './topic-list-parse';
import type { TopicGenerateResult, TopicOptions } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildTopicsSystemPrompt(
  count: number,
  options: {
    variety: number;
    seedTopic: string | null;
    settingHint: ReturnType<typeof parseSettingHint>;
    avoidedTokensInstruction?: string;
    strictNumbered?: boolean;
  }
): string {
  if (options.strictNumbered) {
    return `You list image prompt topics for AI art.
- Reply with exactly ${count} numbered lines: 1. through ${count}.
- One short, visually concrete topic phrase per line (about 4–18 words).
- ${
      options.settingHint.location
        ? `Every topic must relate to "${options.settingHint.location}".`
        : options.seedTopic
          ? `Every topic must relate to "${options.seedTopic}".`
          : 'Cover varied genres, moods, and settings.'
    }
- No intro, outro, markdown, or blank lines — only the numbered list.`;
  }

  return `You are a creative topic generator for AI image generation.
- Produce exactly ${count} distinct topic ideas as brief phrases (roughly 4–18 words each).
- Each topic must be visually concrete—settings, subjects, moods, or scenes someone could turn into an image prompt.
- Topics must differ meaningfully; avoid near-duplicates or rephrasings of the same idea.
- ${
    options.settingHint.location
      ? `When a mandatory setting is provided, every topic must take place in or clearly relate to "${options.settingHint.location}". Vary subject, mood, and activity—not the city or environment.`
      : options.seedTopic
        ? `Every topic should relate to, riff on, or expand the seed theme "${options.seedTopic}". Vary angle, setting, mood, era, and subject while staying connected.`
        : 'Cover diverse genres, moods, and settings with no single required theme.'
  }
- Variety level: ${options.variety}/100 (higher = bolder, stranger, more unexpected combinations).
${options.avoidedTokensInstruction ? `- ${options.avoidedTokensInstruction}` : ''}
- Output ONLY the topic lines, one per line. No numbering, bullets, labels, markdown, or blank lines.`;
}

function buildTopicsUserMessage(
  count: number,
  seedTopic: string | null,
  settingHint: ReturnType<typeof parseSettingHint>,
  locationBlock: string,
  strictNumbered?: boolean
): string {
  if (strictNumbered) {
    return [
      locationBlock,
      seedTopic
        ? `Theme: ${settingHint.remainder || seedTopic}\n\nList ${count} numbered image topics (1.–${count}.) about this theme.`
        : `List ${count} numbered varied image topics (1.–${count}.).`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return [
    locationBlock,
    seedTopic
      ? `Seed theme: ${settingHint.remainder || seedTopic}\n\nWrite ${count} related image topics.`
      : `Write ${count} varied image topics with no seed theme.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function requestTopicsFromLlm(
  options: TopicOptions,
  count: number,
  variety: number,
  seedTopic: string | null,
  settingHint: ReturnType<typeof parseSettingHint>,
  locationBlock: string,
  strictNumbered: boolean
): Promise<string[]> {
  const systemPrompt = buildTopicsSystemPrompt(count, {
    variety,
    seedTopic,
    settingHint,
    avoidedTokensInstruction: options.avoidedTokensInstruction,
    strictNumbered,
  });
  const userMessage = buildTopicsUserMessage(
    count,
    seedTopic,
    settingHint,
    locationBlock,
    strictNumbered
  );

  const content = await chatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    maxTokens: Math.min(1400, count * 56),
    temperature: strictNumbered
      ? 0.65 + variety / 200
      : (options.llm?.temperature ?? 0.72 + variety / 140),
    model: resolveRequestLlmModel(options.llm),
    usageContext: { route: 'topics' },
    endpoint: resolveRequestLlmEndpoint(options.llm),
  });

  return parseTopicLines(content, count);
}

export async function generateTopics(options: TopicOptions): Promise<TopicGenerateResult> {
  const count = clamp(options.count ?? 10, 3, 24);
  const variety = clamp(options.variety ?? 50, 0, 100);
  const seedTopic = options.seedTopic?.trim() || null;
  const settingHint = parseSettingHint(seedTopic ?? undefined);
  const locationBlock = buildMandatoryLocationBlock(settingHint.location);
  const minimum = Math.min(3, count);

  if (resolveRequestLlmEnabled(options.llm)) {
    try {
      let topics = await requestTopicsFromLlm(
        options,
        count,
        variety,
        seedTopic,
        settingHint,
        locationBlock,
        false
      );

      if (topics.length < minimum) {
        topics = await requestTopicsFromLlm(
          options,
          count,
          variety,
          seedTopic,
          settingHint,
          locationBlock,
          true
        );
      }

      if (topics.length >= minimum) {
        return {
          topics,
          provider: 'llm',
          seedTopic,
          count: topics.length,
        };
      }

      throw new Error('LLM returned too few topics.');
    } catch (error) {
      if (!resolveRequestTemplateFallback(options.llm)) {
        throw error instanceof Error ? error : new Error('Topic generation failed.');
      }

      console.warn(
        '[topic-generator] LLM failed, using template fallback:',
        error instanceof Error ? error.message : error
      );
    }
  }

  const topics = buildTemplateTopicList({
    seedTopic: seedTopic ?? undefined,
    count,
    recentLocations: mergeLocationExclusions(options.recentLocations, options.blockedLocations),
    avoidedTokens: options.avoidedTokens,
  });

  return {
    topics,
    provider: 'template',
    seedTopic,
    count: topics.length,
  };
}
