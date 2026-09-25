/**
 * Contract tests for the Play checks against a fake ComfyUI + fake vision LLM over real HTTP.
 *
 * No GPU or model here, so these don't judge model quality — they pin the wire contract: the
 * graphs we queue pass ComfyUI-style validation (every link points at a real node output of the
 * right type, every required input is set, combo values are allowed), and realistic replies are
 * parsed into the numbers the UI shows. Covers the DWPose read (plate check, Story/Day pose
 * check), FaceAnalysis face match (Outfit Auto-review, Day), the slot review vision call
 * (Outfit Auto-review), and the Look tile-role suggestion.
 */

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { measureFaceMatchInComfy } from './face-match-server';
import { decideTryOnReview } from './fitting-tryon-review';
import { suggestLookTileRole } from './look-tile-role-server';
import { checkLookPlate } from './plate-check';
import { detectPoseInComfyStill } from './pose-detect-server';
import { reviewPlaySlotStill } from './play-slot-review-server';

type NodeDef = {
  input: { required: Record<string, unknown[]>; optional?: Record<string, unknown[]> };
  output: string[];
};

/** object_info as the real packs report it (trimmed to the inputs that matter). */
const NODES: Record<string, NodeDef> = {
  LoadImage: { input: { required: { image: [['placeholder.png'], {}] } }, output: ['IMAGE', 'MASK'] },
  PreviewImage: { input: { required: { images: ['IMAGE'] } }, output: [] },
  PreviewAny: { input: { required: { source: ['*'] } }, output: [] },
  DWPreprocessor: {
    input: {
      required: {
        image: ['IMAGE'],
        detect_hand: [['enable', 'disable'], { default: 'enable' }],
        detect_body: [['enable', 'disable'], { default: 'enable' }],
        detect_face: [['enable', 'disable'], { default: 'enable' }],
        resolution: ['INT', { default: 512 }],
        bbox_detector: [['yolox_l.onnx', 'None'], { default: 'yolox_l.onnx' }],
        pose_estimator: [['dw-ll_ucoco_384.onnx'], { default: 'dw-ll_ucoco_384.onnx' }],
      },
    },
    output: ['IMAGE', 'POSE_KEYPOINT'],
  },
  FaceAnalysisModels: {
    input: {
      required: {
        library: [['insightface', 'dlib'], { default: 'insightface' }],
        provider: [['CPU', 'CUDA', 'ROCM'], { default: 'CPU' }],
      },
    },
    output: ['ANALYSIS_MODELS'],
  },
  FaceEmbedDistance: {
    input: {
      required: {
        analysis_models: ['ANALYSIS_MODELS'],
        reference: ['IMAGE'],
        image: ['IMAGE'],
        similarity_metric: [['L2_norm', 'cosine', 'euclidean'], { default: 'cosine' }],
        filter_thresh: ['FLOAT', { default: 100 }],
        filter_best: ['INT', { default: 0 }],
        generate_image_overlay: ['BOOLEAN', { default: true }],
      },
    },
    output: ['IMAGE', 'FLOAT'],
  },
};

/** A 1024² front-facing portrait in DWPose pixel coordinates (COCO-18, x y confidence). */
function portraitKeypoints(): number[] {
  const points: Array<[number, number] | null> = new Array(18).fill(null);
  points[0] = [512, 300]; // nose
  points[1] = [512, 520]; // neck
  points[2] = [380, 540];
  points[5] = [644, 540];
  points[14] = [470, 270]; // eyes
  points[15] = [554, 270];
  points[16] = [412, 290]; // ears — face ~200px wide
  points[17] = [612, 290];
  return points.flatMap(point => (point ? [point[0], point[1], 0.9] : [0, 0, 0]));
}

/** ComfyUI's own /prompt validation, reduced to what our graphs can get wrong. */
function validateGraph(prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>) {
  for (const [id, node] of Object.entries(prompt)) {
    const def = NODES[node.class_type];
    if (!def) return `node ${id}: unknown class ${node.class_type}`;
    for (const [name, spec] of Object.entries(def.input.required)) {
      const value = node.inputs[name];
      if (value === undefined) return `node ${id} (${node.class_type}): missing ${name}`;
      const type = spec[0];
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
        const source = prompt[value[0]];
        if (!source) return `node ${id}.${name}: link to missing node ${value[0]}`;
        const out = NODES[source.class_type]?.output[value[1] as number];
        if (!out) return `node ${id}.${name}: ${source.class_type} has no output ${value[1]}`;
        if (typeof type === 'string' && type !== '*' && type !== out) {
          return `node ${id}.${name}: expects ${type}, got ${out}`;
        }
      } else if (Array.isArray(type) && name !== 'image' && !type.includes(value)) {
        return `node ${id}.${name}: ${String(value)} not in ${type.join('/')}`;
      }
    }
  }
  return null;
}

type Recorded = {
  graphs: Array<Record<string, { class_type: string; inputs: Record<string, unknown> }>>;
  chats: Array<{ model: string; messages: Array<{ role: string; content: unknown }> }>;
  uploads: number;
};

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk as Buffer));
    request.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** Fake ComfyUI (+ OpenAI-style /v1/chat/completions). `installed` limits object_info. */
function startFake(options: { installed: string[]; chatReply: (system: string) => string }) {
  const recorded: Recorded = { graphs: [], chats: [], uploads: 0 };
  const history = new Map<string, Record<string, unknown>>();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fake');
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith('/object_info/')) {
      const node = decodeURIComponent(url.pathname.slice('/object_info/'.length));
      return options.installed.includes(node) && NODES[node]
        ? json(200, { [node]: NODES[node] })
        : json(200, {});
    }
    if (url.pathname === '/view') {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      return response.end(PNG);
    }
    if (url.pathname === '/upload/image' && request.method === 'POST') {
      await readBody(request);
      recorded.uploads += 1;
      return json(200, { name: `staged-${recorded.uploads}.png`, subfolder: '', type: 'input' });
    }
    if (url.pathname === '/prompt' && request.method === 'POST') {
      const body = JSON.parse((await readBody(request)).toString()) as {
        prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
      };
      const problem = validateGraph(body.prompt);
      if (problem) {
        return json(400, { error: { type: 'prompt_outputs_failed_validation', message: problem } });
      }
      recorded.graphs.push(body.prompt);
      const id = `p${recorded.graphs.length}`;
      const outputs: Record<string, unknown> = {};
      for (const [nodeId, node] of Object.entries(body.prompt)) {
        if (node.class_type === 'DWPreprocessor') {
          outputs[nodeId] = {
            openpose_json: [
              JSON.stringify([
                {
                  people: [{ pose_keypoints_2d: portraitKeypoints() }],
                  canvas_width: 1024,
                  canvas_height: 1024,
                },
              ]),
            ],
          };
        }
        if (node.class_type === 'PreviewAny') {
          outputs[nodeId] = { text: ['0.28'] };
        }
      }
      history.set(id, { outputs, status: { status_str: 'success', completed: true } });
      return json(200, { prompt_id: id, number: 1 });
    }
    if (url.pathname.startsWith('/history/')) {
      const id = decodeURIComponent(url.pathname.slice('/history/'.length));
      const entry = history.get(id);
      return json(200, entry ? { [id]: entry } : {});
    }
    if (url.pathname === '/history' && request.method === 'POST') {
      await readBody(request);
      return json(200, {});
    }
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      const body = JSON.parse((await readBody(request)).toString()) as Recorded['chats'][number];
      recorded.chats.push(body);
      const system = String(body.messages.find(message => message.role === 'system')?.content ?? '');
      return json(200, {
        choices: [{ message: { role: 'assistant', content: options.chatReply(system) } }],
      });
    }
    json(404, { error: 'not found' });
  });
  return { server, recorded };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const STILL = '/api/comfyui/view?filename=still.png&subfolder=&type=output';
const IMAGE_DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;

describe('Play checks against a fake ComfyUI + vision LLM', () => {
  const full = startFake({
    installed: Object.keys(NODES),
    chatReply: system =>
      /one word/i.test(system)
        ? 'lighting'
        : JSON.stringify({
            faceIntegrity: 5,
            outfitMatch: 2,
            anatomy: 4,
            flags: ['wrong-outfit'],
            note: 'The jacket is missing.',
          }),
  });
  const bare = startFake({ installed: ['LoadImage', 'PreviewImage'], chatReply: () => '' });
  let fullUrl = '';
  let bareUrl = '';
  const savedEnv = {
    base: process.env.LLM_API_BASE_URL,
    vision: process.env.LLM_VISION_MODEL,
    enabled: process.env.LLM_ENABLED,
  };

  before(async () => {
    fullUrl = await listen(full.server);
    bareUrl = await listen(bare.server);
    process.env.LLM_API_BASE_URL = `${fullUrl}/v1`;
    process.env.LLM_VISION_MODEL = 'fake-vl';
    process.env.LLM_ENABLED = 'true';
  });

  after(() => {
    full.server.close();
    bare.server.close();
    for (const [key, value] of [
      ['LLM_API_BASE_URL', savedEnv.base],
      ['LLM_VISION_MODEL', savedEnv.vision],
      ['LLM_ENABLED', savedEnv.enabled],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('reads a pose with DWPose and the plate check passes a clear portrait', async () => {
    const result = await detectPoseInComfyStill({ imageUrl: STILL, comfyUrl: fullUrl });
    assert.equal(result.available, true);
    if (!result.available) return;
    assert.equal(result.pose.people.length, 1);
    const graph = full.recorded.graphs.at(-1)!;
    const detector = Object.values(graph).find(node => node.class_type === 'DWPreprocessor')!;
    // Body only — hands and face off, as buildDetectorInputs pins.
    assert.equal(detector.inputs.detect_body, 'enable');
    assert.equal(detector.inputs.detect_hand, 'disable');
    const check = checkLookPlate({ people: result.pose.people, width: 1024, height: 1024 });
    assert.equal(check.status, 'good');
    assert.equal(check.facePx, 200);
  });

  it('measures face match with FaceAnalysis (cosine) and passes validation', async () => {
    const result = await measureFaceMatchInComfy({
      referenceUrl: '/api/comfyui/view?filename=plate.png&subfolder=&type=input',
      imageUrl: STILL,
      comfyUrl: fullUrl,
    });
    assert.equal(result.available, true);
    if (!result.available) return;
    assert.equal(result.metric, 'cosine');
    assert.ok(Math.abs(result.similarity - 0.72) < 1e-9);
    // The try-on review turns that into the Compare card line.
    assert.deepEqual(decideTryOnReview({ imageUrl: 'x', faceMatch: result.similarity }).notes, []);
  });

  it('suggests a Look tile role from the vision model', async () => {
    const role = await suggestLookTileRole({ imageDataUrl: IMAGE_DATA_URL });
    assert.equal(role, 'lighting');
    const chat = full.recorded.chats.at(-1)!;
    assert.equal(chat.model, 'fake-vl');
    // The vision client re-encodes to JPEG before sending — any inline image counts.
    assert.match(JSON.stringify(chat.messages), /data:image\/(png|jpeg);base64/);
  });

  it('parses the slot review the Outfit Auto-review sends', async () => {
    const report = await reviewPlaySlotStill({
      imageDataUrl: IMAGE_DATA_URL,
      context: { outfit: 'aqua sweater dress', expectedPeople: 1 },
    });
    assert.equal(report.outfitMatch, 2);
    const review = decideTryOnReview({ imageUrl: 'x', faceMatch: 0.72, report });
    assert.equal(review.status, 'warn');
    assert.deepEqual(review.notes, ["outfit doesn't match the kit (2/5)"]);
  });

  it('the fake validates like ComfyUI (so a passing graph means something)', () => {
    assert.match(
      String(
        validateGraph({
          '1': { class_type: 'FaceAnalysisModels', inputs: { library: 'insightface', provider: 'CPU' } },
          '2': { class_type: 'PreviewImage', inputs: { images: ['1', 0] } },
        })
      ),
      /expects IMAGE, got ANALYSIS_MODELS/
    );
    assert.match(
      String(validateGraph({ '1': { class_type: 'PreviewImage', inputs: {} } })),
      /missing images/
    );
    assert.match(
      String(
        validateGraph({
          '1': { class_type: 'FaceAnalysisModels', inputs: { library: 'mediapipe', provider: 'CPU' } },
        })
      ),
      /not in insightface\/dlib/
    );
  });

  it('reports the checks off (never throws) when the node packs are missing', async () => {
    const pose = await detectPoseInComfyStill({ imageUrl: STILL, comfyUrl: bareUrl });
    assert.equal(pose.available, false);
    const face = await measureFaceMatchInComfy({
      referenceUrl: STILL,
      imageUrl: STILL,
      comfyUrl: bareUrl,
    });
    assert.equal(face.available, false);
    assert.equal(bare.recorded.graphs.length, 0);
  });
});
