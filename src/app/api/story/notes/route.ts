import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { chatCompletion } from '@/lib/llm/client';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
} from '@/lib/llm/request-options';
import { parseStoryNotes, storyNotesMessages } from '@/lib/story/story-outline';

export const runtime = 'nodejs';

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * POST { lead, tone?, beats: [{ title, blurb, line?, replyLine?, narration? }], …llm } →
 * { notes: { logline, synopsis, notes[] } }: a story editor's read of the Story (story-outline.ts).
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
  const beats = (Array.isArray(body.beats) ? body.beats : []).slice(0, 80).map(raw => {
    const beat = (raw ?? {}) as Record<string, unknown>;
    return {
      title: text(beat.title, 160),
      blurb: text(beat.blurb, 600),
      line: text(beat.line, 300),
      replyLine: text(beat.replyLine, 300),
      narration: text(beat.narration, 400),
    };
  });
  if (!beats.length) return apiError('The story has no scenes yet.', 400);
  const llm = parseLlmRequestOptions(body as Parameters<typeof parseLlmRequestOptions>[0]);
  if (!resolveRequestLlmEnabled(llm)) {
    return apiError('Notes need the LLM — turn it on in Settings → LLM.', 503);
  }
  try {
    const reply = await chatCompletion({
      messages: storyNotesMessages({
        lead: text(body.lead, 80),
        tone: text(body.tone, 40) || undefined,
        beats,
      }),
      maxTokens: 900,
      temperature: 0.4,
      model: resolveRequestLlmModel(llm),
      endpoint: resolveRequestLlmEndpoint(llm),
      usageContext: { route: 'story-notes' },
    });
    const notes = parseStoryNotes(reply);
    if (!notes) return apiError('The model did not write notes this time — try again.', 502);
    return apiJson({ notes });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not write the notes.', 502);
  }
}
