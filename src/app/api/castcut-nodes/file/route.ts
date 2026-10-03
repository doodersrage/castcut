import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { apiError } from '@/lib/api/response';
import { CASTCUT_NODES_BUNDLED_VERSION, CASTCUT_NODES_FILE_NAME } from '@/lib/castcut-nodes-setup';

export const runtime = 'nodejs';

/**
 * The Castcut node pack this app ships (comfyui-nodes/castcut/castcut_nodes.py), for the copy
 * commands in Settings → ComfyUI → Castcut nodes (`curl … -o custom_nodes/castcut_nodes.py`).
 * Auth is the proxy's, like every API route. next.config.ts traces the file into standalone builds.
 */
export async function GET() {
  try {
    const source = await readFile(
      path.join(process.cwd(), 'comfyui-nodes', 'castcut', CASTCUT_NODES_FILE_NAME),
      'utf8'
    );
    return new Response(source, {
      headers: {
        'Content-Type': 'text/x-python; charset=utf-8',
        'Content-Disposition': `attachment; filename="${CASTCUT_NODES_FILE_NAME}"`,
        'Cache-Control': 'no-store',
        'X-Castcut-Nodes-Version': CASTCUT_NODES_BUNDLED_VERSION,
      },
    });
  } catch {
    return apiError(
      `${CASTCUT_NODES_FILE_NAME} is not part of this build. Get it from the Castcut repository (comfyui-nodes/castcut/).`,
      404
    );
  }
}
