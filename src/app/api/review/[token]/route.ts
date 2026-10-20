import { apiError, apiJson } from '@/lib/api/response';
import { addFilmReviewComment, liveFilmReview } from '@/lib/film/review-store';

export const runtime = 'nodejs';

/** Public: the film a review link plays, and its comments (no account needed). */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const review = liveFilmReview(token);
  if (!review) return apiError('This review link has expired or was stopped.', 404);
  return apiJson({
    title: review.title,
    expiresAt: review.expiresAt,
    videoUrl: `/api/review/${encodeURIComponent(token)}/video`,
    comments: review.comments,
  });
}

/** Public: add a comment { name, text, timeSec }. */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  let body: { name?: unknown; text?: unknown; timeSec?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const result = addFilmReviewComment(token, body);
  if (result === 'gone') return apiError('This review link has expired or was stopped.', 404);
  if (result === 'full') return apiError('This link has all the comments it can take.', 409);
  if (result === 'empty') return apiError('Write something first.', 400);
  return apiJson({ comment: result });
}
