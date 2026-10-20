import { listApiUsage, summarizeApiUsage } from '@/lib/server/api-usage-log';
import { listLlmUsage, summarizeLlmUsage } from '@/lib/llm/usage-log';
import { apiJson } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? '50');
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const llmRecent = listLlmUsage({ since: dayAgo, limit: 500 });
  return apiJson({
    summary: summarizeApiUsage(),
    entries: listApiUsage(Number.isFinite(limit) ? Math.min(200, Math.max(1, limit)) : 50),
    llm: {
      ...summarizeLlmUsage(),
      visionRank24h: llmRecent.filter(entry => entry.route === 'best-of-n-vision-rank').length,
      bestOfNRank24h: llmRecent.filter(entry => entry.route === 'best-of-n-rank').length,
    },
  });
}
