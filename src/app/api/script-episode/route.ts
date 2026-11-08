import { apiError, apiJson } from '@/lib/api/response';
import { isNsfwGeneratorEnabledServer } from '@/lib/adult/nsfw-generator-env';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  EPISODE_MINUTES_MAX,
  EPISODE_MINUTES_MIN,
  EPISODE_SCENES_MAX,
  episodeOutlineMessages,
  episodeOutlineTokens,
  episodeLengthScenes,
  normalizeEpisodeScenes,
  episodeSceneMessages,
  normalizeEpisodeHeading,
  parseEpisodeOutline,
  parseEpisodeScene,
  type EpisodeCastMember,
  type EpisodeOutline,
} from '@/lib/day/episode-writer';
import { newCastPartMessages, parseNewCastPart, partCanBeCast } from '@/lib/day/script-new-cast';
import { chatCompletion } from '@/lib/llm/client';
import {
  parseLlmRequestOptions,
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
} from '@/lib/llm/request-options';

export const runtime = 'nodejs';

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

function castFrom(value: unknown): EpisodeCastMember[] {
  return (Array.isArray(value) ? value : [])
    .slice(0, 12)
    .map(raw => (raw ?? {}) as Record<string, unknown>)
    .map(member => ({
      name: text(member.name, 40),
      ...(member.sex === 'woman' || member.sex === 'man' ? { sex: member.sex } : {}),
    }))
    .filter(member => member.name);
}

/** The outline as sent back for a scene, held to what the writer reads. */
function outlineFrom(value: unknown): EpisodeOutline | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : [])
    .slice(0, EPISODE_SCENES_MAX)
    .map(entry => (entry ?? {}) as Record<string, unknown>)
    .map(scene => ({
      heading: normalizeEpisodeHeading(text(scene.heading, 120)),
      summary: text(scene.summary, 600),
      who: (Array.isArray(scene.who) ? scene.who : [])
        .map(name => text(name, 40))
        .filter(Boolean)
        .slice(0, 6),
    }))
    .filter(scene => scene.heading && scene.summary);
  return scenes.length
    ? { title: text(raw.title, 80) || 'Episode', logline: text(raw.logline, 400), scenes }
    : null;
}

/**
 * POST — writing an episode (Part 19 G3, episode-writer.ts), one LLM call a step:
 * - `{ step: 'outline', premise, lead, cast[], minutes, scenes?, tone? }` → `{ outline }` (scenes:
 *   a short's count, over the minutes)
 * - `{ step: 'scene', outline, index, lead, cast[], before?, tone? }` → `{ text }` (Fountain)
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const llm = parseLlmRequestOptions(body as Parameters<typeof parseLlmRequestOptions>[0]);
  if (!resolveRequestLlmEnabled(llm)) {
    return apiError('Writing an episode needs the LLM — turn it on in Settings → LLM.', 503);
  }
  const lead = text(body.lead, 40);
  // Casting a part (step 'part') reads its own lines; writing needs the lead. Asked of every step,
  // Make … Cast was refused every time (it sends no lead; live 2026-11-07).
  if (!lead && body.step !== 'part') return apiError('Pick the Cast lead first.', 400);
  const cast = castFrom(body.cast);
  const tone = text(body.tone, 60) || undefined;
  const call = (messages: ReturnType<typeof episodeOutlineMessages>, maxTokens: number) =>
    chatCompletion({
      messages,
      maxTokens,
      temperature: 0.7,
      model: resolveRequestLlmModel(llm),
      endpoint: resolveRequestLlmEndpoint(llm),
      usageContext: { route: 'script-episode' },
    });
  // Adult writing only where the server allows adult content (PROMPT_NSFW_GENERATOR_ENABLED).
  const adult = body.adult === true;
  if (adult && !isNsfwGeneratorEnabledServer()) {
    return apiError('Adult writing is off on this server (its adult content setting).', 403);
  }
  try {
    if (body.step === 'outline') {
      const premise = text(body.premise, 2000);
      if (!premise) return apiError('Say what the episode is about.', 400);
      const minutes = Math.min(
        EPISODE_MINUTES_MAX,
        Math.max(EPISODE_MINUTES_MIN, Number(body.minutes) || 30)
      );
      // A short from Day asks for its scenes by count (its moments), not minutes.
      const scenes = normalizeEpisodeScenes(body.scenes);
      const outline = parseEpisodeOutline(
        // 3,000 fit 24 scenes; a half hour's 40 ran past it and the outline was cut off.
        await call(
          episodeOutlineMessages({ premise, lead, cast, minutes, scenes, tone, adult }),
          episodeOutlineTokens(episodeLengthScenes({ minutes, scenes }))
        )
      );
      if (!outline)
        return apiError('The model did not write an outline this time — try again.', 502);
      return apiJson({ outline });
    }
    if (body.step === 'scene') {
      const outline = outlineFrom(body.outline);
      const index = Math.round(Number(body.index));
      if (!outline || !Number.isFinite(index) || index < 0 || index >= outline.scenes.length) {
        return apiError('Send the outline and which scene to write.', 400);
      }
      const reply = await call(
        episodeSceneMessages({
          outline,
          index,
          lead,
          cast,
          before: text(body.before, 1200),
          tone,
          adult,
        }),
        1400
      );
      const written = parseEpisodeScene(reply, outline.scenes[index]!.heading);
      if (!written) return apiError('The model did not write that scene — try again.', 502);
      return apiJson({ text: written });
    }
    if (body.step === 'part') {
      // A recurring part made a Cast member (script-new-cast.ts): how they look, from their lines.
      const speaker = text(body.speaker, 60);
      const excerpt = text(body.excerpt, 2000);
      if (!speaker || !excerpt) return apiError('Send the part and its lines.', 400);
      if (!partCanBeCast(speaker)) {
        return apiError('That part is not made a Cast member (a child, or a role).', 400);
      }
      const draft = parseNewCastPart(
        await call(
          newCastPartMessages({ speaker, excerpt, title: text(body.title, 120) || undefined }),
          200
        )
      );
      if (!draft) return apiError('The model did not say how they look — try again.', 502);
      return apiJson({ draft });
    }
    return apiError('Say which step: outline, scene or part.', 400);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not write the episode.', 502);
  }
}
