import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DayPartnerStandIn } from './partner-stand-in';
import { resolveTakePartnerFace, sendTakePartnerFace } from './take-partner-face';
import type { TakePartnerPlan } from './take-plan';

const man = (filename: string): DayPartnerStandIn => ({
  noun: 'man',
  look: 'a man in his thirties with short dark hair',
  filename,
});
const standInPlan = (extra: Partial<Extract<TakePartnerPlan, { kind: 'stand-in' }>> = {}) =>
  ({
    kind: 'stand-in',
    partnerCharacter: null,
    candidate: { name: '', noun: 'man' },
    stranger: null,
    filmKey: 'script-1',
    ...extra,
  }) as TakePartnerPlan;
const lead = {
  id: 'mara',
  name: 'Mara',
  reference: { originalFilename: 'mara-plate.png', isolated: false },
  ipAdapter: { imageFilename: 'mara-face.png' },
} as never;
const never = async () => {
  throw new Error('nothing should be queued');
};

describe('a take’s partner face (take-partner-face.ts)', () => {
  it('the film’s stand-in reused: nothing rendered, the page’s taken up', async () => {
    const film = man('film-face.png');
    const out = await resolveTakePartnerFace({
      plan: standInPlan(),
      filmPartners: { 'script-1': film },
      pageStandIn: null,
      lead,
      stillModel: 'qwen-image-edit-2511',
      sendComfyUi: never,
    });
    assert.deepEqual(out.partnerFace, { filename: 'film-face.png' });
    assert.equal(out.slotPartner?.noun, 'man');
    assert.match(out.slotPartner?.descriptor ?? '', /thirties/);
    assert.equal(out.pageStandIn, film);
    assert.equal(out.filmPartners, undefined, 'the film already has it');
  });

  it('a stranger never takes the page’s partner, and is not kept as it', async () => {
    const page = man('page-face.png');
    let queued = 0;
    const out = await resolveTakePartnerFace({
      plan: standInPlan({ filmKey: '', stranger: { noun: 'man', elderly: true } as never }),
      filmPartners: {},
      pageStandIn: page,
      lead,
      stillModel: 'qwen-image-edit-2511',
      sendComfyUi: async () => {
        queued += 1;
        return 'job-1';
      },
      steps: {
        faceOps: {
          loadBlob: never,
          upload: never,
        },
        // The lead's face lock passes: it is the stand-in's canvas.
        checkReference: async () => ({ status: 'ok', issues: [] }),
        standIn: {
          waitForPromptIds: (async () => [{ status: 'completed' }]) as never,
          resultUrl: () => '/api/comfyui/view?filename=stranger.png&type=output',
          io: {
            loadBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
            upload: async file => ({ filename: file.name }),
            inputExists: async () => true,
          },
        },
      },
    });
    assert.equal(queued, 1, 'the stranger’s own face rendered');
    assert.match(out.partnerFace?.filename ?? '', /^day-partner-man-/);
    assert.equal(out.pageStandIn, undefined);
    assert.equal(out.filmPartners, undefined);
  });

  it('a Cast partner whose face picture fails the check is invented, and the card says why', async () => {
    const partner = {
      id: 'tom',
      name: 'Tom',
      ipAdapter: { imageFilename: 'tom-face.png' },
      reference: { originalFilename: 'tom-plate.png', isolated: false },
    } as never;
    const asked: string[] = [];
    const out = await resolveTakePartnerFace({
      plan: {
        kind: 'cast',
        partnerCharacter: partner,
        character: partner,
        candidate: { name: 'Tom', noun: 'man' },
      },
      filmPartners: {},
      pageStandIn: null,
      lead,
      stillModel: 'qwen-image-edit-2511',
      sendComfyUi: never,
      steps: {
        checkReference: async input => {
          asked.push(`${input.role}:${input.filename}`);
          return input.role === 'face'
            ? { status: 'ok', issues: [] }
            : { status: 'mismatch', issues: [], message: 'That is Mara’s face.' };
        },
      },
    });
    assert.deepEqual(asked, ['face:tom-face.png', 'partner-face:tom-face.png']);
    assert.equal(out.partnerFace, null);
    assert.deepEqual(out.slotPartner, { name: '', noun: 'man', invented: true });
    assert.deepEqual(out.notes, ['That is Mara’s face. This still invents the partner instead.']);
  });

  it('no partner: the plan’s note for the card', async () => {
    const out = await resolveTakePartnerFace({
      plan: { kind: 'none', partnerCharacter: null, note: 'Family never plays a romantic partner.' },
      filmPartners: {},
      pageStandIn: null,
      lead,
      stillModel: 'qwen-image-edit-2511',
      sendComfyUi: never,
    });
    assert.deepEqual(out, {
      slotPartner: null,
      partnerFace: null,
      notes: ['Family never plays a romantic partner.'],
    });
  });
});

describe('the partner face as it goes out (sendTakePartnerFace)', () => {
  const io = (uploads: string[]) => ({
    loadBlob: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }),
    upload: async (file: File) => {
      uploads.push(file.name);
      return { filename: `${file.name}-in-comfy` };
    },
    inputExists: async () => true,
  });

  it('a clothed still: the VL-only copy goes, checked as a face', async () => {
    const uploads: string[] = [];
    const checked: string[] = [];
    const out = await sendTakePartnerFace({
      partnerFace: { filename: 'stand-in.png' },
      adultStill: false,
      slotPartner: { name: '', noun: 'man' },
      partnerCharacter: null,
      lead,
      stillModel: 'qwen-image-edit-2511',
      filmPartners: {},
      pageStandIn: null,
      steps: {
        io: io(uploads),
        checkReference: async input => {
          checked.push(`${input.role}:${input.filename}`);
          return { status: 'ok', issues: [] };
        },
      },
    });
    assert.equal(uploads.length, 1);
    assert.match(uploads[0]!, /^day-partner-vl-/);
    assert.equal(out.filename, `${uploads[0]}-in-comfy`);
    assert.equal(out.url, undefined);
    assert.deepEqual(checked, [`face:${out.filename}`]);
    assert.equal(out.sentFace, undefined, 'a stand-in is no Cast partner');
  });

  it('a stand-in that is no face: left out, and forgotten on the page and in the film', async () => {
    const bad = man('stand-in.png');
    const other = man('other.png');
    const out = await sendTakePartnerFace({
      partnerFace: { filename: 'stand-in.png' },
      adultStill: true,
      slotPartner: { name: '', noun: 'man' },
      partnerCharacter: null,
      lead,
      stillModel: 'qwen-image-edit-2511',
      filmPartners: { 'script-1': bad, 'script-2': other },
      pageStandIn: bad,
      steps: {
        checkReference: async () => ({ status: 'mismatch', issues: [], message: 'No face.' }),
      },
    });
    assert.equal(out.filename, '');
    assert.equal(out.url, undefined);
    assert.match(out.note ?? '', /^No face\. It was left out/);
    assert.equal(out.clearPageStandIn, true);
    assert.deepEqual(out.filmPartners, { 'script-2': other });
  });

  it('a Cast partner’s face on an adult still goes as it is, and is kept as sent', async () => {
    const tom = { id: 'tom', name: 'Tom' } as never;
    const out = await sendTakePartnerFace({
      partnerFace: { filename: 'tom-face.png' },
      adultStill: true,
      slotPartner: { name: 'Tom', noun: 'man' },
      partnerCharacter: tom,
      lead,
      stillModel: 'qwen-image-edit-2511',
      filmPartners: {},
      pageStandIn: null,
      steps: { checkReference: async () => ({ status: 'ok', issues: [] }) },
    });
    assert.equal(out.filename, 'tom-face.png');
    assert.deepEqual(out.sentFace, { partnerId: 'tom', filename: 'tom-face.png' });
  });
});
