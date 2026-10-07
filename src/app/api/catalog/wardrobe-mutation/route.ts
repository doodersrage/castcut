import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { buildCatalogAwareWardrobeMutationClause } from '@/lib/clothing-mutations';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/catalog/wardrobe-mutation');
}

/**
 * The gallery's "change the outfit" variant: pick a catalog outfit for the prompt on the server.
 * The catalog (~500 KB gzipped of generated entries) used to be lazy-loaded into the browser for
 * this one pick.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: unknown;
      value?: unknown;
      hints?: unknown;
      recentClothing?: unknown;
    };
    const text = (value: unknown, max: number) =>
      typeof value === 'string' ? value.slice(0, max) : undefined;
    const prompt = text(body.prompt, 20_000) ?? '';
    const recentClothing = Array.isArray(body.recentClothing)
      ? body.recentClothing
          .filter((id): id is string => typeof id === 'string')
          .map(id => id.slice(0, 200))
          .slice(0, 50)
      : undefined;
    return apiJson(
      buildCatalogAwareWardrobeMutationClause(prompt, text(body.value, 2_000), {
        hints: text(body.hints, 4_000),
        recentClothing,
      })
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Wardrobe pick failed.', 500);
  }
}
