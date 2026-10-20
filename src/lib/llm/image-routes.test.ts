import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

type QueueResult = { ok: boolean; status?: number; promptId?: string; engineUrl?: string; error?: string };
let queueLlmImageImpl: (engineId: string, input: unknown) => Promise<QueueResult> = async () => ({
  ok: true,
  promptId: 'p-1',
  engineUrl: 'https://api.openai.com',
});
const queueLlmImage = mock.fn((engineId: string, input: unknown) => queueLlmImageImpl(engineId, input));

type JobStatus = { promptId: string; status: string; statusMessage?: string; engineUrl: string; images?: unknown };
let fetchLlmImageJobStatusImpl: (engineId: string, promptId: string) => Promise<JobStatus> = async (
  _engineId,
  promptId
) => ({ promptId, status: 'completed', engineUrl: 'https://api.openai.com', images: [] });
const fetchLlmImageJobStatus = mock.fn((engineId: string, promptId: string) =>
  fetchLlmImageJobStatusImpl(engineId, promptId)
);

type OutputFile = { bytes: Buffer; mimeType: string } | null;
let ensureLlmImageOutputImpl: (input: unknown) => Promise<OutputFile> = async () => null;
const ensureLlmImageOutput = mock.fn((input: unknown) => ensureLlmImageOutputImpl(input));

const storeLlmEngineUpload = mock.fn((_engineId: string, _input: unknown) => ({
  name: 'stored.png',
  subfolder: '',
  type: 'input',
}));

mock.module('@/lib/llm/image-client', {
  namedExports: { queueLlmImage, fetchLlmImageJobStatus, ensureLlmImageOutput, storeLlmEngineUpload },
});

const isCloudVideoModelId = mock.fn((_id: unknown) => false);
let queueCloudVideoImpl: (engineId: string, input: unknown) => Promise<QueueResult> = async () => ({
  ok: true,
  promptId: 'video-1',
  engineUrl: 'https://api.x.ai',
});
const queueCloudVideo = mock.fn((engineId: string, input: unknown) => queueCloudVideoImpl(engineId, input));
let fetchCloudVideoJobStatusImpl: (engineId: string, promptId: string) => Promise<JobStatus | null> =
  async () => null;
const fetchCloudVideoJobStatus = mock.fn((engineId: string, promptId: string) =>
  fetchCloudVideoJobStatusImpl(engineId, promptId)
);
mock.module('@/lib/cloud/cloud-video-client', {
  namedExports: {
    DEFAULT_GEMINI_VIDEO_MODEL: 'veo-3',
    DEFAULT_GROK_EXTEND_MODEL: 'grok-extend-1',
    DEFAULT_GROK_VIDEO_MODEL: 'grok-video-1',
    isCloudVideoModelId,
    queueCloudVideo,
    fetchCloudVideoJobStatus,
  },
});

const contentTypeForViewBytes = mock.fn((_filename: string, mimeType: string, _bytes: Buffer) => mimeType);
const isHtmlVideoContentType = mock.fn((contentType: string) => contentType.startsWith('video/'));
const isAnimatedImageBytes = mock.fn((_filename: string, _bytes: Buffer) => false);
mock.module('@/lib/comfyui/outputs', {
  namedExports: { contentTypeForViewBytes, isHtmlVideoContentType, isAnimatedImageBytes },
});

const sanitizeComfyViewFilename = mock.fn((raw: string) => {
  if (!raw.trim()) {
    throw new Error('filename is required.');
  }
  return raw.trim();
});
const sanitizeComfyViewSubfolder = mock.fn((raw: string) => raw.trim());
mock.module('@/lib/server/url-safety', {
  namedExports: { sanitizeComfyViewFilename, sanitizeComfyViewSubfolder },
});

type ParsedUpload = { file: { arrayBuffer: () => Promise<ArrayBuffer>; type: string } };
let parseEngineUploadRequestImpl: (request: Request) => Promise<ParsedUpload> = async () => ({
  file: { arrayBuffer: async () => new TextEncoder().encode('bytes').buffer, type: 'image/png' },
});
const parseEngineUploadRequest = mock.fn((request: Request) => parseEngineUploadRequestImpl(request));
mock.module('@/lib/engine/upload-parse', { namedExports: { parseEngineUploadRequest } });

function resetMocks() {
  for (const m of [
    queueLlmImage,
    fetchLlmImageJobStatus,
    ensureLlmImageOutput,
    storeLlmEngineUpload,
    isCloudVideoModelId,
    queueCloudVideo,
    fetchCloudVideoJobStatus,
    contentTypeForViewBytes,
    isHtmlVideoContentType,
    isAnimatedImageBytes,
    sanitizeComfyViewFilename,
    sanitizeComfyViewSubfolder,
    parseEngineUploadRequest,
  ]) {
    m.mock.resetCalls();
  }
  queueLlmImageImpl = async () => ({ ok: true, promptId: 'p-1', engineUrl: 'https://api.openai.com' });
  fetchLlmImageJobStatusImpl = async (_engineId, promptId) => ({
    promptId,
    status: 'completed',
    engineUrl: 'https://api.openai.com',
    images: [],
  });
  ensureLlmImageOutputImpl = async () => null;
  queueCloudVideoImpl = async () => ({ ok: true, promptId: 'video-1', engineUrl: 'https://api.x.ai' });
  fetchCloudVideoJobStatusImpl = async () => null;
  parseEngineUploadRequestImpl = async () => ({
    file: { arrayBuffer: async () => new TextEncoder().encode('bytes').buffer, type: 'image/png' },
  });
}
afterEach(resetMocks);

describe('llm-image-routes', async () => {
  const {
    llmImageQueueHandlers,
    llmImageStatusHandlers,
    llmImageViewHandlers,
    llmImageUploadHandlers,
  } = await import('./image-routes');

  function postRequest(url: string, body: unknown): Request {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  describe('llmImageQueueHandlers', () => {
    const handlers = llmImageQueueHandlers('openai');

    it('GET returns 405 method not allowed', async () => {
      const response = handlers.GET();
      assert.equal(response.status, 405);
    });

    it('OPTIONS returns a 204 CORS preflight response', () => {
      const response = handlers.OPTIONS();
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
    });

    it('POST rejects a blank prompt with 400', async () => {
      const response = await handlers.POST(postRequest('http://x/api/openai', { prompt: '  ' }));
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.match(data.error, /Prompt is required/);
    });

    it('POST rejects a video tool request for the openai engine', async () => {
      const response = await handlers.POST(
        postRequest('http://x/api/openai', { prompt: 'a clip', tool: 'video' })
      );
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.match(data.error, /Sora is deprecated/);
    });

    it('POST queues an image job and returns its promptId on success', async () => {
      const response = await handlers.POST(
        postRequest('http://x/api/openai', { prompt: 'a cat', clientId: 'client-1' })
      );
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.ok, true);
      assert.equal(data.promptId, 'p-1');
      assert.equal(data.clientId, 'client-1');
      assert.equal(data.engineId, 'openai');
    });

    it('POST returns an error with a settings href when the failure is a missing API key', async () => {
      queueLlmImageImpl = async () => ({
        ok: false,
        status: 400,
        error: 'OpenAI API key is required.',
      });
      const response = await handlers.POST(postRequest('http://x/api/openai', { prompt: 'a cat' }));
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.match(data.href, /settings/);
    });

    it('POST catches a thrown error and returns a 502', async () => {
      queueLlmImageImpl = () => {
        throw new Error('unexpected failure');
      };
      const response = await handlers.POST(postRequest('http://x/api/openai', { prompt: 'a cat' }));
      assert.equal(response.status, 502);
      const data = await response.json();
      assert.equal(data.error, 'unexpected failure');
    });

    it('POST routes to queueCloudVideo for a non-openai engine video tool request', async () => {
      const grokHandlers = llmImageQueueHandlers('grok');
      const response = await grokHandlers.POST(
        postRequest('http://x/api/grok', { prompt: 'a clip', tool: 'video' })
      );
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.promptId, 'video-1');
      assert.equal(queueCloudVideo.mock.calls.length, 1);
      assert.equal(queueLlmImage.mock.calls.length, 0);
    });
  });

  describe('llmImageStatusHandlers', () => {
    const handlers = llmImageStatusHandlers('openai');

    it('GET requires a promptId query parameter', async () => {
      const response = await handlers.GET(new Request('http://x/api/openai/status'));
      assert.equal(response.status, 400);
    });

    it('GET returns the image job status when no video status is found', async () => {
      const response = await handlers.GET(new Request('http://x/api/openai/status?promptId=p-1'));
      const data = await response.json();
      assert.equal(data.status, 'completed');
      assert.equal(data.engineId, 'openai');
    });

    it('GET prefers a video job status when one is returned', async () => {
      fetchCloudVideoJobStatusImpl = async () => ({
        promptId: 'v-1',
        status: 'running',
        engineUrl: 'https://api.x.ai',
      });
      const response = await handlers.GET(new Request('http://x/api/openai/status?promptId=v-1'));
      const data = await response.json();
      assert.equal(data.status, 'running');
      assert.equal(fetchLlmImageJobStatus.mock.calls.length, 0);
    });

    it('POST returns 405 method not allowed', async () => {
      const response = handlers.POST();
      assert.equal(response.status, 405);
    });
  });

  describe('llmImageViewHandlers', () => {
    const handlers = llmImageViewHandlers('openai');

    it('GET returns 400 for an invalid filename', async () => {
      sanitizeComfyViewFilename.mock.mockImplementationOnce(() => {
        throw new Error('bad filename');
      });
      const response = await handlers.GET(new Request('http://x/api/openai/view?filename='));
      assert.equal(response.status, 400);
    });

    it('GET returns 404 when the output is not cached', async () => {
      const response = await handlers.GET(
        new Request('http://x/api/openai/view?filename=x.png&subfolder=')
      );
      assert.equal(response.status, 404);
    });

    it('GET returns the raw bytes with the resolved content type when cached', async () => {
      ensureLlmImageOutputImpl = async () => ({ bytes: Buffer.from('image-bytes'), mimeType: 'image/png' });
      const response = await handlers.GET(
        new Request('http://x/api/openai/view?filename=x.png&subfolder=')
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Type'), 'image/png');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString(), 'image-bytes');
    });

    it('GET catches a thrown error from ensureLlmImageOutput and returns 502', async () => {
      ensureLlmImageOutputImpl = () => {
        throw new Error('cache blew up');
      };
      const response = await handlers.GET(
        new Request('http://x/api/openai/view?filename=x.png&subfolder=')
      );
      assert.equal(response.status, 502);
    });

    it('POST returns 405 method not allowed', async () => {
      const response = handlers.POST();
      assert.equal(response.status, 405);
    });
  });

  describe('llmImageUploadHandlers', () => {
    const handlers = llmImageUploadHandlers('openai');

    it('GET returns 405 method not allowed', async () => {
      const response = handlers.GET();
      assert.equal(response.status, 405);
    });

    it('OPTIONS returns a 204 CORS preflight response', () => {
      const response = handlers.OPTIONS();
      assert.equal(response.status, 204);
    });

    it('POST stores the uploaded bytes and returns the stored reference', async () => {
      const response = await handlers.POST(new Request('http://x/api/openai/upload', { method: 'POST' }));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.name, 'stored.png');
      assert.equal(data.engineUrl, 'https://api.openai.com');
    });

    it('POST returns 400 for a validation-style error message (e.g. "required")', async () => {
      parseEngineUploadRequestImpl = () => {
        throw new Error('Image file is required.');
      };
      const response = await handlers.POST(new Request('http://x/api/openai/upload', { method: 'POST' }));
      assert.equal(response.status, 400);
    });

    it('POST returns 502 for a non-validation error message', async () => {
      parseEngineUploadRequestImpl = () => {
        throw new Error('Something else broke');
      };
      const response = await handlers.POST(new Request('http://x/api/openai/upload', { method: 'POST' }));
      assert.equal(response.status, 502);
    });
  });
});
