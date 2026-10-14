import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  createFilmReview,
  listFilmReviews,
  REVIEW_DEFAULT_DAYS,
  revokeFilmReview,
} from '@/lib/film-review-store';
import { readGalleryOriginalFile } from '@/lib/gallery-media-store';

export const runtime = 'nodejs';

/** The owner (null with sign-in off), or a 401 response. */
function owner(request: Request): string | null | Response {
  if (!isAuthEnabled()) return null;
  const user = resolveRequestUser(request);
  return user?.enabled ? user.id : apiError('Sign in required.', 401);
}

/** The owner's review links for a film: GET ?entryId= */
export async function GET(request: Request) {
  const who = owner(request);
  if (who instanceof Response) return who;
  const entryId = new URL(request.url).searchParams.get('entryId')?.trim() || undefined;
  return apiJson({ reviews: listFilmReviews(who, entryId) });
}

/** Make a review link for one of the owner's cut films: { entryId, title, days }. */
export async function POST(request: Request) {
  const who = owner(request);
  if (who instanceof Response) return who;
  let body: { entryId?: unknown; title?: unknown; days?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const entryId = typeof body.entryId === 'string' ? body.entryId.trim() : '';
  if (!entryId) return apiError('entryId is required.', 400);
  // Only a film this account has a kept copy of (the link plays that file).
  if (!readGalleryOriginalFile({ userId: who, entryId })) {
    return apiError('That film has no kept copy on the server to share.', 404);
  }
  const review = createFilmReview({
    entryId,
    ownerId: who,
    title: typeof body.title === 'string' ? body.title : 'A film',
    days: typeof body.days === 'number' ? body.days : REVIEW_DEFAULT_DAYS,
  });
  return apiJson({ review });
}

/** Stop a link: DELETE ?token= */
export async function DELETE(request: Request) {
  const who = owner(request);
  if (who instanceof Response) return who;
  const token = new URL(request.url).searchParams.get('token')?.trim() || '';
  return revokeFilmReview(token, who) ? apiJson({ ok: true }) : apiError('Link not found.', 404);
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST', 'DELETE'], '/api/film/review');
}
