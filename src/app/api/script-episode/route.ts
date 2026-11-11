import { apiError, apiJson } from '@/lib/api/response';
import { isNsfwGeneratorEnabledServer } from '@/lib/adult/nsfw-generator-env';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  EPISODE_MINUTES_MAX,
  EPISODE_MINUTES_MIN,
  EPISODE_SCENES_MAX,
  episodeCritiqueMessages,
  episodeOutlineMessages,
  episodeOutlineTokens,
  episodeLengthScenes,
  normalizeEpisodeScenes,
  episodeSceneMessages,
  episodeReviseMessages,
  episodeStoryNoteMessages,
  normalizeEpisodeHeading,
  parseEpisodeCritique,
  parseEpisodeOutline,
  parseEpisodeScene,
  type EpisodeCastMember,
  type EpisodeOutline,
} from '@/lib/day/episode-writer';
import { newCastPartMessages, parseNewCastPart, partCanBeCast } from '@/lib/day/script-new-cast';
import { chatCompletion } from '@/lib/llm/client';
import { WRITER_EDIT_CHARS } from '@/lib/day/writer-edits';
import {
  parseLlmRequestOptions,
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveWriterLlmModel,
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
      ...(text(member.about, 320) ? { about: text(member.about, 320) } : {}),
    }))
    .filter(member => member.name);
}

/** A scene of the writer's the person rewrote (writer-edits.ts), held to its length. */
function editFrom(value: unknown): { written: string; kept: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const written = text(raw.written, WRITER_EDIT_CHARS);
  const kept = text(raw.kept, WRITER_EDIT_CHARS);
  return written && kept && written !== kept ? { written, kept } : undefined;
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
      model: resolveWriterLlmModel(llm),
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
      // Once more when the reply doesn't read as an outline (a 12B model, ~1 in 10: 2026-11-10).
      let outline: EpisodeOutline | null = null;
      for (let attempt = 0; attempt < 2 && !outline; attempt += 1) {
        outline = parseEpisodeOutline(
          // 3,000 fit 24 scenes; a half hour's 40 ran past it and the outline was cut off.
          await call(
            episodeOutlineMessages({
              premise,
              lead,
              cast,
              minutes,
              scenes,
              tone,
              adult,
              series: text(body.series, 2400) || undefined,
              places: (Array.isArray(body.places) ? body.places : [])
                .map(place => text(place, 60))
                .filter(Boolean)
                .slice(0, 12),
            }),
            episodeOutlineTokens(episodeLengthScenes({ minutes, scenes }))
          )
        );
      }
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
          story: text(body.story, 1600) || undefined,
          tone,
          adult,
          yourEdit: editFrom(body.yourEdit),
        }),
        1400
      );
      const written = parseEpisodeScene(reply, outline.scenes[index]!.heading);
      if (!written) return apiError('The model did not write that scene — try again.', 502);
      return apiJson({ text: written });
    }
    if (body.step === 'note') {
      // The story so far: what this scene made true, for the next ones (2026-11-08).
      const scene = text(body.scene, 8000);
      if (!scene) return apiError('Send the scene.', 400);
      const reply = await call(
        episodeStoryNoteMessages({ scene, story: text(body.story, 1600) || undefined }),
        220
      );
      const note = (reply ?? '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
      return apiJson({ text: note });
    }
    if (body.step === 'critique') {
      // The editor's read of a written scene: notes for the revision, or none.
      const scene = text(body.scene, 8000);
      if (!scene) return apiError('Send the scene.', 400);
      const reply = await call(
        episodeCritiqueMessages({
          scene,
          summary: text(body.summary, 600) || undefined,
          lead,
          cast,
        }),
        300
      );
      return apiJson({ notes: parseEpisodeCritique(reply) });
    }
    if (body.step === 'revise') {
      // A scene rewritten to fix its script notes (script-notes.ts).
      const scene = text(body.scene, 8000);
      const notes = (Array.isArray(body.notes) ? body.notes : [])
        .map(note => text(note, 300))
        .filter(Boolean)
        .slice(0, 6);
      const heading =
        scene
          .split('\n')
          .find(line => line.trim())
          ?.trim() ?? '';
      if (!scene || !notes.length || !heading) {
        return apiError('Send the scene and what to fix.', 400);
      }
      const reply = await call(episodeReviseMessages({ scene, notes, lead, cast, adult }), 1600);
      const written = parseEpisodeScene(reply, normalizeEpisodeHeading(heading));
      if (!written)
        return apiError('The model did not rewrite the scene this time — try again.', 502);
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
    return apiError('Say which step: outline, scene, note, critique, revise or part.', 400);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not write the episode.', 502);
  }
}
