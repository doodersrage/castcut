import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fitMeshToMask,
  glbMesh,
  glbTextureViews,
  glbViewBytes,
  matteRoughness,
  paintTextureFromPhoto,
  parseGlb,
  writeGlb,
  type RgbImage,
} from './outfit-3d-paint';

/** A GLB with one quad (two triangles) facing +z, UVs over the whole texture, and two "PNG" views. */
function quadGlb(): Uint8Array {
  const positions = new Float32Array([-0.5, -1, 0, 0.5, -1, 0, 0.5, 1, 0, -0.5, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  // glTF UVs: v down (top of the quad at v = 0).
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const color = new Uint8Array([1, 2, 3]);
  const rough = new Uint8Array([4, 5, 6, 7]);
  const parts = [positions, normals, uvs, indices].map(a => new Uint8Array(a.buffer));
  parts.push(color, rough);
  const bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
  let length = 0;
  for (const part of parts) {
    length += (4 - (length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: part.byteLength });
    length += part.byteLength;
  }
  const bin = new Uint8Array(length + ((4 - (length % 4)) % 4));
  parts.forEach((part, i) => bin.set(part, bufferViews[i]!.byteOffset));
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: 6, type: 'SCALAR' },
    ],
    images: [{ bufferView: 4, mimeType: 'image/png' }, { bufferView: 5, mimeType: 'image/png' }],
    textures: [{ source: 0 }, { source: 1 }],
    materials: [
      { pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 } } },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3 }] }],
  };
  const glb = writeGlb({ json: json as never, bin }, new Map());
  return glb;
}

function solid(width: number, height: number, rgb: [number, number, number]): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) data.set(rgb, i * 3);
  return { data, width, height, channels: 3 };
}

describe('outfit 3D paint', () => {
  it('reads and rewrites a GLB, replacing one view', () => {
    const glb = parseGlb(quadGlb());
    const views = glbTextureViews(glb);
    assert.deepEqual(views, { baseColor: 4, metallicRoughness: 5 });
    assert.deepEqual([...glbViewBytes(glb, 4)], [1, 2, 3]);
    const again = parseGlb(writeGlb(glb, new Map([[4, new Uint8Array([9, 9, 9, 9, 9])]])));
    assert.deepEqual([...glbViewBytes(again, 4)], [9, 9, 9, 9, 9]);
    assert.deepEqual([...glbViewBytes(again, 5)], [4, 5, 6, 7]);
    const mesh = glbMesh(again);
    assert.equal(mesh.positions.length, 12);
    assert.deepEqual([...mesh.indices], [0, 1, 2, 0, 2, 3]);
  });

  it('fits the mesh outline to the mask', () => {
    const mask = new Uint8Array(200 * 200);
    // A 50×100 box at x 75..124, y 50..149 — the quad is 1×2 units.
    for (let y = 50; y < 150; y += 1) for (let x = 75; x < 125; x += 1) mask[y * 200 + x] = 1;
    const mesh = glbMesh(parseGlb(quadGlb()));
    // Dense vertices so the splat covers the outline (the real mesh has ~150k).
    const dense: number[] = [];
    for (let y = -1; y <= 1.0001; y += 0.02) for (let x = -0.5; x <= 0.5001; x += 0.02) dense.push(x, y, 0);
    const fit = fitMeshToMask(new Float64Array(dense), mask, 200, 200);
    assert.ok(fit.iou > 0.8, `iou ${fit.iou}`);
    assert.ok(Math.abs(fit.scale - 50) < 4, `scale ${fit.scale}`);
    assert.equal(mesh.positions.length, 12);
  });

  it('paints the picture onto the front and keeps what it does not show', () => {
    const mesh = glbMesh(parseGlb(quadGlb()));
    const photo = solid(200, 200, [200, 20, 40]);
    const mask = solid(200, 200, [0, 0, 0]);
    // Only the top half of the quad is in the cut-out.
    for (let y = 0; y < 100; y += 1) for (let x = 0; x < 200; x += 1) mask.data.set([255, 255, 255], (y * 200 + x) * 3);
    const texture = solid(64, 64, [60, 30, 20]);
    const result = paintTextureFromPhoto({ mesh, texture, photo, mask });
    const at = (x: number, y: number) => [...result.texture.subarray((y * 64 + x) * 3, (y * 64 + x) * 3 + 3)];
    // Texture top (v = 0) is the quad's top: painted with the picture.
    assert.deepEqual(at(32, 4), [200, 20, 40]);
    assert.ok(result.painted > 0);
  });

  it('lifts roughness toward matte, leaving occlusion and metal', () => {
    const out = matteRoughness({ data: new Uint8Array([10, 100, 30]), width: 1, height: 1, channels: 3 });
    assert.deepEqual([...out], [10, Math.round(0.35 * 100 + 0.65 * 255), 30]);
  });
});
