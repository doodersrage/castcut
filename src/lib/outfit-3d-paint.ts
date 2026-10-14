/**
 * Outfit 3D view, the picture painted on (2026-10-14). TRELLIS.2 bakes its own colours and gets
 * them wrong on clothes — a burgundy dress came out leather-brown, skin orange, the face mushy.
 * Here the cut-out picture TRELLIS was given is projected straight onto the model's front
 * (orthographic, fitted to the cut-out's outline), and the parts the camera can't see (back,
 * sides) are colour-corrected: TRELLIS's colours in 16 groups, each shifted by how far it was off
 * where the picture shows it. Live: dress, heels and skin match the picture from every side.
 * The face still suffers when TRELLIS puts strands of hair in front of it.
 *
 * Pure (no image codecs): the server wrapper decodes the pictures and the GLB's PNG textures.
 */

export type RgbImage = { data: Uint8Array; width: number; height: number; channels: number };

type GlbJson = {
  accessors: Array<{
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }>;
  bufferViews: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  buffers: Array<{ byteLength: number }>;
  images?: Array<{ bufferView: number; mimeType?: string }>;
  textures?: Array<{ source: number }>;
  materials?: Array<{
    pbrMetallicRoughness?: {
      baseColorTexture?: { index: number };
      metallicRoughnessTexture?: { index: number };
    };
  }>;
  meshes: Array<{
    primitives: Array<{ attributes: Record<string, number>; indices?: number }>;
  }>;
};

export type Glb = { json: GlbJson; bin: Uint8Array };

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function parseGlb(bytes: Uint8Array): Glb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB file.');
  let offset = 12;
  let json: GlbJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk)) as GlbJson;
    else if (type === CHUNK_BIN) bin = chunk;
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error('The GLB has no JSON or binary chunk.');
  return { json, bin };
}

/** The GLB with some buffer views' bytes replaced (views re-packed, 4-byte aligned). */
export function writeGlb(glb: Glb, replace: Map<number, Uint8Array>): Uint8Array {
  const json = JSON.parse(JSON.stringify(glb.json)) as GlbJson;
  const parts: Uint8Array[] = [];
  let length = 0;
  json.bufferViews.forEach((bufferView, index) => {
    const start = bufferView.byteOffset ?? 0;
    const data = replace.get(index) ?? glb.bin.subarray(start, start + bufferView.byteLength);
    const pad = (4 - (length % 4)) % 4;
    if (pad) {
      parts.push(new Uint8Array(pad));
      length += pad;
    }
    bufferView.byteOffset = length;
    bufferView.byteLength = data.byteLength;
    parts.push(data);
    length += data.byteLength;
  });
  const tail = (4 - (length % 4)) % 4;
  if (tail) {
    parts.push(new Uint8Array(tail));
    length += tail;
  }
  json.buffers[0]!.byteLength = length;
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const total = 12 + 8 + jsonBytes.byteLength + 8 + length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  let at = 20 + jsonBytes.byteLength;
  view.setUint32(at, length, true);
  view.setUint32(at + 4, CHUNK_BIN, true);
  at += 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(glb: Glb, index: number): Float64Array {
  const accessor = glb.json.accessors[index]!;
  const bufferView = glb.json.bufferViews[accessor.bufferView]!;
  const size = COMPONENTS[accessor.type] ?? 1;
  const bytes =
    accessor.componentType === 5126 || accessor.componentType === 5125
      ? 4
      : accessor.componentType === 5123
        ? 2
        : 1;
  const stride = bufferView.byteStride ?? size * bytes;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const out = new Float64Array(accessor.count * size);
  for (let i = 0; i < accessor.count; i += 1) {
    for (let k = 0; k < size; k += 1) {
      const at = base + i * stride + k * bytes;
      out[i * size + k] =
        accessor.componentType === 5126
          ? view.getFloat32(at, true)
          : accessor.componentType === 5125
            ? view.getUint32(at, true)
            : accessor.componentType === 5123
              ? view.getUint16(at, true)
              : view.getUint8(at);
    }
  }
  return out;
}

/** The buffer views of the base colour and metallic-roughness PNGs (first material). */
export function glbTextureViews(glb: Glb): { baseColor: number; metallicRoughness?: number } {
  const pbr = glb.json.materials?.[0]?.pbrMetallicRoughness;
  const viewOf = (textureIndex: number | undefined) => {
    if (textureIndex === undefined) return undefined;
    const source = glb.json.textures?.[textureIndex]?.source;
    return source === undefined ? undefined : glb.json.images?.[source]?.bufferView;
  };
  const baseColor = viewOf(pbr?.baseColorTexture?.index);
  if (baseColor === undefined) throw new Error('The GLB has no base colour texture.');
  const metallicRoughness = viewOf(pbr?.metallicRoughnessTexture?.index);
  return { baseColor, ...(metallicRoughness !== undefined ? { metallicRoughness } : {}) };
}

export function glbViewBytes(glb: Glb, index: number): Uint8Array {
  const bufferView = glb.json.bufferViews[index]!;
  const start = bufferView.byteOffset ?? 0;
  return glb.bin.subarray(start, start + bufferView.byteLength);
}

type Mesh = {
  positions: Float64Array;
  normals: Float64Array;
  uvs: Float64Array;
  indices: Float64Array;
};

export function glbMesh(glb: Glb): Mesh {
  const primitive = glb.json.meshes[0]?.primitives[0];
  if (!primitive || primitive.indices === undefined)
    throw new Error('The GLB has no indexed mesh.');
  const { POSITION, NORMAL, TEXCOORD_0 } = primitive.attributes;
  if (POSITION === undefined || NORMAL === undefined || TEXCOORD_0 === undefined) {
    throw new Error('The GLB mesh lacks positions, normals or UVs.');
  }
  return {
    positions: readAccessor(glb, POSITION),
    normals: readAccessor(glb, NORMAL),
    uvs: readAccessor(glb, TEXCOORD_0),
    indices: readAccessor(glb, primitive.indices),
  };
}

/** Visit the integer pixels inside triangle (a, b, c) with barycentric weights. */
function rasterTriangle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
  center: number,
  visit: (x: number, y: number, w0: number, w1: number, w2: number) => void
) {
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(den) < 1e-12) return;
  const x0 = Math.max(Math.floor(Math.min(ax, bx, cx)), 0);
  const x1 = Math.min(Math.ceil(Math.max(ax, bx, cx)), width - 1);
  const y0 = Math.max(Math.floor(Math.min(ay, by, cy)), 0);
  const y1 = Math.min(Math.ceil(Math.max(ay, by, cy)), height - 1);
  for (let y = y0; y <= y1; y += 1) {
    const py = y + center;
    for (let x = x0; x <= x1; x += 1) {
      const px = x + center;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
      const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      visit(x, y, w0, w1, w2);
    }
  }
}

type Fit = { scale: number; centerX: number; top: number; meshCenterX: number; meshTop: number };

/**
 * Orthographic front fit of the mesh to the cut-out's mask: height to height, centred, then a
 * small search over scale and offset that maximises the outline overlap (vertices splatted at a
 * quarter size — the mesh is dense enough that they cover its outline).
 */
export function fitMeshToMask(
  positions: Float64Array,
  mask: Uint8Array,
  width: number,
  height: number
): Fit & { iou: number } {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) throw new Error('The cut-out mask is empty.');
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]!);
    maxX = Math.max(maxX, positions[i]!);
    minY = Math.min(minY, positions[i + 1]!);
    maxY = Math.max(maxY, positions[i + 1]!);
  }
  const base: Fit = {
    scale: (bottom - top) / (maxY - minY),
    centerX: (left + right) / 2,
    top,
    meshCenterX: (minX + maxX) / 2,
    meshTop: maxY,
  };
  const D = 4;
  const sw = Math.ceil(width / D);
  const sh = Math.ceil(height / D);
  const small = new Uint8Array(sw * sh);
  let maskCount = 0;
  for (let y = 0; y < height; y += D) {
    for (let x = 0; x < width; x += D) {
      if (mask[y * width + x]) {
        small[(y / D) * sw + x / D] = 1;
        maskCount += 1;
      }
    }
  }
  const cover = new Uint8Array(sw * sh);
  let best = { iou: -1, ...base };
  for (let ds = 0.94; ds <= 1.0601; ds += 0.01) {
    for (let dx = -12; dx <= 12; dx += 3) {
      for (let dy = -12; dy <= 12; dy += 3) {
        cover.fill(0);
        const scale = base.scale * ds;
        let both = 0;
        let covered = 0;
        for (let i = 0; i < positions.length; i += 3) {
          const x = Math.round(
            ((positions[i]! - base.meshCenterX) * scale + base.centerX + dx) / D
          );
          const y = Math.round((base.top + dy + (base.meshTop - positions[i + 1]!) * scale) / D);
          if (x < 0 || y < 0 || x >= sw || y >= sh) continue;
          const at = y * sw + x;
          if (cover[at]) continue;
          cover[at] = 1;
          covered += 1;
          if (small[at]) both += 1;
        }
        const iou = both / Math.max(covered + maskCount - both, 1);
        if (iou > best.iou)
          best = { iou, ...base, scale, centerX: base.centerX + dx, top: base.top + dy };
      }
    }
  }
  return best;
}

/** sRGB bytes → 0..1 (no gamma work: picture and texture are both sRGB). */
const unit = (value: number) => value / 255;

/**
 * Paint `photo` (the cut-out TRELLIS saw, `mask` its alpha) onto the base colour texture `texture`
 * (RGB, same layout as the GLB's PNG). Returns the new texture bytes (RGB) and how it went.
 */
export function paintTextureFromPhoto(input: {
  mesh: Mesh;
  texture: RgbImage;
  photo: RgbImage;
  mask: RgbImage;
}): { texture: Uint8Array; iou: number; painted: number } {
  const { mesh, texture, photo } = input;
  const PW = photo.width;
  const PH = photo.height;
  const maskBits = new Uint8Array(PW * PH);
  for (let i = 0; i < PW * PH; i += 1)
    maskBits[i] = input.mask.data[i * input.mask.channels]! > 127 ? 1 : 0;
  const fit = fitMeshToMask(mesh.positions, maskBits, PW, PH);
  const toX = (x: number) => (x - fit.meshCenterX) * fit.scale + fit.centerX;
  const toY = (y: number) => fit.top + (fit.meshTop - y) * fit.scale;

  const { positions, normals, uvs, indices } = mesh;
  const vertexCount = positions.length / 3;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < vertexCount; i += 1) {
    minX = Math.min(minX, positions[i * 3]!);
    maxX = Math.max(maxX, positions[i * 3]!);
    minY = Math.min(minY, positions[i * 3 + 1]!);
    maxY = Math.max(maxY, positions[i * 3 + 1]!);
    minZ = Math.min(minZ, positions[i * 3 + 2]!);
    maxZ = Math.max(maxZ, positions[i * 3 + 2]!);
  }
  const height = maxY - minY;
  const extent = Math.max(maxX - minX, height, maxZ - minZ);

  // Front z-buffer (largest z is nearest; the front view looks down −z).
  const VX = new Float64Array(vertexCount);
  const VY = new Float64Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    VX[i] = toX(positions[i * 3]!);
    VY[i] = toY(positions[i * 3 + 1]!);
  }
  const front = new Float64Array(PW * PH).fill(-Infinity);
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f]!;
    const b = indices[f + 1]!;
    const c = indices[f + 2]!;
    const za = positions[a * 3 + 2]!;
    const zb = positions[b * 3 + 2]!;
    const zc = positions[c * 3 + 2]!;
    rasterTriangle(
      VX[a]!,
      VY[a]!,
      VX[b]!,
      VY[b]!,
      VX[c]!,
      VY[c]!,
      PW,
      PH,
      0,
      (x, y, w0, w1, w2) => {
        const z = w0 * za + w1 * zb + w2 * zc;
        const at = y * PW + x;
        if (z > front[at]!) front[at] = z;
      }
    );
  }

  // The mask shrunk by 3 px: outline pixels mix in the black background.
  const inner = new Uint8Array(PW * PH);
  for (let y = 3; y < PH - 3; y += 1) {
    for (let x = 3; x < PW - 3; x += 1) {
      let all = 1;
      for (let dy = -3; dy <= 3 && all; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          if (!maskBits[(y + dy) * PW + x + dx]) {
            all = 0;
            break;
          }
        }
      }
      inner[y * PW + x] = all;
    }
  }

  // Every texel: its colour from TRELLIS, the picture's colour where the front sees it, a weight.
  const TW = texture.width;
  const TH = texture.height;
  const texelCount = TW * TH;
  const covered = new Uint8Array(texelCount);
  const weight = new Float32Array(texelCount);
  const photoColor = new Float32Array(texelCount * 3);
  const headLine = maxY - 0.14 * height;
  const sample = (px: number, py: number, k: number) => {
    const x0 = Math.min(Math.max(Math.floor(px), 0), PW - 2);
    const y0 = Math.min(Math.max(Math.floor(py), 0), PH - 2);
    const fx = Math.min(Math.max(px - x0, 0), 1);
    const fy = Math.min(Math.max(py - y0, 0), 1);
    const c = photo.channels;
    const p = (x: number, y: number) => unit(photo.data[(y * PW + x) * c + k]!);
    return (
      p(x0, y0) * (1 - fx) * (1 - fy) +
      p(x0 + 1, y0) * fx * (1 - fy) +
      p(x0, y0 + 1) * (1 - fx) * fy +
      p(x0 + 1, y0 + 1) * fx * fy
    );
  };
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f]!;
    const b = indices[f + 1]!;
    const c = indices[f + 2]!;
    rasterTriangle(
      uvs[a * 2]! * TW,
      uvs[a * 2 + 1]! * TH,
      uvs[b * 2]! * TW,
      uvs[b * 2 + 1]! * TH,
      uvs[c * 2]! * TW,
      uvs[c * 2 + 1]! * TH,
      TW,
      TH,
      0.5,
      (x, y, w0, w1, w2) => {
        const at = y * TW + x;
        covered[at] = 1;
        const px = w0 * positions[a * 3]! + w1 * positions[b * 3]! + w2 * positions[c * 3]!;
        const py =
          w0 * positions[a * 3 + 1]! + w1 * positions[b * 3 + 1]! + w2 * positions[c * 3 + 1]!;
        const pz =
          w0 * positions[a * 3 + 2]! + w1 * positions[b * 3 + 2]! + w2 * positions[c * 3 + 2]!;
        const nx = w0 * normals[a * 3]! + w1 * normals[b * 3]! + w2 * normals[c * 3]!;
        const ny = w0 * normals[a * 3 + 1]! + w1 * normals[b * 3 + 1]! + w2 * normals[c * 3 + 1]!;
        const nz = w0 * normals[a * 3 + 2]! + w1 * normals[b * 3 + 2]! + w2 * normals[c * 3 + 2]!;
        const facing = nz / Math.max(Math.hypot(nx, ny, nz), 1e-9);
        // Steep surfaces too (hair strands over the face would keep TRELLIS's colours).
        const w = Math.min(Math.max((facing + 0.15) / 0.3, 0), 1);
        if (w <= 0) return;
        const sx = toX(px);
        const sy = toY(py);
        const ix = Math.min(Math.max(Math.round(sx), 0), PW - 1);
        const iy = Math.min(Math.max(Math.round(sy), 0), PH - 1);
        if (!inner[iy * PW + ix]) return;
        // Seen: nearest surface there — or, on the head, just behind it (the face under a fringe).
        const tau = py > headLine ? 0.03 * height : 0.006 * extent;
        if (front[iy * PW + ix]! - pz >= tau) return;
        weight[at] = w;
        photoColor[at * 3] = sample(sx, sy, 0);
        photoColor[at * 3 + 1] = sample(sx, sy, 1);
        photoColor[at * 3 + 2] = sample(sx, sy, 2);
      }
    );
  }

  // Colour-correct what the picture doesn't show: 16 groups of TRELLIS colour, each shifted by
  // its average difference from the picture where both are known.
  const tc = (at: number, k: number) => unit(texture.data[at * texture.channels + k]!);
  const seen: number[] = [];
  for (let at = 0; at < texelCount; at += 1) if (covered[at] && weight[at]! > 0.8) seen.push(at);
  const K = 16;
  const centers = new Float64Array(K * 3);
  const shift = new Float64Array(K * 3);
  if (seen.length >= K * 50) {
    // Deterministic farthest-point start, so a small distinct colour (red heels) gets its own
    // group instead of joining skin.
    const pool = seen.filter((_, i) => i % 23 === 0);
    const nearest = new Float64Array(pool.length).fill(Infinity);
    let pick = pool[0]!;
    for (let k = 0; k < K; k += 1) {
      for (let j = 0; j < 3; j += 1) centers[k * 3 + j] = tc(pick, j);
      let far = 0;
      for (let i = 0; i < pool.length; i += 1) {
        const at = pool[i]!;
        const d =
          (tc(at, 0) - centers[k * 3]!) ** 2 +
          (tc(at, 1) - centers[k * 3 + 1]!) ** 2 +
          (tc(at, 2) - centers[k * 3 + 2]!) ** 2;
        if (d < nearest[i]!) nearest[i] = d;
        if (nearest[i]! > far) {
          far = nearest[i]!;
          pick = at;
        }
      }
    }
    const label = new Uint8Array(seen.length);
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const sums = new Float64Array(K * 3);
      const counts = new Float64Array(K);
      for (let i = 0; i < seen.length; i += 1) {
        const at = seen[i]!;
        let bestK = 0;
        let bestD = Infinity;
        for (let k = 0; k < K; k += 1) {
          const d =
            (tc(at, 0) - centers[k * 3]!) ** 2 +
            (tc(at, 1) - centers[k * 3 + 1]!) ** 2 +
            (tc(at, 2) - centers[k * 3 + 2]!) ** 2;
          if (d < bestD) {
            bestD = d;
            bestK = k;
          }
        }
        label[i] = bestK;
        counts[bestK] += 1;
        for (let j = 0; j < 3; j += 1) sums[bestK * 3 + j] += tc(at, j);
      }
      for (let k = 0; k < K; k += 1) {
        if (!counts[k]) continue;
        for (let j = 0; j < 3; j += 1) centers[k * 3 + j] = sums[k * 3 + j]! / counts[k]!;
      }
    }
    const diff = new Float64Array(K * 3);
    const counts = new Float64Array(K);
    for (let i = 0; i < seen.length; i += 1) {
      const at = seen[i]!;
      const k = label[i]!;
      counts[k] += 1;
      for (let j = 0; j < 3; j += 1) {
        const d = photoColor[at * 3 + j]! - tc(at, j);
        diff[k * 3 + j] += d;
      }
    }
    for (let k = 0; k < K; k += 1) {
      if (counts[k]! < 50) continue;
      for (let j = 0; j < 3; j += 1) shift[k * 3 + j] = diff[k * 3 + j]! / counts[k]!;
      // At most 0.25: a big shift is texels misregistered at an edge (dark dress → skin), not a
      // colour TRELLIS got wrong.
      const size = Math.hypot(shift[k * 3]!, shift[k * 3 + 1]!, shift[k * 3 + 2]!);
      if (size > 0.25) for (let j = 0; j < 3; j += 1) shift[k * 3 + j] *= 0.25 / size;
    }
  }

  const out = new Uint8Array(texelCount * 3);
  const soft = new Float64Array(K);
  let painted = 0;
  for (let at = 0; at < texelCount; at += 1) {
    const r = tc(at, 0);
    const g = tc(at, 1);
    const b = tc(at, 2);
    if (!covered[at]) {
      out[at * 3] = texture.data[at * texture.channels]!;
      out[at * 3 + 1] = texture.data[at * texture.channels + 1]!;
      out[at * 3 + 2] = texture.data[at * texture.channels + 2]!;
      continue;
    }
    let total = 0;
    for (let k = 0; k < K; k += 1) {
      const d =
        (r - centers[k * 3]!) ** 2 +
        (g - centers[k * 3 + 1]!) ** 2 +
        (b - centers[k * 3 + 2]!) ** 2;
      soft[k] = Math.exp(-d / 0.004);
      total += soft[k]!;
    }
    const w = weight[at]!;
    if (w > 0.5) painted += 1;
    for (let j = 0; j < 3; j += 1) {
      let corrected = j === 0 ? r : j === 1 ? g : b;
      if (total > 1e-12) {
        let s = 0;
        for (let k = 0; k < K; k += 1) s += (soft[k]! / total) * shift[k * 3 + j]!;
        corrected += s;
      }
      corrected = Math.min(Math.max(corrected, 0), 1);
      const value = w * photoColor[at * 3 + j]! + (1 - w) * corrected;
      out[at * 3 + j] = Math.round(Math.min(Math.max(value, 0), 1) * 255);
    }
  }
  // Grow the painted islands 4 texels into the padding (no dark seams under filtering).
  let filled = covered;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = filled.slice();
    for (let y = 0; y < TH; y += 1) {
      for (let x = 0; x < TW; x += 1) {
        const at = y * TW + x;
        if (filled[at]) continue;
        let n = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
            const near = yy * TW + xx;
            if (!filled[near]) continue;
            n += 1;
            r += out[near * 3]!;
            g += out[near * 3 + 1]!;
            b += out[near * 3 + 2]!;
          }
        }
        if (!n) continue;
        out[at * 3] = Math.round(r / n);
        out[at * 3 + 1] = Math.round(g / n);
        out[at * 3 + 2] = Math.round(b / n);
        next[at] = 1;
      }
    }
    filled = next;
  }
  return { texture: out, iou: fit.iou, painted };
}

/**
 * Cloth and skin, not satin: roughness (green) lifted toward matte. TRELLIS's mid roughness made
 * the dress look like leather under the viewer's lights.
 */
export function matteRoughness(image: RgbImage): Uint8Array {
  const out = new Uint8Array(image.width * image.height * 3);
  for (let i = 0; i < image.width * image.height; i += 1) {
    out[i * 3] = image.data[i * image.channels]!;
    out[i * 3 + 1] = Math.round(0.35 * image.data[i * image.channels + 1]! + 0.65 * 255);
    out[i * 3 + 2] = image.data[i * image.channels + 2]!;
  }
  return out;
}
