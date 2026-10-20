import { listServerWorkflowFiles } from '@/lib/comfyui/server-workflows';
import { apiJson } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET() {
  // Omit absolute filesystem paths from the API response.
  const workflows = listServerWorkflowFiles().map(entry => ({
    id: `server:${entry.id}`,
    name: entry.name,
    source: 'server' as const,
  }));

  return apiJson({ workflows });
}
