/**
 * Sweeps Story's poses the way the Day prompt sweep does Day's — no render, no ComfyUI, no
 * language model.
 *
 *  A. Every built-in scene Story can offer without a language model (each Part's four openings,
 *     the default openings, the adult openings, every "what happens next" and ending fork, the
 *     first look) is resolved to a pose guide as the queue does (`buildStoryPoseGuide` →
 *     `sceneTextFromStoryPoseInput` + `resolveSceneGuidePlan`), on three engines — on the first
 *     take (title + blurb) and on a retry (title + blurb + the stored still prompt).
 *  B. Every pose id a scene writer may attach is checked against every scene text through
 *     `reconcileWrittenPose`: a posture the words state is the posture drawn.
 *  C. A pose the player picked on the beat card wins over both.
 *
 * The sweep runs once in `before`; each test asserts one invariant over the recorded runs. A
 * failure names the scene, its rating / tone and the engine. Genuine app defects go in
 * KNOWN_ISSUES (so the suite stays green) — delete an entry with its fix; the last test fails on
 * an entry that no longer matches anything.
 */

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  SCENE_POSE_BODY_IDS,
  SCENE_POSE_LAYOUT_IDS,
  parsePoseGuideIntent,
  reconcileWrittenPose,
  resolveSceneGuidePlan,
  sceneTextFromStoryPoseInput,
  textLeadPosture,
  type PoseGuideBase,
  type ScenePoseSpec,
} from './day-pose-guide';
import { mergePickedPose } from './day-slot-pose';
import { clarifyIntimateImageLanguage } from './intimate-prompt-clarify';
import { poseLayoutFromKey } from './play-metrics';
import {
  ALWAYS_CUED_DUO_LAYOUTS,
  poseLayoutCueLine,
  postureCueLine,
} from './pose-coaching';
import {
  DEFAULT_POSE_GUIDE_STYLE,
  mergeAvoidedPoseLayouts,
  modelPlainPostureBase,
} from './pose-guide-prompt';
import { poseModelFamily, poseProfileForModel } from './pose/pose-model-profile';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_SETTING_PRESETS,
  ROLEPLAY_TONES,
  continueRoleplayEndings,
  continueRoleplayScenes,
  isRoleplayAdultContent,
  roleplayIntroScene,
  storyStillPromptSource,
  templateRoleplayBio,
  templateRoleplayScenes,
  withRoleplayPoseGuidePrompt,
  withStoryEverydayWardrobe,
  type RoleplayBio,
  type RoleplayContentId,
  type RoleplayScene,
  type RoleplayStoryBeat,
  type RoleplayTone,
} from './roleplay';
import { auditStillPrompt } from './still-prompt-audit';

// ── Engines ──────────────────────────────────────────────────────────────────────────────

const RAPID = 'qwen-rapid-aio-edit';
const EDIT_2511 = 'qwen-image-edit-2511-lightning-8';
const QWEN_21 = 'qwen-image-2.1-edit';
const ENGINES = [RAPID, EDIT_2511, QWEN_21] as const;
type Engine = (typeof ENGINES)[number];

// ── Scenes ───────────────────────────────────────────────────────────────────────────────

const SFW_RATINGS: RoleplayContentId[] = ['clean', 'pg13', 'suggestive'];
const ADULT_RATINGS: RoleplayContentId[] = ['sultry', 'explicit', 'raunchy'];

type Scene = {
  /** Where the app takes it from: "Part raccoon-pirate opening", "next after …", "ending after …". */
  source: string;
  rating: RoleplayContentId;
  adult: boolean;
  tone: RoleplayTone;
  kind: 'intro' | 'plot' | 'ending';
  personaId: string | undefined;
  customPersona: string | undefined;
  /** Lead name the templates were filled with. */
  name: string;
  title: string;
  blurb: string;
  /** Beats before this one (the fallback stance cycles on this). */
  storyIndex: number;
  /** A Setting the player may have seeded — it goes into the still prompt only. */
  setting: string;
  /**
   * "Next" and ending forks quote the previous beat ("…the fallout of milk pitcher duel"): the
   * same fork written after a beat with no pose words in it.
   */
  neutralBlurb?: string;
  /** Titles of the beats before this one, as the queue passes them to the pose reader. */
  quotedTitles: string[];
  /**
   * Also swept through the still prompt and a retry. Every opening, first look and adult scene
   * is; of the "next" / ending forks, those after each Part's first opening (the forks differ
   * only in the title they quote, and writing 4,800 template prompts takes seconds).
   */
  retryFlow: boolean;
};

const ADULT_BIO: RoleplayBio = {
  name: 'Lana',
  look: 'a woman with shoulder-length dark hair and green eyes',
  personality: 'Dry, quick, hard to embarrass.',
};

const CUSTOM_PART = 'a retired stage magician with a dove in every pocket';

/** Avoid-list padding: the fork generators rotate their start by story + avoid length. */
const padding = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ title: `zzpad${index}qq`, blurb: '' }));

/** A previous beat with no pose words: what a fork reads like when only the fork speaks. */
const NEUTRAL_BEAT: RoleplayStoryBeat = {
  id: 'earlier',
  title: 'Earlier',
  blurb: 'Something happened here.',
  at: 1,
};

const FIRST_LOOK_TITLE = 'First look';

function collectScenes(): Scene[] {
  const scenes: Scene[] = [];
  const seen = new Set<string>();
  let serial = 0;
  const add = (
    scene: RoleplayScene,
    meta: Pick<
      Scene,
      'source' | 'rating' | 'kind' | 'personaId' | 'customPersona' | 'name' | 'storyIndex'
    >,
    neutral?: RoleplayScene[],
    retryFlow = true,
    quotedTitles: string[] = []
  ) => {
    // The template path clarifies each card's blurb before the player picks it
    // (roleplay-generator.ts, clarifyRoleplaySceneBlurbs).
    const blurb = clarifyIntimateImageLanguage(scene.blurb);
    const adult = isRoleplayAdultContent(meta.rating);
    const key = `${adult ? meta.rating : 'sfw'}|${meta.kind}|${scene.title}|${blurb}`;
    const neutralBlurb = neutral?.find(other => other.title === scene.title)?.blurb;
    if (seen.has(key)) return;
    seen.add(key);
    serial += 1;
    scenes.push({
      ...meta,
      adult,
      // Tone and Setting only reach the still prompt: rotate through all of them.
      tone: ROLEPLAY_TONES[serial % ROLEPLAY_TONES.length]!.id,
      setting: ROLEPLAY_SETTING_PRESETS[serial % ROLEPLAY_SETTING_PRESETS.length]!.setting,
      title: scene.title,
      blurb,
      retryFlow,
      quotedTitles,
      ...(neutralBlurb ? { neutralBlurb: clarifyIntimateImageLanguage(neutralBlurb) } : {}),
    });
  };
  const asBeat = (scene: RoleplayScene, at: number): RoleplayStoryBeat => ({ ...scene, at });

  const parts: Array<{ personaId: string | undefined; customPersona: string | undefined }> = [
    ...ROLEPLAY_ARCHETYPES.map(archetype => ({ personaId: archetype.id, customPersona: undefined })),
    { personaId: CUSTOM_ROLEPLAY_PERSONA_ID, customPersona: CUSTOM_PART },
    { personaId: undefined, customPersona: undefined },
  ];

  parts.forEach((part, partIndex) => {
    const bio = templateRoleplayBio(part.personaId, part.customPersona);
    const base = { ...part, name: bio.name };
    const label = `Part ${part.personaId ?? 'none'}`;
    const rating = SFW_RATINGS[partIndex % SFW_RATINGS.length]!;
    add(roleplayIntroScene(bio), {
      ...base,
      source: `${label} first look`,
      rating,
      kind: 'intro',
      storyIndex: 0,
    });
    const openings = templateRoleplayScenes(
      part.personaId,
      part.customPersona,
      [],
      bio.name,
      [],
      rating
    );
    for (const opening of openings) {
      add(opening, { ...base, source: `${label} opening`, rating, kind: 'plot', storyIndex: 1 });
      const last = asBeat(opening, 1);
      const retryFlow = opening === openings[0];
      // Eight "next" forks and six endings, four offered at a time from a rotating start.
      for (const pad of [0, 4]) {
        const neutral = continueRoleplayScenes(NEUTRAL_BEAT, [NEUTRAL_BEAT], bio.name, padding(pad), rating);
        for (const next of continueRoleplayScenes(last, [last], bio.name, padding(pad), rating)) {
          add(
            next,
            {
              ...base,
              source: `${label} next after "${opening.title}"`,
              rating,
              kind: 'plot',
              storyIndex: 2,
            },
            neutral,
            retryFlow,
            [FIRST_LOOK_TITLE, opening.title]
          );
        }
      }
      for (const pad of [0, 3]) {
        const neutral = continueRoleplayEndings(NEUTRAL_BEAT, [NEUTRAL_BEAT], bio.name, padding(pad), rating);
        for (const ending of continueRoleplayEndings(last, [last], bio.name, padding(pad), rating)) {
          add(
            ending,
            {
              ...base,
              source: `${label} ending after "${opening.title}"`,
              rating,
              kind: 'ending',
              storyIndex: 11,
            },
            neutral,
            retryFlow,
            [FIRST_LOOK_TITLE, opening.title]
          );
        }
      }
    }
  });

  // Adult ratings: their own openings and forks, whatever the Part.
  for (const rating of ADULT_RATINGS) {
    const bio = ADULT_BIO;
    const base = { personaId: undefined, customPersona: undefined, name: bio.name, rating };
    const openings = templateRoleplayScenes(undefined, undefined, [], bio.name, [], rating);
    for (const opening of openings) {
      add(opening, { ...base, source: `${rating} opening`, kind: 'plot', storyIndex: 1 });
    }
    const last = asBeat(openings[0]!, 1);
    for (const pad of [0, 4, 8]) {
      for (const next of continueRoleplayScenes(last, [last], bio.name, padding(pad), rating)) {
        add(next, { ...base, source: `${rating} next`, kind: 'plot', storyIndex: 2 }, undefined, true, [
          FIRST_LOOK_TITLE,
          last.title,
        ]);
      }
    }
    for (const pad of [0, 3]) {
      for (const ending of continueRoleplayEndings(last, [last], bio.name, padding(pad), rating)) {
        add(
          ending,
          { ...base, source: `${rating} ending`, kind: 'ending', storyIndex: 11 },
          undefined,
          true,
          [FIRST_LOOK_TITLE, last.title]
        );
      }
    }
  }
  return scenes;
}

/**
 * Scene texts in the style a language model writes them, each stating one posture the app
 * recognises (`textLeadPosture`). The built-in scenes rarely state one, so parts B and C would
 * otherwise have little to check a written or picked pose against. Not real model output — that
 * cannot be enumerated.
 */
const WRITER_STYLE_SCENES: Scene[] = (
  [
    ['At the bar', 'She sits at the bar, nursing a drink.'],
    ['On the stairs', 'Sitting on the stairs with her chin in her hands.'],
    ['Rain', 'She stands at the window watching the rain.'],
    ['Platform nine', 'Standing on the platform as the train pulls in.'],
    ['Slow afternoon', 'She is lying on the sofa with a book.'],
    ['Cloud watching', 'She lies on her back in the grass, looking at the clouds.'],
    ['Planting', 'She kneels in the flower bed, pressing bulbs into the soil.'],
    ['Wrapping paper', 'Kneeling on the rug to wrap a present.'],
  ] as const
).map(([title, blurb], index) => ({
  source: 'writer-style fixture',
  rating: 'pg13' as const,
  adult: false,
  tone: 'cozy' as const,
  kind: 'plot' as const,
  personaId: undefined,
  customPersona: undefined,
  name: 'Lana',
  title,
  blurb,
  storyIndex: index + 1,
  setting: '',
  retryFlow: false,
  quotedTitles: [],
}));

// ── One run: a scene's pose on one engine ────────────────────────────────────────────────

type Drawn = {
  text: string;
  poseKey: string;
  layout: string | null;
  social: string | null;
  intimate: string | null;
  base: string;
  figures: number;
  routedAround: string | undefined;
};

/** The pure part of `buildStoryPoseGuide`, with the arguments Story's queue passes. */
function drawStoryPose(input: {
  title: string;
  blurb: string;
  prompt?: string;
  storyIndex: number;
  engine: Engine;
  adult: boolean;
  poseLayout?: string;
  pose?: ScenePoseSpec;
  quotedTitles?: string[];
}): Drawn {
  const text = sceneTextFromStoryPoseInput({
    title: input.title,
    blurb: input.blurb,
    prompt: input.prompt,
    quotedTitles: input.quotedTitles,
    allowIntimate: input.adult,
  });
  const plainPostureBase = modelPlainPostureBase(input.engine);
  const plan = resolveSceneGuidePlan(text, input.storyIndex, {
    pose: mergePickedPose(input.poseLayout, input.pose, input.blurb),
    variant: 0,
    // No play metrics in a test: only the model's own avoided layouts.
    ...(input.poseLayout ? {} : { avoidLayouts: mergeAvoidedPoseLayouts(new Set(), input.engine) }),
    ...(plainPostureBase ? { plainPostureBase } : {}),
    allowIntimate: input.adult,
    openPose: true,
  });
  return {
    text,
    poseKey: plan.openPose.poseKey,
    layout: poseLayoutFromKey(plan.openPose.poseKey),
    social: plan.intent.social ?? null,
    intimate: plan.intent.intimate ?? null,
    base: plan.intent.base,
    figures: plan.figures.length,
    routedAround: plan.routedAround,
  };
}

/** The cue Story adds for a drawn pose (two-person layouts and a kneel are always spelled out). */
function storyCueLine(drawn: Drawn): string {
  return (
    (drawn.layout && ALWAYS_CUED_DUO_LAYOUTS.has(drawn.layout)
      ? poseLayoutCueLine(drawn.layout, drawn.figures)
      : '') || postureCueLine(drawn.poseKey)
  );
}

type Run = {
  scene: Scene;
  engine: Engine;
  first: Drawn;
  /** Scenes swept through the still prompt and a retry (`Scene.retryFlow`). */
  after?: {
    /** The still prompt the template path writes for this scene on this engine. */
    writerPrompt: string;
    /** The pose read with the writer's prompt as well — before the queue adds its locks. */
    withWriterPrompt: Drawn;
    /** What is stored on the beat after the first queue (locks and cue included). */
    storedPrompt: string;
    /** The pose a retry draws: the stored prompt is read with the title and the blurb. */
    retry: Drawn;
  };
  /** The text matched no pose words: the stance comes from the story index. */
  unmatched: boolean;
};

const SCENES = collectScenes();
const RUNS: Run[] = [];
/** Runs of one scene, one per engine (in ENGINES order). */
const GROUPS: Run[][] = [];

async function runScene(scene: Scene, engine: Engine): Promise<Run> {
  const { generateRoleplayPrompt } = await import('./specialized/roleplay-generator');
  const { normalizeSharedGenerationOptions } = await import('./specialized/normalize');
  const first = drawStoryPose({ ...scene, engine });
  const unmatched =
    !first.social &&
    !first.intimate &&
    parsePoseGuideIntent(first.text, 0, { allowIntimate: scene.adult }).base !==
      parsePoseGuideIntent(first.text, 1, { allowIntimate: scene.adult }).base;
  if (!scene.retryFlow) return { scene, engine, first, unmatched };
  // The template still prompt, as the API route writes it with no language model.
  let writerPrompt = '';
  try {
    const written = await generateRoleplayPrompt({
      ...normalizeSharedGenerationOptions({
        model: engine,
        llmEnabled: false,
        allowTemplateFallback: true,
      }),
      personaId: scene.personaId,
      customPersona: scene.customPersona,
      characterName: scene.name,
      // Adult scenes have no Part of their own: a plain Cast look.
      ...(scene.adult ? { bio: ADULT_BIO } : {}),
      tone: scene.tone,
      content: scene.rating,
      setting: scene.setting,
      hasReferenceImage: true,
      situation: { id: 'sweep', title: scene.title, blurb: scene.blurb },
    });
    writerPrompt = written.prompt;
  } catch (error) {
    fail(
      TEMPLATE_PROMPT,
      scene,
      engine,
      `the template still prompt could not be written: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  // commitStill (useRoleplayBeatQueueCore.ts): prompt source → wardrobe for the rating → pose
  // guide lines → cue. Left out: the footwear / dress-plate line and `actions.finalizePrompt`.
  const promptSource = storyStillPromptSource({
    llmPrompt: writerPrompt,
    blurb: scene.blurb,
    title: scene.title,
    adult: scene.adult,
    guideLayout: first.layout,
  });
  const dressed = scene.adult ? promptSource : withStoryEverydayWardrobe(promptSource, first.figures);
  const withWriterPrompt = drawStoryPose({ ...scene, prompt: dressed, engine });
  const storedPrompt = [
    withRoleplayPoseGuidePrompt(
      dressed,
      true,
      undefined,
      engine,
      { style: DEFAULT_POSE_GUIDE_STYLE, headcount: first.figures, leadPosition: null, camera: null },
      scene.adult
    ),
    storyCueLine(first),
  ]
    .filter(Boolean)
    .join('\n');
  const retry = drawStoryPose({ ...scene, prompt: storedPrompt, engine });
  return {
    scene,
    engine,
    first,
    unmatched,
    after: { writerPrompt, withWriterPrompt, storedPrompt, retry },
  };
}

// ── Failures and the known-issue allow-list ──────────────────────────────────────────────

type Failure = { invariant: string; scene: Scene; engine: Engine | 'any'; detail: string };

const FAILURES: Failure[] = [];
function fail(invariant: string, scene: Scene, engine: Engine | 'any', detail: string): void {
  FAILURES.push({ invariant, scene, engine, detail });
}

function describeFailure({ invariant, scene, engine, detail }: Failure): string {
  return `[${invariant}] ${scene.rating} / ${scene.tone} (${scene.source}) · engine ${engine} · scene "${scene.title} — ${scene.blurb}" — ${detail}`;
}

type KnownIssue = {
  id: string;
  invariant: string;
  /** Where the defect is and what it does. */
  why: string;
  matches: (failure: Failure) => boolean;
};

/**
 * KNOWN_ISSUES — genuine app defects this sweep found. Each entry excuses exactly the failures
 * it describes; everything else still fails. Remove the entry with the fix.
 */
const KNOWN_ISSUES: KnownIssue[] = [
];

const hitKnownIssues = new Set<string>();
function unexpected(invariant: string): string[] {
  return FAILURES.filter(failure => failure.invariant === invariant)
    .filter(failure => {
      const known = KNOWN_ISSUES.find(
        issue => issue.invariant === invariant && issue.matches(failure)
      );
      if (known) hitKnownIssues.add(known.id);
      return !known;
    })
    .map(describeFailure);
}

function assertHolds(invariant: string): void {
  const lines = unexpected(invariant);
  assert.equal(
    lines.length,
    0,
    `${lines.length} failure(s):\n${lines.slice(0, 40).join('\n')}${lines.length > 40 ? '\n…' : ''}`
  );
}

// ── Invariant names ──────────────────────────────────────────────────────────────────────

const TEMPLATE_PROMPT = 'template still prompt';
const PEOPLE_MIX = 'template scenes follow Solo / Duo';
const ENGINE_INDEPENDENT = 'engine-independent pose';
const LAYOUT_FROM_SCENE = 'layout comes from the scene';
const HEADCOUNT = 'headcount';
const SOLO_CUES = 'one-person cue';
const PROMPT_AUDIT = 'prompt audit';
const CONTINUITY_LABEL = 'the previous beat is a label, not this pose';
const RETRY_SAME_POSE = "a retry draws the first take's pose";

/**
 * A stored still prompt at its worst: a Setting and a look full of pose words, and the queue's
 * realism lock. Read as pose text, it made a retry a "photograph" (camera to one eye), a climb
 * or a dance.
 */
const HOSTILE_STORED_PROMPT =
  'Replace the scene with a nightclub dance floor under climbing vines, overlooking a sprawling city, a couch and a bench by the railing. A courier with hair standing on end, hugging a laptop, two adults behind her. Final still must be a photorealistic live-action photograph. Exactly one person in the still.';
const WRITTEN_POSE = 'written pose agrees with the words';
const RECONCILE_CHANGED = 'reconcile reports what it changed';
const PICK_WINS = 'the picked pose wins';

const counts = { writtenTexts: 0, writtenPoses: 0, statedPostureTexts: 0, picks: 0 };

// ── A. Template scenes ───────────────────────────────────────────────────────────────────

/**
 * Layouts whose trigger words in `parseSocialLayout` are unambiguous: the stems are a superset of
 * what the parser accepts, so a layout drawn without any of them was read from something other
 * than the scene's words.
 */
const LAYOUT_WORDS: Record<string, RegExp> = {
  dance: /danc|waltz|twirl|ballroom|spin/i,
  hug: /hug|embrac|arm|close/i,
  fight: /fight|punch|strik|spar|duel|brawl|scuffle|swing|combat|martial/i,
  climb: /climb|clamber|scal|scrambl|ladder|rope|cliff|drainpipe|hand[- ]over[- ]hand/i,
  stairs: /stairs|steps|staircase/i,
  wave: /wav|hand|greeting/i,
  laptop: /laptop|keyboard|typing|computer/i,
  cook: /cook|stir|chop|stove|flip|whisk|knead|saut|tast/i,
  phone: /phone|text|selfie|scroll|screen|mobile/i,
  read: /read|book|page|paper|menu|brows/i,
  drink: /sip|drink|coffee|mug|cup|glass|pour/i,
  eat: /eat|bite|fork|spoon|chopstick|slurp|lick/i,
  photograph: /photo|picture|pic|shot|camera|viewfinder|polaroid/i,
};

/** Words that put a second person in a clothed scene (never sex vocabulary). */
const OTHER_PERSON_RE =
  /\b(duel|joust|opponent|stranger|friend|partner|rival|enemy|lover|guest|newcomer|companion|roommate|person|someone|somebody|couple|pair|duo|crowd|crew|group|trio|two|three|both|each other|one another|together|side by side|arm in arm|hand in hand|face[- ]to[- ]face|knee[- ]to[- ]knee|date|boyfriend|girlfriend|husband|wife|crush|sister|brother|bestie|mate|colleague|teammate|alongside)\b/i;

/** People an adult template scene names: its partner(s), or nobody but the lead. */
function adultScenePeople(blurb: string): number {
  if (/\btwo distinct adult partners\b|\bthree\b/i.test(blurb)) return 3;
  if (/\b(?:a distinct adult partner|two (?:consenting )?adults)\b/i.test(blurb)) return 2;
  return 1;
}

function checkTemplateScenes(): void {
  for (const group of GROUPS) {
    const reference = group[0]!;
    const scene = reference.scene;
    for (const run of group.slice(1)) {
      const differs: string[] = [];
      for (const take of ['first', 'retry'] as const) {
        const a = take === 'first' ? run.first : run.after?.retry;
        const b = take === 'first' ? reference.first : reference.after?.retry;
        if (!a || !b) continue;
        if (a.poseKey !== b.poseKey || a.social !== b.social || a.intimate !== b.intimate) {
          differs.push(`${take} take drawn ${a.poseKey} vs ${b.poseKey}`);
        } else if (a.base !== b.base || a.figures !== b.figures) {
          differs.push(`${take} take ${a.base} × ${a.figures} vs ${b.base} × ${b.figures}`);
        }
      }
      if (differs.length) {
        fail(ENGINE_INDEPENDENT, scene, run.engine, `differs from ${reference.engine}: ${differs.join('; ')}`);
      }
    }
  }

  for (const run of RUNS) {
    const { scene, engine, first } = run;
    const retry = run.after?.retry;
    const words = `${scene.title} · ${scene.blurb}`;

    for (const layout of new Set([first.social, first.layout])) {
      const needs = layout ? LAYOUT_WORDS[layout] : undefined;
      if (layout && needs && !needs.test(words)) {
        fail(LAYOUT_FROM_SCENE, scene, engine, `drawn as ${layout}, but the scene has none of ${needs}`);
      }
    }
    // Sex layouts belong to the adult ratings.
    if (!scene.adult && (first.intimate || retry?.intimate)) {
      fail(
        LAYOUT_FROM_SCENE,
        scene,
        engine,
        `a ${scene.rating} scene is drawn as the sex layout ${first.intimate ?? retry?.intimate}`
      );
    }

    if (scene.adult) {
      const expected = adultScenePeople(scene.blurb);
      if (first.figures !== expected) {
        fail(HEADCOUNT, scene, engine, `the scene names ${expected}, the guide draws ${first.figures} (${first.poseKey})`);
      }
    } else if (first.figures > 1 && !OTHER_PERSON_RE.test(words)) {
      fail(
        HEADCOUNT,
        scene,
        engine,
        `no second person in the scene's words, the guide draws ${first.figures} (${first.poseKey})`
      );
    } else if (scene.kind === 'intro' && first.figures !== 1) {
      fail(HEADCOUNT, scene, engine, `the first look draws ${first.figures} figures`);
    }

    // The pose is read from the scene, not from the stored still prompt: a retry — with the
    // template writer's own prompt and the queue's locks stored on the beat, and with a hostile
    // one — draws exactly what the first take drew.
    if (retry && (retry.poseKey !== first.poseKey || retry.text !== first.text)) {
      fail(
        RETRY_SAME_POSE,
        scene,
        engine,
        `first take ${first.poseKey}, retry (stored template prompt) ${retry.poseKey}`
      );
    }
    const hostile = drawStoryPose({ ...scene, prompt: HOSTILE_STORED_PROMPT, engine });
    if (hostile.poseKey !== first.poseKey || hostile.text !== first.text) {
      fail(
        RETRY_SAME_POSE,
        scene,
        engine,
        `first take ${first.poseKey}, retry (hostile stored prompt) ${hostile.poseKey}`
      );
    }
    // The same fork after a beat with no pose words in its title or blurb draws the same pose.
    if (scene.neutralBlurb) {
      const neutral = drawStoryPose({
        ...scene,
        blurb: scene.neutralBlurb,
        quotedTitles: [NEUTRAL_BEAT.title],
        engine,
      });
      if (neutral.poseKey !== first.poseKey) {
        fail(
          CONTINUITY_LABEL,
          scene,
          engine,
          `drawn ${first.poseKey}; the same fork after a beat without pose words is ${neutral.poseKey}`
        );
      }
    }

    for (const drawn of retry ? [first, retry] : [first]) {
      const cue = poseLayoutCueLine(drawn.layout, drawn.figures);
      const storyCue = storyCueLine(drawn);
      if (drawn.figures === 1) {
        const two = /the two people|each other|both people/i.exec(`${cue} ${storyCue}`)?.[0];
        if (two) fail(SOLO_CUES, scene, engine, `cue for ${drawn.poseKey} says "${two}": ${cue}`);
      }
      // A minimal still prompt: who is in frame, the scene, the cue.
      const lead =
        drawn.figures === 1 ? 'One woman alone.' : `${drawn.figures} people in frame.`;
      const prompt = `Story still: ${lead} Moment: ${scene.blurb} Place: ${scene.setting}.\n${cue}`;
      for (const issue of auditStillPrompt(prompt, { people: drawn.figures, imageCount: 3 })) {
        fail(PROMPT_AUDIT, scene, engine, `${issue.code}: ${issue.message} ("${issue.evidence}")`);
      }
    }
  }
}

/** Adult ratings: the People mix (Solo / Duo) the player set, on the template path. */
async function checkPeopleMix(): Promise<void> {
  const { generateRoleplayScenes } = await import('./specialized/roleplay-generator');
  const { normalizeSharedGenerationOptions } = await import('./specialized/normalize');
  for (const rating of ADULT_RATINGS) {
    for (const intimateMix of ['solo', 'duo'] as const) {
      const options = {
        ...normalizeSharedGenerationOptions({
          model: RAPID,
          llmEnabled: false,
          allowTemplateFallback: true,
        }),
        bio: ADULT_BIO,
        tone: 'romantic',
        content: rating,
        intimateMix,
      };
      const openings = (await generateRoleplayScenes({ ...options, story: [] })).scenes;
      const next = (
        await generateRoleplayScenes({ ...options, story: [{ ...openings[0]!, at: 1 }] })
      ).scenes;
      for (const offered of [...openings, ...next]) {
        const people = adultScenePeople(offered.blurb);
        if (intimateMix === 'solo' ? people !== 1 : people < 2) {
          fail(
            PEOPLE_MIX,
            {
              source: `${rating} ${intimateMix} mix`,
              rating,
              adult: true,
              tone: 'romantic',
              kind: 'plot',
              personaId: undefined,
              customPersona: undefined,
              name: ADULT_BIO.name,
              title: offered.title,
              blurb: offered.blurb,
              storyIndex: 1,
              setting: '',
              retryFlow: false,
              quotedTitles: [],
            },
            'any',
            `People is ${intimateMix}, the offered scene names ${people}`
          );
        }
      }
    }
  }
}

// ── B. Written poses ─────────────────────────────────────────────────────────────────────

type Posture = NonNullable<ReturnType<typeof textLeadPosture>>;

function postureGroup(base: string): 'upright' | 'sit' | 'low' | 'lie' {
  if (base === 'lie') return 'lie';
  if (base === 'sit') return 'sit';
  if (base === 'kneel' || base === 'crouch') return 'low';
  return 'upright';
}

/** The drawn body may not contradict the posture the words state. */
function contradicts(posture: Posture, base: string): boolean {
  const group = postureGroup(base);
  if (posture === 'lie') return group !== 'lie';
  if (posture === 'stand') return group === 'sit' || group === 'lie';
  // Sitting or kneeling: not an upright full-body pose, and not lying.
  return group === 'upright' || group === 'lie';
}

const WRITTEN_SPECS: ScenePoseSpec[] = [
  ...SCENE_POSE_LAYOUT_IDS.map(layout => ({ layout })),
  // "One person" matters for the layouts that can draw two.
  ...SCENE_POSE_LAYOUT_IDS.filter(layout => ALWAYS_CUED_DUO_LAYOUTS.has(layout)).map(layout => ({
    layout,
    people: 1,
  })),
  ...SCENE_POSE_BODY_IDS.map(body => ({ body: body as PoseGuideBase })),
];

const soloByWordsCache = new Map<Scene, boolean>();
function soloByWords(scene: Scene): boolean {
  let solo = soloByWordsCache.get(scene);
  if (solo === undefined) {
    solo = drawStoryPose({ ...scene, engine: RAPID }).figures === 1;
    soloByWordsCache.set(scene, solo);
  }
  return solo;
}

function checkWrittenPoses(): void {
  // One engine: nothing in the three profiles changes how a written pose is drawn (asserted in
  // the coverage test), and the scene texts do not depend on the engine.
  const seen = new Set<string>();
  for (const scene of [...SCENES, ...WRITER_STYLE_SCENES]) {
    const key = `${scene.adult}|${scene.title}|${scene.blurb}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.writtenTexts += 1;
    // Story reconciles against the blurb (mergePickedPose(beat.poseLayout, beat.pose, beat.blurb)).
    const posture = textLeadPosture(scene.blurb);
    if (posture) counts.statedPostureTexts += 1;
    for (const spec of WRITTEN_SPECS) {
      counts.writtenPoses += 1;
      const name = JSON.stringify(spec);
      const result = reconcileWrittenPose(spec, scene.blurb);
      const altered = JSON.stringify(result.spec ?? {}) !== JSON.stringify(spec);
      if (altered !== result.changed.length > 0) {
        fail(
          RECONCILE_CHANGED,
          scene,
          'any',
          `written ${name} → ${JSON.stringify(result.spec)}, changed = ${JSON.stringify(result.changed)}`
        );
      }
      // "One person" from the writer is checked on scenes whose own words draw one person.
      const onePerson = spec.people === 1 && soloByWords(scene);
      if (!posture && !onePerson) continue;
      const drawn = drawStoryPose({ ...scene, engine: RAPID, pose: spec });
      // A drawn sex layout has its own posture check (applyScenePoseSpec), and its base is not
      // a posture word: all fours is drawn on the "lean" base.
      if (posture && !drawn.intimate && contradicts(posture, drawn.base)) {
        fail(
          WRITTEN_POSE,
          scene,
          'any',
          `the words state "${posture}", written ${name} is drawn ${drawn.poseKey} (${drawn.base})`
        );
      }
      if (onePerson && drawn.figures !== 1) {
        fail(
          WRITTEN_POSE,
          scene,
          'any',
          `written ${name} (one person) is drawn with ${drawn.figures} figures (${drawn.poseKey})`
        );
      }
    }
  }
}

// ── C. Player picks ──────────────────────────────────────────────────────────────────────

const LAYOUT_IDS: ReadonlySet<string> = new Set(SCENE_POSE_LAYOUT_IDS);

function checkPicks(): void {
  const writtenByModel: ScenePoseSpec[] = [
    { layout: 'dance', body: 'lie', people: 2 },
    { body: 'sit', act: 'none' },
    { layout: 'lie_side' },
  ];
  const seen = new Set<string>();
  for (const scene of [...SCENES, ...WRITER_STYLE_SCENES]) {
    if (seen.has(scene.blurb)) continue;
    seen.add(scene.blurb);
    const posture = textLeadPosture(scene.blurb);
    for (const pick of [...SCENE_POSE_LAYOUT_IDS, ...SCENE_POSE_BODY_IDS]) {
      for (const written of writtenByModel) {
        counts.picks += 1;
        const merged = mergePickedPose(pick, written, scene.blurb);
        const got = LAYOUT_IDS.has(pick) ? merged?.layout : merged?.body;
        const leftover = LAYOUT_IDS.has(pick) && (merged?.body || merged?.act);
        if (got !== pick || leftover) {
          fail(
            PICK_WINS,
            scene,
            'any',
            `picked ${pick} over written ${JSON.stringify(written)} → ${JSON.stringify(merged)}`
          );
        }
      }
      // Drawn as picked, where the words state a posture that could pull it elsewhere.
      if (!posture || scene.adult) continue;
      const drawn = drawStoryPose({ ...scene, engine: RAPID, poseLayout: pick, pose: writtenByModel[0] });
      const drawnPick = LAYOUT_IDS.has(pick) ? drawn.social : drawn.base;
      if (drawnPick !== pick) {
        fail(PICK_WINS, scene, 'any', `picked ${pick}, drawn ${drawn.poseKey} (${drawn.base})`);
      }
    }
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('Story pose sweep', () => {
  before(async () => {
    for (const scene of SCENES) {
      const group: Run[] = [];
      for (const engine of ENGINES) {
        group.push(await runScene(scene, engine));
      }
      GROUPS.push(group);
      RUNS.push(...group);
    }
    checkTemplateScenes();
    await checkPeopleMix();
    checkWrittenPoses();
    checkPicks();
  });

  it('covers every Part, rating, tone and Setting on the three engines', () => {
    assert.deepEqual(ENGINES.map(poseModelFamily), ['rapid-aio', 'qwen-edit-2511', 'qwen-image-2.1']);
    // Nothing in these profiles changes how a Story pose is drawn (B and C run on one engine).
    for (const engine of ENGINES) {
      assert.equal(modelPlainPostureBase(engine), undefined, engine);
      assert.equal(poseProfileForModel(engine).avoidedLayouts.size, 0, engine);
    }
    for (const rating of [...SFW_RATINGS, ...ADULT_RATINGS]) {
      assert.ok(SCENES.some(scene => scene.rating === rating), rating);
    }
    for (const kind of ['intro', 'plot', 'ending'] as const) {
      assert.ok(SCENES.some(scene => scene.kind === kind), kind);
    }
    assert.deepEqual(
      ROLEPLAY_TONES.filter(tone => !SCENES.some(scene => scene.tone === tone.id)),
      []
    );
    assert.deepEqual(
      ROLEPLAY_SETTING_PRESETS.filter(
        preset => !SCENES.some(scene => scene.setting === preset.setting)
      ),
      []
    );
    // Parts B and C have every posture to check against.
    assert.deepEqual(
      [...new Set(WRITER_STYLE_SCENES.map(scene => textLeadPosture(scene.blurb)))].sort(),
      ['kneel', 'lie', 'sit', 'stand']
    );
    assert.ok(counts.statedPostureTexts >= WRITER_STYLE_SCENES.length);
  });

  it('writes a still prompt for every scene without a language model', () =>
    assertHolds(TEMPLATE_PROMPT));
  it('offers Solo or Duo scenes as the People mix asks', () => assertHolds(PEOPLE_MIX));
  it('plans the same pose on every engine', () => assertHolds(ENGINE_INDEPENDENT));
  it('draws a layout only for a scene that says it', () => assertHolds(LAYOUT_FROM_SCENE));
  it('draws the people the scene names', () => assertHolds(HEADCOUNT));
  it("does not take a fork's pose from the previous beat it quotes", () =>
    assertHolds(CONTINUITY_LABEL));
  it('draws the same pose on a retry as on the first take, for every scene', () =>
    assertHolds(RETRY_SAME_POSE));

  it('reads a stored prompt only for a legacy beat with no title and no blurb', () => {
    assert.equal(
      sceneTextFromStoryPoseInput({ prompt: 'She sits on a crate by the dock.' }),
      'She sits on a crate by the dock.'
    );
    assert.equal(
      sceneTextFromStoryPoseInput({
        title: 'Fog',
        blurb: 'Nothing moves.',
        prompt: 'She sits on a crate by the dock.',
      }),
      'Fog · Nothing moves.'
    );
    // A title is a label: the blurb's own pose is read alone.
    assert.equal(
      sceneTextFromStoryPoseInput({
        title: 'Sunrise punch-out',
        blurb: 'You freeze mid-stretch because that is the job.',
      }),
      'You freeze mid-stretch because that is the job.'
    );
  });
  it('never gives a one-person still a two-person cue', () => assertHolds(SOLO_CUES));
  it('finds nothing in a minimal prompt of the scene and its cue', () => assertHolds(PROMPT_AUDIT));
  it('draws the posture the words state, whatever pose the writer attached', () =>
    assertHolds(WRITTEN_POSE));
  it('reports a change exactly when it altered the written pose', () =>
    assertHolds(RECONCILE_CHANGED));
  it('draws the pose the player picked, whatever the words say', () => assertHolds(PICK_WINS));

  it('has no stale KNOWN_ISSUES entry', () => {
    for (const invariant of new Set(KNOWN_ISSUES.map(issue => issue.invariant))) {
      unexpected(invariant);
    }
    assert.deepEqual(
      KNOWN_ISSUES.filter(issue => !hitKnownIssues.has(issue.id)).map(issue => issue.id),
      [],
      'fixed — delete these KNOWN_ISSUES entries'
    );
  });
});

