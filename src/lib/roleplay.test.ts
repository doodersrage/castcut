import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendRoleplayStoryBeat,
  continueRoleplayScenes,
  extractJsonValue,
  filterFreshRoleplayScenes,
  formatRoleplayAvoidedScenes,
  formatRoleplayStoryDigest,
  mergeRoleplayRejectedScenes,
  mergeRoleplaySceneOptions,
  mergeRoleplayStoryStills,
  normalizeRoleplayTone,
  normalizeRoleplayContent,
  parseRoleplayAllowGore,
  applyRoleplayCharacterName,
  MAX_ROLEPLAY_CHARACTER_NAME,
  normalizeRoleplayCharacterName,
  parseRoleplayBio,
  parseRoleplayBioFromText,
  isRoleplayBioComplete,
  normalizeAvoidedRoleplayNames,
  pickFreshRoleplayName,
  resolveRoleplayLockedCharacterName,
  parseRoleplayScenes,
  patchRoleplayStoryBeat,
  resolveRoleplayPersonaPrompt,
  resolveRoleplayToneAndContent,
  ROLEPLAY_TONES,
  roleplayScenesTooSimilar,
  roleplayToneLine,
  roleplayToneTemperature,
  isRoleplayAdultContent,
  clampRoleplayContentForAdultGate,
  lastRoleplayPlotBeat,
  lastRoleplayStillImage,
  lastCompletedRoleplayStillUrl,
  MAX_ROLEPLAY_STILL_TAKES,
  MAX_ROLEPLAY_CLIP_TAKES,
  MAX_ROLEPLAY_PLOT_BEATS,
  roleplayPlotBeatCount,
  roleplayStoryPhase,
  formatRoleplayStoryProgress,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  resolveRoleplaySetting,
  formatRoleplaySettingCue,
  formatRoleplayWardrobeCue,
  rollRoleplaySetting,
  ROLEPLAY_SETTING_PRESETS,
  roleplayIntroScene,
  roleplayStillBasename,
  roleplayStillTakes,
  roleplayStoryPromptIds,
  beginRoleplayStillRetryPatch,
  beginRoleplayClipRetryPatch,
  canRetryRoleplayStill,
  canRetryRoleplayClip,
  roleplayClipQueueResultPatch,
  roleplayClipTakes,
  roleplayStillQueueResultPatch,
  selectRoleplayStillTakePatch,
  selectRoleplayClipTakePatch,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_INTRO_SCENE_ID,
  formatRoleplayStoryMarkdown,
  slugRoleplayExportPart,
  templateRoleplayBio,
  templateRoleplayScenes,
} from './roleplay';

describe('roleplay parsers', () => {
  it('reads fenced JSON bios and fills required fields', () => {
    const parsed = parseRoleplayBio(
      extractJsonValue(`Here you go
\`\`\`json
{ "name": "Crisp", "look": "a toaster with a scarf", "personality": "sincere", "catchphrase": "heat!" }
\`\`\``)
    );
    assert.equal(parsed.name, 'Crisp');
    assert.equal(parsed.look, 'a toaster with a scarf');
    assert.equal(parsed.catchphrase, 'heat!');
  });

  it('falls back when JSON is junk', () => {
    const fallback = templateRoleplayBio('sentient-toaster');
    const parsed = parseRoleplayBio(extractJsonValue('not json'), fallback);
    assert.equal(parsed.name, fallback.name);
  });

  it('locks a player-assigned character name on bios', () => {
    assert.equal(normalizeRoleplayCharacterName('  Alex   Quill  '), 'Alex Quill');
    assert.equal(normalizeRoleplayCharacterName('x'.repeat(80)).length, MAX_ROLEPLAY_CHARACTER_NAME);
    const named = applyRoleplayCharacterName(templateRoleplayBio('raccoon-pirate'), 'Alex Quill');
    assert.equal(named.name, 'Alex Quill');
    assert.equal(named.look, templateRoleplayBio('raccoon-pirate').look);
    const parsed = parseRoleplayBio(
      { name: 'Captain Nib', look: 'a raccoon in a hat', personality: 'bold' },
      undefined,
      'Alex Quill'
    );
    assert.equal(parsed.name, 'Alex Quill');
    assert.equal(templateRoleplayBio('raccoon-pirate', undefined, 'Mara').name, 'Mara');
    assert.equal(applyRoleplayCharacterName(named, '').name, 'Alex Quill');
    assert.equal(resolveRoleplayLockedCharacterName(''), undefined);
    assert.equal(resolveRoleplayLockedCharacterName('   '), undefined);
    assert.equal(resolveRoleplayLockedCharacterName('Alex Quill'), 'Alex Quill');
    assert.deepEqual(normalizeAvoidedRoleplayNames(['Alex Quill', 'alex quill', '', 'Mara']), [
      'Alex Quill',
      'Mara',
    ]);
    assert.equal(pickFreshRoleplayName(['Ivy Finch', 'Rook Vale'], () => 0), 'Sable Quinn');
    assert.equal(
      templateRoleplayBio('raccoon-pirate', undefined, undefined, {
        fresh: true,
        avoidNames: ['Captain Nib'],
      }).name !== 'Captain Nib',
      true
    );
  });

  it('parses a labeled or unlabeled character bible', () => {
    const labeled = parseRoleplayBioFromText(
      'Name: Mara Quill\nLook: ink-stained coat, gold-rim glasses\nPersonality: dry, loyal, always late\nCatchphrase: notes first'
    );
    assert.ok(labeled);
    assert.equal(labeled.name, 'Mara Quill');
    assert.equal(labeled.look, 'ink-stained coat, gold-rim glasses');
    assert.equal(labeled.personality, 'dry, loyal, always late');
    assert.equal(labeled.catchphrase, 'notes first');
    assert.equal(isRoleplayBioComplete(labeled), true);

    const paragraphs = parseRoleplayBioFromText(
      'Alex Quill\na raccoon in a rain coat\ndry and loyal, keeps the receipts',
      'Ignored'
    );
    assert.ok(paragraphs);
    assert.equal(paragraphs.name, 'Alex Quill');
    assert.equal(paragraphs.look, 'a raccoon in a rain coat');
    assert.match(paragraphs.personality, /dry and loyal/);

    assert.equal(parseRoleplayBioFromText('just a name'), null);
    assert.equal(isRoleplayBioComplete({ name: 'Mara', look: 'a coat' }), false);
  });

  it('reads scene arrays from a wrapper object', () => {
    const scenes = parseRoleplayScenes(
      extractJsonValue(
        '{ "scenes": [{ "title": "Airport security", "blurb": "Empty your crumbs." }, "Open mic"] }'
      )
    );
    assert.equal(scenes.length, 2);
    assert.equal(scenes[0]?.title, 'Airport security');
    assert.equal(scenes[1]?.title, 'Open mic');
  });

  it('normalizes tone, content rating, and custom persona prompts', () => {
    assert.equal(normalizeRoleplayTone('CHAOTIC'), 'chaotic');
    assert.equal(normalizeRoleplayTone('noir'), 'noir');
    assert.equal(normalizeRoleplayTone('MELANCHOLY'), 'melancholy');
    assert.equal(normalizeRoleplayTone('sultry'), 'silly');
    assert.equal(normalizeRoleplayTone('nope'), 'silly');
    assert.equal(ROLEPLAY_TONES.length, 12);
    assert.match(roleplayToneLine('horror'), /dread/i);
    assert.equal(roleplayToneTemperature('cozy'), 0.7);
    assert.equal(roleplayToneTemperature('chaotic'), 0.95);
    assert.equal(normalizeRoleplayContent('SFW'), 'clean');
    assert.equal(normalizeRoleplayContent('suggestive'), 'suggestive');
    assert.equal(normalizeRoleplayContent('explicit'), 'explicit');
    assert.equal(normalizeRoleplayContent(''), 'pg13');
    assert.deepEqual(resolveRoleplayToneAndContent('sultry'), {
      tone: 'silly',
      content: 'sultry',
    });
    assert.deepEqual(resolveRoleplayToneAndContent('nsfw'), {
      tone: 'silly',
      content: 'explicit',
    });
    assert.deepEqual(resolveRoleplayToneAndContent('cinematic', 'raunchy'), {
      tone: 'cinematic',
      content: 'raunchy',
    });
    assert.equal(normalizeRoleplayPlayAs('photo'), 'photo');
    assert.equal(normalizeRoleplayPlayAs('img2img'), 'photo');
    assert.equal(normalizeRoleplayPlayAs(''), 'text');
    assert.equal(isRoleplayAdultContent('sultry'), true);
    assert.equal(isRoleplayAdultContent('pg13'), false);
    assert.equal(clampRoleplayContentForAdultGate('explicit', false), 'pg13');
    assert.equal(clampRoleplayContentForAdultGate('explicit', true), 'explicit');
    assert.equal(clampRoleplayContentForAdultGate('suggestive', false), 'suggestive');
    assert.deepEqual(resolveRoleplayToneAndContent('cinematic', 'raunchy', { adultEnabled: false }), {
      tone: 'cinematic',
      content: 'pg13',
    });
    assert.deepEqual(resolveRoleplayToneAndContent('sultry', undefined, { adultEnabled: false }), {
      tone: 'silly',
      content: 'pg13',
    });
    assert.equal(parseRoleplayAllowGore(true), true);
    assert.equal(parseRoleplayAllowGore('true'), true);
    assert.equal(parseRoleplayAllowGore(false), false);
    assert.match(resolveRoleplayPersonaPrompt('hoodie-dragon'), /dragon/i);
    assert.equal(resolveRoleplayPersonaPrompt('custom', ' a sentient lamp '), 'a sentient lamp');
  });

  it('resolves a seeded setting and writes replace-scene cues for From photo', () => {
    assert.equal(resolveRoleplaySetting('  neon alley  ', 'studio lock'), 'neon alley');
    assert.equal(resolveRoleplaySetting('', 'locked tavern'), 'locked tavern');
    assert.equal(resolveRoleplaySetting('', ''), '');
    assert.ok(ROLEPLAY_SETTING_PRESETS.length >= 16);
    const rolled = rollRoleplaySetting();
    assert.ok(ROLEPLAY_SETTING_PRESETS.some(entry => entry.setting === rolled));
    assert.match(
      formatRoleplaySettingCue({
        setting: 'flooded cathedral',
        hasReferenceImage: true,
        phase: 'prompt',
      }),
      /Replace the scene with flooded cathedral/i
    );
    assert.match(
      formatRoleplaySettingCue({
        setting: 'flooded cathedral',
        hasReferenceImage: true,
        phase: 'bio',
      }),
      /not the photo's background/i
    );
    assert.match(
      formatRoleplaySettingCue({
        setting: 'tavern',
        phase: 'scenes',
      }),
      /opening options happen in or around this place/i
    );
    assert.match(
      formatRoleplaySettingCue({
        hasReferenceImage: true,
        isolatedSubject: true,
        setting: 'neon alley',
        phase: 'prompt',
      }),
      /isolated on a blank white backdrop/i
    );
    assert.match(
      formatRoleplaySettingCue({
        hasReferenceImage: true,
        isolatedSubject: true,
        phase: 'prompt',
      }),
      /Do not keep the white background/i
    );
    assert.match(
      formatRoleplaySettingCue({
        hasReferenceImage: true,
        isolatedSubject: true,
        setting: 'neon alley',
        phase: 'prompt',
      }),
      /Replace the photo's clothing/i
    );
    assert.match(
      formatRoleplayWardrobeCue({
        hasReferenceImage: true,
        phase: 'prompt',
      }),
      /beat's clothes win/i
    );
    assert.match(
      formatRoleplayWardrobeCue({
        hasReferenceImage: true,
        phase: 'bio',
      }),
      /not the photo/i
    );
    assert.equal(formatRoleplayWardrobeCue({ phase: 'prompt' }), '');
    assert.equal(normalizeRoleplayIsolateSubject(undefined), true);
    assert.equal(normalizeRoleplayIsolateSubject(false), false);
  });

  it('closes the episode at 12 panels (first look, ten plot beats, ending)', () => {
    let story = appendRoleplayStoryBeat(
      [],
      roleplayIntroScene({ name: 'Crisp', look: 'a toaster with a scarf', personality: 'sincere' })
    );
    assert.equal(roleplayStoryPhase(story), 'open');
    for (let index = 0; index < MAX_ROLEPLAY_PLOT_BEATS; index += 1) {
      story = appendRoleplayStoryBeat(story, {
        id: `s${index}`,
        title: `Beat ${index}`,
        blurb: 'x',
      });
    }
    assert.equal(roleplayPlotBeatCount(story), MAX_ROLEPLAY_PLOT_BEATS);
    assert.equal(roleplayStoryPhase(story), 'finale');
    assert.equal(story[0]?.id, ROLEPLAY_INTRO_SCENE_ID);

    const endings = templateRoleplayScenes('raccoon-pirate', undefined, story, 'Crisp');
    assert.equal(endings.length, 4);
    assert.ok(endings.every(scene => scene.kind === 'ending'));

    story = appendRoleplayStoryBeat(story, endings[0]!);
    assert.equal(roleplayStoryPhase(story), 'complete');
    assert.equal(story.length, 1 + MAX_ROLEPLAY_PLOT_BEATS + 1);
    assert.equal(story.at(-1)?.kind, 'ending');
    const frozen = appendRoleplayStoryBeat(story, { id: 'extra', title: 'Too late', blurb: 'nope' });
    assert.equal(frozen, story);
    assert.equal(formatRoleplayStoryProgress(story).heading, 'The end');
    assert.match(formatRoleplayStoryDigest(story), /already ended/i);
  });

  it('builds an establishing first-look still from the bio', () => {
    const intro = roleplayIntroScene({
      name: 'Crisp',
      look: 'a toaster with a scarf',
      personality: 'sincere',
    });
    assert.equal(intro.id, ROLEPLAY_INTRO_SCENE_ID);
    assert.equal(intro.title, 'First look');
    assert.match(intro.blurb, /Crisp/);
    assert.match(intro.blurb, /toaster with a scarf/);
    const still = lastRoleplayStillImage([
      { ...intro, at: 1, stillStatus: 'queued' },
      {
        id: 'dock',
        title: 'Foggy dock',
        blurb: 'Tide in.',
        at: 2,
        imageUrl: '/view/dock.png',
        stillStatus: 'completed',
      },
    ]);
    assert.equal(still?.url, '/view/dock.png');
    assert.equal(still?.title, 'Foggy dock');
    assert.equal(lastRoleplayStillImage([{ ...intro, at: 1 }]), null);
  });

  it('rolls later options from the last chosen beat instead of the starter vignettes', () => {
    const opening = templateRoleplayScenes('raccoon-pirate');
    assert.equal(opening[0]?.title, 'Mutiny at brunch');

    const intro = roleplayIntroScene(templateRoleplayBio('raccoon-pirate'));
    const afterIntro = templateRoleplayScenes('raccoon-pirate', undefined, [
      { ...intro, at: 1 },
    ]);
    assert.equal(afterIntro[0]?.title, 'Mutiny at brunch');

    const chosen = {
      id: 'mutiny-at-brunch-1',
      title: 'Mutiny at brunch',
      blurb: 'The crew wants pancakes. You want the map. The syrup is a hostage.',
      at: 2,
    };
    const story = [
      { ...intro, at: 1 },
      chosen,
    ];
    assert.equal(lastRoleplayPlotBeat(story)?.title, 'Mutiny at brunch');

    const next = templateRoleplayScenes('raccoon-pirate', undefined, story, 'Captain Nib');
    assert.equal(next.length, 4);
    assert.ok(next.every(scene => scene.title !== 'Mutiny at brunch'));
    assert.ok(next.every(scene => scene.title !== 'Foggy dock heist'));
    assert.equal(new Set(next.map(scene => scene.title)).size, 4);
    assert.ok(next.some(scene => /mutiny|brunch/i.test(`${scene.title} ${scene.blurb}`)));
    assert.ok(next.every(scene => /Captain Nib|brunch|mutiny|pancakes|syrup|map/i.test(scene.blurb)));
    assert.ok(
      next.some(scene => /room|later|guest|wardrobe|night|opposite|public|stunt/i.test(scene.title))
    );

    const digest = formatRoleplayStoryDigest(story);
    assert.match(digest, /Last chosen beat/);
    assert.match(digest, /Mutiny at brunch/);
    assert.match(digest, /continue from here/i);
    assert.match(digest, /different photographs/i);
    assert.match(digest, /Already offered or played/);

    const openingDigest = formatRoleplayStoryDigest([{ ...intro, at: 1 }]);
    assert.match(openingDigest, /opening plot options/i);
    assert.doesNotMatch(openingDigest, /Last chosen beat/);
  });

  it('drops already-played titles and fills from continuations', () => {
    const story = [
      {
        id: 'mutiny-at-brunch-1',
        title: 'Mutiny at brunch',
        blurb: 'The syrup is a hostage.',
        at: 1,
      },
    ];
    const fresh = filterFreshRoleplayScenes(
      [
        { id: 'dup', title: 'Mutiny at brunch', blurb: 'again' },
        { id: 'new', title: 'Syrup tribunal', blurb: 'The crew holds court.' },
      ],
      story
    );
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0]?.title, 'Syrup tribunal');

    const merged = mergeRoleplaySceneOptions(
      [{ id: 'dup', title: 'Mutiny at brunch', blurb: 'again' }],
      continueRoleplayScenes(story[0]!, story, 'Captain Nib'),
      story
    );
    assert.equal(merged.length, 4);
    assert.ok(merged.every(scene => scene.title.toLowerCase() !== 'mutiny at brunch'));
  });

  it('remembers unpicked cards across rolls without keeping the chosen beat', () => {
    const prior = mergeRoleplayRejectedScenes(
      [],
      [
        { id: 'a', title: 'Foggy dock heist', blurb: 'Picnic basket.' },
        { id: 'b', title: 'Parley with pigeons', blurb: 'Half a croissant.' },
      ]
    );
    assert.equal(prior.length, 2);
    const afterPick = mergeRoleplayRejectedScenes(
      prior,
      [
        { id: 'b', title: 'Parley with pigeons', blurb: 'Half a croissant.' },
        { id: 'c', title: 'Storm in a teacup', blurb: 'Tiny barrel.' },
        { id: 'd', title: 'Mutiny at brunch', blurb: 'Syrup hostage.' },
      ],
      { title: 'Mutiny at brunch' }
    );
    assert.ok(afterPick.every(scene => scene.title.toLowerCase() !== 'mutiny at brunch'));
    assert.ok(afterPick.some(scene => scene.title === 'Foggy dock heist'));
    assert.ok(afterPick.some(scene => scene.title === 'Storm in a teacup'));
  });

  it('drops near-duplicate titles and rejected reroll options', () => {
    assert.equal(
      roleplayScenesTooSimilar(
        { title: 'Mutiny at brunch', blurb: 'The syrup is a hostage.' },
        { title: 'Right after Mutiny at brunch', blurb: 'Same syrup, same table.' }
      ),
      true
    );
    assert.equal(
      roleplayScenesTooSimilar(
        { title: 'Syrup tribunal', blurb: 'The crew holds court.' },
        { title: 'Night shift', blurb: 'Light flips after mutiny at brunch.' }
      ),
      false
    );

    const story = [
      {
        id: 'mutiny-at-brunch-1',
        title: 'Mutiny at brunch',
        blurb: 'The syrup is a hostage.',
        at: 1,
      },
    ];
    const fresh = filterFreshRoleplayScenes(
      [
        { id: 'echo', title: 'Right after Mutiny at brunch', blurb: 'Still at the table.' },
        { id: 'dup-blurb', title: 'Pancake standoff', blurb: 'The syrup is a hostage.' },
        { id: 'new', title: 'Syrup tribunal', blurb: 'The crew holds court on the roof.' },
      ],
      story
    );
    assert.equal(fresh.some(scene => scene.title === 'Syrup tribunal'), true);
    assert.equal(fresh.some(scene => /mutiny at brunch/i.test(scene.title)), false);

    const rejected = [{ id: 'old', title: 'Syrup tribunal', blurb: 'The crew holds court on the roof.' }];
    const reroll = mergeRoleplaySceneOptions(
      [{ id: 'again', title: 'Syrup tribunal', blurb: 'Court, but louder.' }],
      continueRoleplayScenes(story[0]!, story, 'Captain Nib', rejected),
      story,
      4,
      rejected
    );
    assert.ok(reroll.every(scene => scene.title.toLowerCase() !== 'syrup tribunal'));
    assert.match(formatRoleplayAvoidedScenes(rejected), /Syrup tribunal/);
  });

  it('patches a beat and hydrates stills from gallery jobs', () => {
    const story = appendRoleplayStoryBeat([], { id: 'intro', title: 'First look', blurb: 'hi' }, {
      stillStatus: 'writing',
    });
    const beat = story[0];
    assert.ok(beat);
    const patched = patchRoleplayStoryBeat(story, beat, {
      prompt: 'a raccoon',
      promptId: 'job-1',
      stillStatus: 'queued',
    });
    assert.equal(patched[0]?.promptId, 'job-1');
    const merged = mergeRoleplayStoryStills(patched, [
      { promptId: 'job-1', status: 'pending', imageUrl: null },
    ]);
    assert.equal(merged.changed, false);
    const done = mergeRoleplayStoryStills(patched, [
      { promptId: 'job-1', status: 'completed', imageUrl: '/view/1.png' },
    ]);
    assert.equal(done.changed, true);
    assert.equal(done.story[0]?.stillStatus, 'completed');
    assert.equal(done.story[0]?.imageUrl, '/view/1.png');
  });

  it('archives completed stills on retry and hydrates every take from the gallery', () => {
    const beat = {
      id: 'intro',
      title: 'First look',
      blurb: 'hi',
      at: 1,
      prompt: 'a raccoon',
      promptId: 'job-1',
      imageUrl: '/view/1.png',
      stillStatus: 'completed' as const,
    };
    assert.equal(canRetryRoleplayStill(beat), true);
    assert.equal(canRetryRoleplayStill({ ...beat, prompt: undefined }), false);

    const retrying = { ...beat, ...beginRoleplayStillRetryPatch(beat) };
    assert.equal(retrying.stillTakes?.length, 2);
    assert.equal(retrying.stillTakes?.[0]?.imageUrl, '/view/1.png');
    assert.equal(retrying.promptId, undefined);
    assert.equal(retrying.stillStatus, 'writing');
    assert.equal(canRetryRoleplayStill(retrying), false);
    assert.equal(lastCompletedRoleplayStillUrl(retrying), '/view/1.png');
    assert.equal(lastRoleplayStillImage([retrying])?.url, '/view/1.png');

    const queued = { ...retrying, ...roleplayStillQueueResultPatch(retrying, 'job-2') };
    assert.equal(queued.promptId, 'job-2');
    assert.equal(queued.stillStatus, 'queued');
    assert.deepEqual(roleplayStoryPromptIds([queued]), ['job-1', 'job-2']);

    const done = mergeRoleplayStoryStills([queued], [
      { promptId: 'job-1', status: 'completed', imageUrl: '/view/1.png' },
      { promptId: 'job-2', status: 'completed', imageUrl: '/view/2.png' },
    ]);
    assert.equal(done.changed, true);
    assert.equal(done.story[0]?.imageUrl, '/view/2.png');
    assert.equal(done.story[0]?.stillTakes?.[0]?.imageUrl, '/view/1.png');
    assert.equal(done.story[0]?.stillTakes?.[1]?.imageUrl, '/view/2.png');

    const selected = {
      ...done.story[0]!,
      ...selectRoleplayStillTakePatch(done.story[0]!, 0),
    };
    assert.equal(selected.imageUrl, '/view/1.png');
    assert.equal(selected.stillTakeIndex, 0);
    assert.equal(selected.promptId, 'job-1');

    const later = mergeRoleplayStoryStills([selected], [
      { promptId: 'job-2', status: 'completed', imageUrl: '/view/2b.png' },
    ]);
    assert.equal(later.story[0]?.imageUrl, '/view/1.png');
    assert.equal(later.story[0]?.stillTakeIndex, 0);
    assert.equal(later.story[0]?.stillTakes?.[1]?.imageUrl, '/view/2b.png');
  });

  it('caps archived still takes when retrying', () => {
    const stillTakes = Array.from({ length: MAX_ROLEPLAY_STILL_TAKES }, (_, index) => ({
      promptId: `job-${index}`,
      imageUrl: `/view/${index}.png`,
      stillStatus: 'completed' as const,
    }));
    const beat = {
      id: 'intro',
      title: 'First look',
      blurb: 'hi',
      at: 1,
      prompt: 'a raccoon',
      promptId: 'job-7',
      imageUrl: '/view/7.png',
      stillStatus: 'completed' as const,
      stillTakes,
      stillTakeIndex: 7,
    };
    assert.equal(roleplayStillTakes(beat).length, MAX_ROLEPLAY_STILL_TAKES);
    const retrying = beginRoleplayStillRetryPatch(beat);
    assert.equal(retrying.stillTakes?.length, MAX_ROLEPLAY_STILL_TAKES);
    assert.equal(retrying.stillTakes?.[0]?.promptId, 'job-1');
    assert.equal(retrying.stillTakes?.at(-1)?.stillStatus, 'writing');
  });

  it('hydrates clip jobs on a beat that has no still takes', () => {
    const beat = {
      id: 'dock',
      title: 'Dock',
      blurb: 'Arrives',
      at: 1,
      prompt: 'walks the pier',
      clipPromptId: 'clip-1',
      clipStatus: 'queued' as const,
    };
    assert.deepEqual(roleplayStoryPromptIds([beat]), ['clip-1']);
    const queued = { ...beat, ...roleplayClipQueueResultPatch(beat, 'clip-1') };
    assert.equal(queued.clipStatus, 'queued');
    assert.equal(queued.clipTakes?.length, 1);
    const done = mergeRoleplayStoryStills([queued], [
      { promptId: 'clip-1', status: 'completed', imageUrl: '/view/clip.mp4' },
    ]);
    assert.equal(done.changed, true);
    assert.equal(done.story[0]?.clipUrl, '/view/clip.mp4');
    assert.equal(done.story[0]?.clipStatus, 'completed');
  });

  it('archives completed clips on retry and hydrates every take from the gallery', () => {
    const beat = {
      id: 'dock',
      title: 'Dock',
      blurb: 'Arrives',
      at: 1,
      prompt: 'walks the pier',
      promptId: 'still-1',
      imageUrl: '/view/still.png',
      stillStatus: 'completed' as const,
      clipPromptId: 'clip-1',
      clipUrl: '/view/clip-1.mp4',
      clipStatus: 'completed' as const,
    };
    assert.equal(canRetryRoleplayClip(beat), true);
    assert.equal(
      canRetryRoleplayClip({
        ...beat,
        prompt: undefined,
        blurb: '',
        imageUrl: undefined,
        stillStatus: undefined,
      }),
      false
    );

    const retrying = { ...beat, ...beginRoleplayClipRetryPatch(beat) };
    assert.equal(retrying.clipTakes?.length, 2);
    assert.equal(retrying.clipTakes?.[0]?.clipUrl, '/view/clip-1.mp4');
    assert.equal(retrying.clipPromptId, undefined);
    assert.equal(retrying.clipStatus, 'writing');
    assert.equal(canRetryRoleplayClip(retrying), false);

    const queued = { ...retrying, ...roleplayClipQueueResultPatch(retrying, 'clip-2') };
    assert.equal(queued.clipPromptId, 'clip-2');
    assert.equal(queued.clipStatus, 'queued');
    assert.deepEqual(roleplayStoryPromptIds([queued]), ['still-1', 'clip-1', 'clip-2']);

    const done = mergeRoleplayStoryStills([queued], [
      { promptId: 'clip-1', status: 'completed', imageUrl: '/view/clip-1.mp4' },
      { promptId: 'clip-2', status: 'completed', imageUrl: '/view/clip-2.mp4' },
    ]);
    assert.equal(done.changed, true);
    assert.equal(done.story[0]?.clipUrl, '/view/clip-2.mp4');
    assert.equal(done.story[0]?.clipTakes?.[0]?.clipUrl, '/view/clip-1.mp4');
    assert.equal(done.story[0]?.clipTakes?.[1]?.clipUrl, '/view/clip-2.mp4');

    const selected = {
      ...done.story[0]!,
      ...selectRoleplayClipTakePatch(done.story[0]!, 0),
    };
    assert.equal(selected.clipUrl, '/view/clip-1.mp4');
    assert.equal(selected.clipTakeIndex, 0);
    assert.equal(selected.clipPromptId, 'clip-1');

    const later = mergeRoleplayStoryStills([selected], [
      { promptId: 'clip-2', status: 'completed', imageUrl: '/view/clip-2b.mp4' },
    ]);
    assert.equal(later.story[0]?.clipUrl, '/view/clip-1.mp4');
    assert.equal(later.story[0]?.clipTakeIndex, 0);
    assert.equal(later.story[0]?.clipTakes?.[1]?.clipUrl, '/view/clip-2b.mp4');
  });

  it('caps archived clip takes when retrying', () => {
    const clipTakes = Array.from({ length: MAX_ROLEPLAY_CLIP_TAKES }, (_, index) => ({
      clipPromptId: `clip-${index}`,
      clipUrl: `/view/clip-${index}.mp4`,
      clipStatus: 'completed' as const,
    }));
    const beat = {
      id: 'dock',
      title: 'Dock',
      blurb: 'Arrives',
      at: 1,
      prompt: 'walks the pier',
      clipPromptId: 'clip-7',
      clipUrl: '/view/clip-7.mp4',
      clipStatus: 'completed' as const,
      clipTakes,
      clipTakeIndex: 7,
    };
    assert.equal(roleplayClipTakes(beat).length, MAX_ROLEPLAY_CLIP_TAKES);
    const retrying = beginRoleplayClipRetryPatch(beat);
    assert.equal(retrying.clipTakes?.length, MAX_ROLEPLAY_CLIP_TAKES);
    assert.equal(retrying.clipTakes?.[0]?.clipPromptId, 'clip-1');
    assert.equal(retrying.clipTakes?.at(-1)?.clipStatus, 'writing');
  });

  it('keeps unique starter parts and includes the new cast', () => {
    const ids = ROLEPLAY_ARCHETYPES.map(entry => entry.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length >= 24);
    assert.ok(ids.includes('subway-mermaid'));
    assert.ok(ids.includes('lava-lamp'));
    assert.equal(resolveRoleplayPersonaPrompt('moon-intern').length > 0, true);
  });

  it('formats a downloadable story markdown with still filenames', () => {
    assert.equal(slugRoleplayExportPart('First look!'), 'first-look');
    assert.equal(roleplayStillBasename('First look', 0), '01-first-look');
    const markdown = formatRoleplayStoryMarkdown({
      bio: {
        name: 'Crisp',
        look: 'a toaster with a scarf',
        personality: 'sincere',
        catchphrase: 'heat!',
      },
      tone: 'Silly',
      content: 'PG-13',
      personaLabel: 'Sentient toaster',
      story: [
        { id: 'intro', title: 'First look', blurb: 'Hello crumbs.', at: 1, prompt: 'a toaster' },
      ],
      stillFilenames: ['01-first-look.png'],
      clipFilenames: ['01-first-look.mp4'],
      filmFilename: 'crisp-film-2026-08-16.webm',
    });
    assert.match(markdown, /^# Crisp/m);
    assert.match(markdown, /Part: Sentient toaster/);
    assert.match(markdown, /Content: PG-13/);
    assert.match(markdown, /Still: `stills\/01-first-look.png`/);
    assert.match(markdown, /Clip: `clips\/01-first-look.mp4`/);
    assert.match(markdown, /Assembled: `crisp-film-2026-08-16.webm`/);
    assert.match(markdown, /a toaster/);
  });
});
