import { readOutfitModel } from '@/lib/outfit-3d-store-server';

export const runtime = 'nodejs';

/** A painted outfit model (GLB) kept by /api/outfit-3d. */
export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const bytes = await readOutfitModel(name);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'model/gltf-binary',
      'Content-Length': String(bytes.byteLength),
      // Named by content: never changes.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
