import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { loadSettingsCache } from '@/lib/settings-cache';
import { engineDisplayName } from '@/lib/engine/capabilities';
import type { EngineAdapter } from '@/lib/engine/types';
import { resolveQueueInputImage, resolveQueueInputImageFilename } from '@/lib/queue-input-image';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

export type QueueSingleInputsResult = {
  inputImageFilename?: string;
  inputImageFilenames: string[];
  uploadedFigureSize?: { width: number; height: number };
  clipMode?: import('@/lib/video-clip-mode').VideoClipMode;
  parentVideoUrl: string;
  maskImageFilename?: string;
  controlImageFilename?: string;
  controlImageFilenames: string[];
  /** Weighted identity prompt suffix for cloud face-ref (no IP-Adapter). */
  cloudFaceRefPromptInstruction?: string;
};

export async function resolveQueueSingleInputs(input: {
  options?: SendComfyUiOptions;
  queueModel: ComfyImageModel;
  effectiveTool: string;
  cloudEngine: boolean;
  engineAdapter: EngineAdapter;
  setComfyUiStatus: (status: string) => void;
}): Promise<QueueSingleInputsResult> {
  const { options, queueModel, effectiveTool, cloudEngine, engineAdapter, setComfyUiStatus } =
    input;

  let inputImageFilename = options?.inputImageFilename?.trim();
  let uploadedFigureSize: { width: number; height: number } | undefined;
  let sourceImageRef: { name: string; subfolder?: string; type?: string } | undefined =
    inputImageFilename ? { name: inputImageFilename, type: 'input', subfolder: '' } : undefined;
  const uploadedFilenames: string[] = [
    ...(options?.inputImageFilenames ?? []).map(name => name?.trim() ?? ''),
  ];
  while (uploadedFilenames.length < 4) {
    uploadedFilenames.push('');
  }

  if (options?.inputImage || options?.inputImageUrl?.trim()) {
    setComfyUiStatus(cloudEngine ? 'Uploading reference image…' : 'Uploading image to ComfyUI…');
    if (!uploadedFigureSize && options?.inputImage) {
      try {
        const { probeImageFileDimensions } = await import('@/lib/browser-image-dimensions');
        const probed = await probeImageFileDimensions(options.inputImage);
        if (probed) {
          uploadedFigureSize = probed;
        }
      } catch {
        /* optional */
      }
    }
    const uploaded = await resolveQueueInputImage({
      file: options.inputImage,
      filename: options.inputImageFilename,
      imageUrl: options.inputImageUrl,
      model: queueModel,
    });
    inputImageFilename = uploaded?.filename;
    if (uploaded?.filename) {
      sourceImageRef = {
        name: uploaded.filename,
        subfolder: uploaded.subfolder,
        type: uploaded.type ?? 'input',
      };
    }
    if (uploaded?.width && uploaded?.height && uploaded.width > 0 && uploaded.height > 0) {
      uploadedFigureSize = { width: uploaded.width, height: uploaded.height };
    }
    if (inputImageFilename) {
      uploadedFilenames[0] = inputImageFilename;
    }
  } else if (inputImageFilename) {
    uploadedFilenames[0] = inputImageFilename;
  }

  if (!uploadedFigureSize) {
    try {
      const { probeImageFileDimensions, probeImageUrlDimensions } =
        await import('@/lib/browser-image-dimensions');
      if (options?.inputImage) {
        const probed = await probeImageFileDimensions(options.inputImage);
        if (probed) {
          uploadedFigureSize = probed;
        }
      }
      if (!uploadedFigureSize && options?.inputImageUrl?.trim()) {
        const probed = await probeImageUrlDimensions(options.inputImageUrl.trim());
        if (probed) {
          uploadedFigureSize = probed;
        }
      }
    } catch {
      /* optional */
    }
  }

  for (let i = 1; i < 4; i += 1) {
    const file = options?.inputImages?.[i];
    const imageUrl = options?.inputImageUrls?.[i];
    const existing = uploadedFilenames[i]?.trim();
    if (!file && !imageUrl?.trim() && !existing) {
      continue;
    }
    if (!file && !imageUrl?.trim()) {
      // Filename already on Comfy — keep slot without re-upload.
      continue;
    }
    setComfyUiStatus(
      cloudEngine ? `Uploading Figure ${i + 1}…` : `Uploading Figure ${i + 1} to ComfyUI…`
    );
    const uploaded = await resolveQueueInputImageFilename({
      file: file ?? undefined,
      filename: existing || undefined,
      imageUrl: imageUrl?.trim() || undefined,
      model: queueModel,
    });
    if (uploaded) {
      uploadedFilenames[i] = uploaded;
    }
  }

  const inputImageFilenames = uploadedFilenames.map(name => name.trim());
  while (inputImageFilenames.length > 0 && !inputImageFilenames[inputImageFilenames.length - 1]) {
    inputImageFilenames.pop();
  }
  if (!inputImageFilename && inputImageFilenames[0]) {
    inputImageFilename = inputImageFilenames[0];
  }

  const { inferVideoClipMode, falVideoRequiresFirstFrame, cloudNativeExtendEngines } =
    await import('@/lib/video-clip-mode');
  const clipMode =
    effectiveTool === 'video'
      ? inferVideoClipMode({
          clipMode: options?.clipMode,
          hasInitImage: Boolean(inputImageFilename),
        })
      : undefined;
  const parentVideoUrl = options?.videoUrl?.trim() || '';

  if (cloudEngine && effectiveTool === 'video') {
    if (
      engineAdapter.id !== 'fal' &&
      engineAdapter.id !== 'replicate' &&
      engineAdapter.id !== 'grok' &&
      engineAdapter.id !== 'gemini'
    ) {
      throw new Error(
        `${engineDisplayName(engineAdapter.id)} cannot queue clips. Switch the inference engine to Fal, Replicate, Grok, Gemini, Runway, or local WAN.`
      );
    }
    if (clipMode === 'extend' && cloudNativeExtendEngines(engineAdapter.id) && !parentVideoUrl) {
      throw new Error(
        engineAdapter.id === 'grok'
          ? 'Grok extend needs a parent clip URL.'
          : 'Cloud extend needs a public Fal clip URL.'
      );
    }
    if (falVideoRequiresFirstFrame(clipMode ?? 't2v') && !inputImageFilename) {
      throw new Error('Cloud image-to-video needs a first frame.');
    }
    if (
      clipMode === 'extend' &&
      !cloudNativeExtendEngines(engineAdapter.id) &&
      !inputImageFilename
    ) {
      throw new Error(
        `${engineDisplayName(engineAdapter.id)} continue uses last-frame I2V — need a first frame from the parent clip.`
      );
    }
  }

  if (cloudEngine && !inputImageFilename) {
    const { resolveCloudIdentityFallback } = await import('@/lib/cloud-identity-fallback');
    const identity = loadSettingsCache().shared;
    const fallback = resolveCloudIdentityFallback({
      inputImageFilename,
      identityFilename: identity.ipAdapterImageFilename,
      identityUrl: identity.ipAdapterImageUrl,
    });
    if (fallback) {
      setComfyUiStatus('Uploading identity reference…');
      const uploaded = await resolveQueueInputImageFilename({
        filename: fallback.inputImageFilename,
        imageUrl: fallback.imageUrl,
        model: queueModel,
      });
      if (uploaded) {
        inputImageFilename = uploaded;
        uploadedFilenames[0] = uploaded;
      } else if (fallback.inputImageFilename) {
        inputImageFilename = fallback.inputImageFilename;
        uploadedFilenames[0] = fallback.inputImageFilename;
      }
    }
  }

  let cloudFaceRefPromptInstruction: string | undefined;
  if (cloudEngine && options?.identityLock === true) {
    const { buildCloudComposeFaceRefPayload } = await import('@/lib/cloud-compose-refs');
    const { loadEngineSettings } = await import('@/lib/engine-settings');
    const { defaultCloudImg2ImgModel } = await import('@/lib/engine/capabilities');
    const identity = loadSettingsCache().shared;
    const engineSettings = loadEngineSettings();
    const img2imgModel =
      engineAdapter.id === 'fal'
        ? identity.falImg2ImgModel?.trim() ||
          engineSettings.falImg2ImgModel ||
          defaultCloudImg2ImgModel('fal')
        : engineAdapter.id === 'replicate'
          ? identity.replicateImg2ImgModel?.trim() ||
            engineSettings.replicateImg2ImgModel ||
            defaultCloudImg2ImgModel('replicate')
          : defaultCloudImg2ImgModel(engineAdapter.id);

    const sessionFaceName = identity.ipAdapterImageFilename?.trim() || '';
    const sessionFaceUrl = identity.ipAdapterImageUrl?.trim() || '';
    let sessionFaceFilename = '';

    if (sessionFaceName || sessionFaceUrl) {
      setComfyUiStatus('Uploading session face for cloud face-ref…');
      const uploadedFace = await resolveQueueInputImageFilename({
        filename: sessionFaceName || undefined,
        imageUrl: sessionFaceUrl || undefined,
        model: queueModel,
      });
      sessionFaceFilename = uploadedFace || sessionFaceName;
    }

    const faceRef = buildCloudComposeFaceRefPayload({
      enabled: true,
      engine: engineAdapter.id,
      modelId: img2imgModel,
      image1Filename: inputImageFilename,
      sessionFaceFilename,
      extraFilenames: uploadedFilenames.slice(1),
      strength: options.identityLockStrength,
    });
    if (faceRef) {
      cloudFaceRefPromptInstruction = faceRef.promptInstruction;
      inputImageFilenames.length = 0;
      inputImageFilenames.push(...faceRef.filenames);
      while (uploadedFilenames.length < faceRef.filenames.length) {
        uploadedFilenames.push('');
      }
      for (let i = 0; i < faceRef.filenames.length; i += 1) {
        uploadedFilenames[i] = faceRef.filenames[i] ?? '';
      }
      inputImageFilename = faceRef.filenames[0];
    }
  }

  let maskImageFilename = options?.maskImageFilename?.trim();
  if (!cloudEngine && (options?.maskImage || options?.maskImageUrl?.trim())) {
    setComfyUiStatus('Uploading mask to ComfyUI…');
    maskImageFilename = await resolveQueueInputImageFilename({
      file: options.maskImage,
      filename: options.maskImageFilename,
      imageUrl: options.maskImageUrl,
      model: queueModel,
      kind: 'mask',
      originalRef: sourceImageRef,
    });
  }

  let controlImageFilename = options?.controlImageFilename?.trim();
  const controlUploaded: string[] = [
    ...(options?.controlImageFilenames ?? []).map(name => name?.trim() ?? ''),
  ];
  while (controlUploaded.length < 4) {
    controlUploaded.push('');
  }
  if (!cloudEngine && (options?.controlImage || options?.controlImageUrl?.trim())) {
    setComfyUiStatus('Uploading control image to ComfyUI…');
    controlImageFilename = await resolveQueueInputImageFilename({
      file: options.controlImage,
      filename: options.controlImageFilename,
      imageUrl: options.controlImageUrl,
      model: queueModel,
    });
    if (controlImageFilename) {
      controlUploaded[0] = controlImageFilename;
    }
  } else if (controlImageFilename) {
    controlUploaded[0] = controlImageFilename;
  }
  for (let i = 1; i < 4; i += 1) {
    const file = options?.controlImages?.[i];
    const imageUrl = options?.controlImageUrls?.[i];
    const existing = controlUploaded[i]?.trim();
    if (!file && !imageUrl?.trim() && !existing) {
      continue;
    }
    if (!file && !imageUrl?.trim()) {
      continue;
    }
    setComfyUiStatus(`Uploading control image ${i + 1} to ComfyUI…`);
    const uploaded = await resolveQueueInputImageFilename({
      file: file ?? undefined,
      filename: existing || undefined,
      imageUrl: imageUrl?.trim() || undefined,
      model: queueModel,
    });
    if (uploaded) {
      controlUploaded[i] = uploaded;
    }
  }
  const controlImageFilenames = controlUploaded.map(name => name.trim()).filter(Boolean);
  if (!controlImageFilename && controlImageFilenames[0]) {
    controlImageFilename = controlImageFilenames[0];
  }

  return {
    inputImageFilename,
    inputImageFilenames,
    uploadedFigureSize,
    clipMode,
    parentVideoUrl,
    maskImageFilename,
    controlImageFilename,
    controlImageFilenames,
    cloudFaceRefPromptInstruction,
  };
}
