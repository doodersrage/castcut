import 'server-only';

import { visionCompletion } from '../llm/client';
import { resolveRequestLlmEndpoint, type LlmRequestOptions } from '../llm/request-options';
import { detectPoseInComfyStill } from '../pose/detect-server';
import { resolveVisionModel } from '../vision/model-auto';
import {
  ANATOMY_CROTCH_CROP_PROMPT,
  ANATOMY_GENDER_CROP_PROMPT,
  anatomyPersonsFromPose,
  decideAnatomyFromCrops,
  readCropField,
  type AnatomyCropBox,
  type AnatomyCropRead,
  type AnatomyRead,
} from './anatomy-check';

/**
 * The anatomy crop check (anatomy-check.ts) on one still: the pose from ComfyUI, then each
 * person's face-and-chest and crotch cropped and asked about apart. Null when it can't run (not
 * a ComfyUI image, no pose reader, no vision model, nobody judgeable) — the gate's whole-picture
 * answer stands then. Never throws.
 */
export async function anatomyFromCrops(input: {
  /** The still as a ComfyUI view URL (the pose is read there). */
  imageUrl: string;
  /** The still's bytes (the crops are cut from them). */
  image: Buffer;
  comfyUrl?: string;
  llm?: LlmRequestOptions;
  /** People the gate's vision answer counted: a pose that found fewer is not trusted. */
  peopleInPhoto?: number;
}): Promise<AnatomyRead | null> {
  try {
    const detected = await detectPoseInComfyStill({
      imageUrl: input.imageUrl,
      ...(input.comfyUrl ? { comfyUrl: input.comfyUrl } : {}),
    });
    if (!detected.available) return null;
    const sharp = (await import('sharp')).default;
    const meta = await sharp(input.image).metadata();
    const size = { width: meta.width ?? 0, height: meta.height ?? 0 };
    if (!size.width || !size.height) return null;
    const persons = anatomyPersonsFromPose(detected.pose.people, size);
    if (!persons.length) return null;
    const model = await resolveVisionModel(input.llm);
    if (!model) return null;
    const ask = async (box: AnatomyCropBox, prompt: string) => {
      const crop = await sharp(input.image)
        .extract(box)
        .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 92 })
        .toBuffer();
      return visionCompletion({
        systemPrompt: '',
        textPrompt: prompt,
        imageDataUrl: `data:image/jpeg;base64,${crop.toString('base64')}`,
        maxTokens: 60,
        temperature: 0,
        model,
        endpoint: resolveRequestLlmEndpoint(input.llm),
        usageContext: { route: 'adult-check' },
      });
    };
    const reads: AnatomyCropRead[] = [];
    for (const person of persons) {
      // Only people whose crotch can be judged are asked about (each costs two vision calls).
      if (person.near || !person.inFrame) {
        reads.push({ gender: '', center: '', near: person.near, inFrame: person.inFrame });
        continue;
      }
      const gender = readCropField(await ask(person.faceBox, ANATOMY_GENDER_CROP_PROMPT), 'gender');
      const center = readCropField(
        await ask(person.crotchBox, ANATOMY_CROTCH_CROP_PROMPT),
        'center'
      );
      reads.push({ gender, center, near: false, inFrame: true });
    }
    return decideAnatomyFromCrops(reads, input.peopleInPhoto);
  } catch {
    return null;
  }
}
