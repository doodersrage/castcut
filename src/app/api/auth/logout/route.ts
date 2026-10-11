import { apiJson } from '@/lib/api/response';
import { clearSessionCookieValue } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return apiJson(
    { ok: true },
    {
      headers: {
        'Set-Cookie': clearSessionCookieValue(request),
      },
    }
  );
}
