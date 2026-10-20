import { checkForAppUpdate } from '@/lib/app/version';
import { apiJson } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get('force') === '1';
  const result = await checkForAppUpdate({ force });
  return apiJson(result);
}
