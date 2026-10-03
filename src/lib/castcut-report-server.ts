import 'server-only';

/**
 * Server-only: read a finished job's Castcut report from ComfyUI's history
 * (`outputs[nodeId].castcut`, written by CastcutReport — castcut-nodes.ts).
 */

import { comfyBaseUrl } from '@/lib/comfy-utility-graph-server';
import { parseCastcutBestOfTwoReport, type CastcutBestOfTwoReport } from '@/lib/castcut-nodes';

export async function readCastcutBestOfTwoReport(input: {
  promptId: string;
  comfyUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<CastcutBestOfTwoReport | null> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}/history/${encodeURIComponent(input.promptId)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`ComfyUI history read failed (HTTP ${response.status}).`);
  }
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    { outputs?: unknown }
  > | null;
  return parseCastcutBestOfTwoReport(payload?.[input.promptId]?.outputs);
}
