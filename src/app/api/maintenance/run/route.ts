import { apiError, apiJson } from '@/lib/api/response';
import { runServerUserMaintenance } from '@/lib/server/server-user-maintenance';

export const runtime = 'nodejs';

export async function POST() {
  if (process.env.SERVER_USER_MAINTENANCE !== 'true') {
    return apiError('Set SERVER_USER_MAINTENANCE=true to enable.', 400);
  }

  try {
    const result = await runServerUserMaintenance();
    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Maintenance failed.', 500);
  }
}
