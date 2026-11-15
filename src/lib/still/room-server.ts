import 'server-only';

import sharp from 'sharp';
import { visionCompletion } from '../llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from '../llm/request-options';
import type { PictureIo } from '../media/picture-io';
import { resolveVisionModel } from '../vision/model-auto';
import { parseRoomReply, ROOM_COMPARE_PROMPT, type RoomVerdict } from './room';

/** Each side of the pair, as the measured pairs were shown (still/room.ts). */
const SIDE = { width: 640, height: 360 } as const;

/**
 * Server: the take beside its scene's reference, one picture, and the same-room question. Null
 * when the LLM is off, no vision model is set up, a picture can't be read or the reply can't be
 * — no verdict (the check is advisory: nothing waits on it).
 */
export async function askSameRoom(input: {
  io: Pick<PictureIo, 'loadBlob'>;
  referenceUrl: string;
  imageUrl: string;
  llm?: LlmRequestOptions;
}): Promise<RoomVerdict | null> {
  if (!resolveRequestLlmEnabled(input.llm)) return null;
  const model = await resolveVisionModel(input.llm);
  if (!model) return null;
  try {
    const [left, right] = await Promise.all(
      [input.referenceUrl, input.imageUrl].map(async url => {
        const blob = await input.io.loadBlob([url]);
        return sharp(Buffer.from(await blob.arrayBuffer()))
          .resize({ ...SIDE, fit: 'cover' })
          .toBuffer();
      })
    );
    const pair = await sharp({
      create: { width: SIDE.width * 2 + 20, height: SIDE.height, channels: 3, background: '#fff' },
    })
      .composite([
        { input: left!, left: 0, top: 0 },
        { input: right!, left: SIDE.width + 20, top: 0 },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();
    const text = await visionCompletion({
      systemPrompt: '',
      textPrompt: ROOM_COMPARE_PROMPT,
      imageDataUrl: `data:image/jpeg;base64,${pair.toString('base64')}`,
      maxTokens: 200,
      temperature: 0,
      model,
      endpoint: resolveRequestLlmEndpoint(input.llm),
      usageContext: { route: 'room-check' },
    });
    return parseRoomReply(text);
  } catch {
    return null;
  }
}
