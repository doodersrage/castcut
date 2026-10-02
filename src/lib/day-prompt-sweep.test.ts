/**
 * Sweeps every beat the Day planner can produce through the queue's pose planning and cue
 * wording — no render, no ComfyUI. Two bugs that only ever showed up as bad stills would have
 * failed here:
 *
 *  (a) the stance directive ("…seated, reclining, dancing, climbing, or waving as written") was
 *      appended to the text the pose is read from, and lying / sitting beats on Edit 2511 were
 *      drawn as a DANCE (see `stanceDirectiveForGuide` in day-slot-pose.ts);
 *  (b) a one-person still got the two-person cue "the two people face each other…" and rendered
 *      her twice (see `SOLO_RECIPE_CUES` in pose-coaching.ts).
 *
 * The sweep runs once at module load; each test asserts one invariant over the recorded runs.
 * A failure names the mood, pool, engine and beat. A defect the sweep finds in the app that
 * cannot be fixed at once goes in KNOWN_ISSUES (so the suite stays green) — delete the entry with
 * the fix; the last test fails on an entry that no longer matches anything. The nine it found at
 * first (a kayak drawn as a swimmer, "twirling pasta" as a dance, "kicking off heels" as yoga,
 * upright RELAXING beats lying down, a "laptop" / "bench" in the Setting replacing the beat's
 * pose, "hugging a pillow" as a pair, companion hugs planned for one, sex verbs counting a
 * partner on clothed beats) are fixed and now held by the invariants below.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseIntimateLayout,
  parsePoseGuideIntent,
  resolveSceneGuidePlan,
  sceneTextStatesPose,
} from './day-pose-guide';
import {
  DAY_LATE_SLOT_BEAT_PRESETS,
  DAY_LATE_SLOT_COMPANION_BEAT_PRESETS,
  DAY_LATE_SLOT_SETTING_PRESETS,
  DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_PARTS,
  DAY_SLOT_BEAT_PRESETS,
  DAY_SLOT_COMPANION_BEAT_PRESETS,
  DAY_SLOT_SETTING_PRESETS,
  DAY_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS,
  dayEverydayPoseClass,
  daySlotsForLength,
  intimateBeatsForMix,
  isDayAdultMood,
  isDayHeatMood,
  normalizeDayMood,
  raunchyBeatsForMix,
  type DayIntimateMix,
  type DayMood,
  type DayPart,
  type DaySlotId,
} from './day-planner';
import { planDaySlotPose } from './day-slot-pose';
import { daySportBeatPresetsForSlot } from './day-sport';
import { DAY_THEMES } from './day-themes';
import {
  clothedHeatUnlockPoseClass,
  dayVacationBeatPresetsForSlot,
  dayVacationDuoBeatPresetsForSlot,
  vacationPoseClassFromBeat,
  vacationStanceDirective,
} from './day-vacation';
import { poseLayoutFromKey } from './play-metrics';
import { ALWAYS_CUED_DUO_LAYOUTS, poseLayoutCueLine, withRecipePoseCue } from './pose-coaching';
import { poseModelFamily, poseProfileForModel } from './pose/pose-model-profile';
import { auditStillPrompt } from './still-prompt-audit';

// ── Engines ──────────────────────────────────────────────────────────────────────────────

const RAPID = 'qwen-rapid-aio-edit';
const EDIT_2511 = 'qwen-image-edit-2511-lightning-8';
const QWEN_21 = 'qwen-image-2.1-edit';
const ENGINES = [RAPID, EDIT_2511, QWEN_21] as const;
type Engine = (typeof ENGINES)[number];

// ── Beats ────────────────────────────────────────────────────────────────────────────────

type Kind = DayMood;

type Beat = {
  /** The stored Day mood: a base mood or a theme id (themes run as Everyday). */
  mood: string;
  kind: Kind;
  pool: string;
  /** From a two-person pool (companion / couple beats). */
  two: boolean;
  slotId: DaySlotId;
  beat: string;
  location?: string;
};

/** Who is in the Day: the planner's People options. */
type People = 'solo' | 'duo' | 'mixed';

const PEOPLE: Record<People, { intimateMix: DayIntimateMix; allowCompanions: boolean }> = {
  solo: { intimateMix: 'solo', allowCompanions: false },
  duo: { intimateMix: 'duo', allowCompanions: true },
  mixed: { intimateMix: 'mixed', allowCompanions: true },
};

/**
 * Settings a player could type, full of words the pose guide reads as a pose or as a second
 * person. With any of them an Everyday beat must plan exactly what it plans without a Setting.
 */
const STRESS_SETTINGS = [
  'nightclub dance floor with a twirling mirror ball and couples hugging at the bar',
  'rooftop yoga deck with a climbing wall, a bench and a railing with fairy lights',
  'bedroom with a laptop on the bed, a couch underneath the window and a sprawling city view',
  'hotel lobby lounge where a couple sits arm in arm with a stranger by the stairs',
];

function collectBeats(): Beat[] {
  const beats: Beat[] = [];
  const seen = new Set<string>();
  const add = (beat: Omit<Beat, 'kind'>) => {
    const key = `${beat.mood}|${beat.beat}|${beat.location ?? ''}`;
    if (!beat.beat.trim() || seen.has(key)) return;
    seen.add(key);
    beats.push({ ...beat, kind: normalizeDayMood(beat.mood) });
  };
  const late = (part: DayPart): DaySlotId => `${part}-2`;

  for (const part of DAY_PARTS) {
    // Everyday draws the beat and the Setting separately, each from the slot's own pool — and
    // the Setting is part of the text the pose is read from. So: every beat with every Setting
    // of its slot, and with none.
    const everyday: Array<[string, boolean, DaySlotId, string[], string[]]> = [
      ['everyday', false, part, DAY_SLOT_BEAT_PRESETS[part], DAY_SLOT_SETTING_PRESETS[part]],
      [
        'everyday companions',
        true,
        part,
        DAY_SLOT_COMPANION_BEAT_PRESETS[part],
        DAY_SLOT_SETTING_PRESETS[part],
      ],
      [
        'everyday late',
        false,
        late(part),
        DAY_LATE_SLOT_BEAT_PRESETS[part],
        DAY_LATE_SLOT_SETTING_PRESETS[part],
      ],
      [
        'everyday late companions',
        true,
        late(part),
        DAY_LATE_SLOT_COMPANION_BEAT_PRESETS[part],
        DAY_LATE_SLOT_SETTING_PRESETS[part],
      ],
    ];
    for (const [pool, two, slotId, presets, settings] of everyday) {
      for (const beat of presets ?? []) {
        add({ mood: 'everyday', pool, two, slotId, beat });
        for (const location of [...(settings ?? []), ...STRESS_SETTINGS]) {
          add({ mood: 'everyday', pool, two, slotId, beat, location });
        }
      }
    }

    for (const beat of DAY_SLOT_SUGGESTIVE_BEAT_PRESETS[part] ?? []) {
      add({ mood: 'suggestive', pool: 'suggestive', two: false, slotId: part, beat });
    }
    for (const beat of DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS[part] ?? []) {
      add({ mood: 'suggestive', pool: 'suggestive late', two: false, slotId: late(part), beat });
    }
    for (const beat of DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS[part] ?? []) {
      add({ mood: 'suggestive', pool: 'suggestive couple', two: true, slotId: part, beat });
    }
  }

  // Pools with late-slot variants behind a slot-id function: ask for all eight slots.
  for (const slotId of daySlotsForLength(8).map(slot => slot.id)) {
    for (const beat of dayVacationBeatPresetsForSlot(slotId)) {
      add({ mood: 'vacation', pool: 'vacation', two: false, slotId, beat });
    }
    for (const beat of dayVacationDuoBeatPresetsForSlot(slotId)) {
      add({ mood: 'vacation', pool: 'vacation couple', two: true, slotId, beat });
    }
    for (const beat of daySportBeatPresetsForSlot(slotId)) {
      add({ mood: 'sport', pool: 'sport', two: false, slotId, beat });
    }
    for (const beat of intimateBeatsForMix(slotId, 'mixed')) {
      add({ mood: 'intimate', pool: 'intimate', two: false, slotId, beat });
    }
    for (const beat of raunchyBeatsForMix(slotId, 'mixed')) {
      add({ mood: 'raunchy', pool: 'raunchy', two: false, slotId, beat });
    }
  }

  // Themes: each beat brings its own room.
  for (const theme of Object.values(DAY_THEMES)) {
    for (const part of DAY_PARTS) {
      for (const [beat, location] of theme.scenes[part]) {
        add({ mood: theme.id, pool: `theme ${theme.id}`, two: false, slotId: part, beat, location });
      }
      for (const [beat, location] of theme.duoScenes[part]) {
        add({
          mood: theme.id,
          pool: `theme ${theme.id} couple`,
          two: true,
          slotId: part,
          beat,
          location,
        });
      }
    }
  }
  return beats;
}

// ── One run: a beat planned for one engine ───────────────────────────────────────────────

type Run = {
  beat: Beat;
  people: People;
  engine: Engine;
  sceneText: string | undefined;
  /** The beat's own words give a pose (a layout, an act or a posture). */
  statesPose: boolean;
  headcount: number;
  /** Has a body posture from the beat's pose class — it outranks the base read from the text. */
  bodySpec: string | undefined;
  /** `parsePoseGuideIntent` on the planned text: what the words alone say. */
  social: string | null;
  intimate: string | null;
  base: string;
  intentPeople: number;
  /** The same text read without what the planner appended. */
  ownSocial: string | null;
  ownBase: string;
  /** What the guide draws (pose spec applied): "dance:1", "sit:1", "hug:2". */
  poseKey: string;
  layout: string | null;
  figures: number;
};

function planRun(beat: Beat, people: People, engine: Engine): Run {
  const plan = planDaySlotPose({
    slot: { id: beat.slotId, sceneHints: beat.beat, location: beat.location },
    dayMood: beat.mood,
    ...PEOPLE[people],
    model: engine,
  });
  const intent = parsePoseGuideIntent(plan.sceneText, 0, plan.options);
  // The text the planner starts from: the beat — plus the Setting on Everyday when the beat
  // itself gives no pose (heat moods read the beat only).
  const statesPose = sceneTextStatesPose(beat.beat, { allowIntimate: isDayAdultMood(beat.kind) });
  const ownText =
    statesPose || isDayHeatMood(beat.kind)
      ? beat.beat
      : [beat.beat, beat.location?.trim()].filter(Boolean).join(' · ');
  const own = parsePoseGuideIntent(ownText, 0, plan.options);
  const drawn = resolveSceneGuidePlan(plan.sceneText, 0, { ...plan.options, openPose: true });
  return {
    beat,
    people,
    engine,
    sceneText: plan.sceneText,
    statesPose,
    headcount: plan.headcount,
    bodySpec: plan.options.pose?.body,
    social: intent.social ?? null,
    intimate: intent.intimate ?? null,
    base: intent.base,
    intentPeople: intent.people,
    ownSocial: own.social ?? null,
    ownBase: own.base,
    poseKey: drawn.openPose.poseKey,
    layout: poseLayoutFromKey(drawn.openPose.poseKey),
    figures: drawn.figures.length,
  };
}

const BEATS = collectBeats();

const RUNS: Run[] = [];
/** Runs of one beat under one People option, one per engine (in ENGINES order). */
const GROUPS: Run[][] = [];
for (const beat of BEATS) {
  const adult = isDayAdultMood(beat.kind);
  // Clothed: Solo for every beat, Duo for the two-person pools, Mixed for both. Adult beats are
  // filtered by their own pools, so Mixed (the beat decides) covers them.
  const options: People[] = adult ? ['mixed'] : beat.two ? ['solo', 'duo', 'mixed'] : ['solo', 'mixed'];
  for (const people of options) {
    const group = ENGINES.map(engine => planRun(beat, people, engine));
    GROUPS.push(group);
    RUNS.push(...group);
  }
}

// ── Failures and the known-issue allow-list ──────────────────────────────────────────────

type Failure = { invariant: string; run: Run; detail: string };

const FAILURES: Failure[] = [];
const fail = (invariant: string, run: Run, detail: string) => {
  FAILURES.push({ invariant, run, detail });
};

function describeFailure({ invariant, run, detail }: Failure): string {
  const where = run.beat.location ? ` @ "${run.beat.location}"` : '';
  return `[${invariant}] mood ${run.beat.mood} (${run.beat.pool}, ${run.people}) · engine ${run.engine} · beat "${run.beat.beat}"${where} — ${detail}`;
}

type KnownIssue = {
  id: string;
  invariant: string;
  /** Where the defect is and what it does. */
  why: string;
  matches: (run: Run) => boolean;
};

/**
 * KNOWN_ISSUES — genuine app defects this sweep found. Each entry excuses exactly the failures
 * it describes; everything else still fails. Remove the entry with the fix.
 */
const KNOWN_ISSUES: KnownIssue[] = [
  {
    id: 'couple-beats-without-a-pose',
    invariant: 'the beat states its pose',
    why: 'Ten couple beats (Suggestive couple, theme couple scenes) have no word the pose guide reads — "her partner carrying her to bed in his arms", "clinking coffee mugs with her partner", "singing karaoke with a friend", "posing back to back with a friend"… — so the pair is drawn in the stance of the slot index, or in one read from the room ("…laid out on the bed" lays the cosplay pair down). Found by the invariant added with the Setting fix; the beats or the guide need the words.',
    matches: run =>
      run.beat.two &&
      /^(?:her partner (?:carrying her to bed|fixing her necklace)|clinking coffee mugs|singing karaoke|side by side with a friend in the back of a taxi|sharing breakfast in bed|reading side by side in bed|the two models posing face to face|getting into costumes with a friend|posing back to back with a friend)/.test(
        run.beat.beat
      ),
  },
];

const hitKnownIssues = new Set<string>();
function unexpected(invariant: string): string[] {
  return FAILURES.filter(failure => failure.invariant === invariant)
    .filter(failure => {
      const known = KNOWN_ISSUES.find(
        issue => issue.invariant === invariant && issue.matches(failure.run)
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

// ── Invariants ───────────────────────────────────────────────────────────────────────────

const clothed = (run: Run) => !isDayAdultMood(run.beat.kind);

/** I1 — the pose does not depend on the engine. */
const ENGINE_INDEPENDENT = 'engine-independent pose';
for (const group of GROUPS) {
  const beat = group[0]!.beat;
  // By design: Rapid AIO and Qwen-Image 2.1 draw neither a 69 nor face-sitting, so those adult
  // beats are planned as seated oral there (`seatedOralFallback`) and as written on Edit 2511.
  // Such a beat is compared only between engines that share the fallback.
  const oralFallbackBeat =
    isDayAdultMood(beat.kind) &&
    ['sixty_nine', 'facesit'].includes(parseIntimateLayout(beat.beat) ?? '');
  const reference = group[0]!;
  for (const run of group.slice(1)) {
    if (
      oralFallbackBeat &&
      poseProfileForModel(run.engine).seatedOralFallback !==
        poseProfileForModel(reference.engine).seatedOralFallback
    ) {
      continue;
    }
    const differs: string[] = [];
    if (run.social !== reference.social) {
      differs.push(`layout read ${run.social} vs ${reference.social}`);
    }
    if (run.intimate !== reference.intimate) {
      differs.push(`act read ${run.intimate} vs ${reference.intimate}`);
    }
    // The base read from the text is only what is drawn when the beat's pose class gives no
    // body posture (`pose.body` outranks it) — with one, the drawn pose below is the check.
    if (!run.bodySpec && !reference.bodySpec && run.base !== reference.base) {
      differs.push(`posture read ${run.base} vs ${reference.base}`);
    }
    if (run.poseKey !== reference.poseKey) {
      differs.push(`drawn ${run.poseKey} vs ${reference.poseKey}`);
    }
    if (run.headcount !== reference.headcount) {
      differs.push(`headcount ${run.headcount} vs ${reference.headcount}`);
    }
    if (differs.length) {
      fail(ENGINE_INDEPENDENT, run, `differs from ${reference.engine}: ${differs.join('; ')}`);
    }
  }
}

/**
 * I2 — what the planner appends to the beat (the "nuclear Image 3 silhouette" reinforcement, the
 * "exactly two adults only" lock) is not read as a pose. Bug (a) exactly: the general stance
 * directive named "dancing" and the guide drew a dance.
 *
 * Not checked where the planner appends a pose class's own directive ("SEATED = hips firmly ON
 * a chair…") — that one restates the beat's stance on purpose — and not on adult moods, whose
 * text the clarifier rewrites into sex-act language.
 */
const ADDITIONS_NEUTRAL = 'planner additions are not read as a pose';
const hasClassDirective = (beat: Beat) =>
  (beat.kind === 'vacation' || beat.kind === 'suggestive') &&
  vacationStanceDirective(clothedHeatUnlockPoseClass(beat.beat, beat.kind)) !==
    vacationStanceDirective(null);
let reinforcedClasslessRuns = 0;
for (const run of RUNS.filter(clothed)) {
  if (hasClassDirective(run.beat)) continue;
  if (run.sceneText?.includes('nuclear Image 3 silhouette')) reinforcedClasslessRuns += 1;
  if (run.social !== run.ownSocial || run.base !== run.ownBase) {
    fail(
      ADDITIONS_NEUTRAL,
      run,
      `the beat reads ${run.ownSocial ?? 'no layout'} / ${run.ownBase}, the planned text reads ${run.social ?? 'no layout'} / ${run.base}`
    );
  }
}

/** I3 — a layout is drawn only for a beat that says it. */
const LAYOUT_FROM_BEAT = 'layout comes from the beat';
/**
 * Layouts whose trigger words in `parseSocialLayout` / `parseSportLayout` are unambiguous: the
 * stems below are a superset of what the parser accepts, so a layout drawn without any of them
 * was read from something other than the beat.
 */
const LAYOUT_WORDS: Record<string, RegExp> = {
  dance: /danc|waltz|twirl|ballroom/i,
  hug: /hug|embrac|arm|close/i,
  fight: /fight|punch|strik|spar|duel|brawl|scuffle|swing|combat|martial/i,
  climb: /climb|clamber|scal|scrambl|ladder|rope|cliff|drainpipe|hand[- ]over[- ]hand/i,
  stairs: /stairs|steps|staircase/i,
  wave: /wav|hand|greeting/i,
  laptop: /laptop|keyboard|typing|computer/i,
  cook: /cook|stir|chop|stove|flip|whisk|knead|saut|tast/i,
  sport_yoga_warrior: /yoga|pilates|warrior|crow|plank|fold|tree/i,
  sport_yoga_dog: /down/i,
};
/** Posture classes (the planner's own classifiers) that cannot be a dance, a fight or a climb. */
const DOWN_CLASSES = new Set([
  'SEATED',
  'LYING',
  'KNEEL',
  'CROUCH',
  'PERCHED',
  'RELAXING',
  'RECLINING',
  'PADDLING',
  'PEDALING',
  'SWIMMING',
]);
const UPRIGHT_ACTION_LAYOUTS = new Set(['dance', 'fight', 'climb', 'stairs']);
const beatPoseClass = (beat: Beat) =>
  beat.kind === 'vacation'
    ? vacationPoseClassFromBeat(beat.beat)
    : beat.kind === 'everyday'
      ? dayEverydayPoseClass(beat.beat)
      : '';
for (const run of RUNS) {
  // The Setting's part in an Everyday pose is I4's subject; here the beat is read on its own
  // (themes keep their room: the beat alone must still carry the layout).
  if (run.beat.mood === 'everyday' && run.beat.location) continue;
  for (const layout of new Set([run.social, run.layout])) {
    const words = layout ? LAYOUT_WORDS[layout] : undefined;
    if (layout && words && !words.test(run.beat.beat)) {
      fail(LAYOUT_FROM_BEAT, run, `drawn as ${layout}, but the beat has none of ${words}`);
    }
  }
  if (
    run.layout &&
    UPRIGHT_ACTION_LAYOUTS.has(run.layout) &&
    DOWN_CLASSES.has(beatPoseClass(run.beat))
  ) {
    fail(
      LAYOUT_FROM_BEAT,
      run,
      `a ${beatPoseClass(run.beat)} beat is drawn as ${run.poseKey}`
    );
  }
  // A RELAXING beat at a counter, in a booth, on a bench or against the headboard sits upright.
  if (
    /^RELAXING\b/.test(run.beat.beat) &&
    /\b(upright\s+against|headboard|counter|chin\s+on\s+hand|bench|booth|tray|postcard)\b/i.test(
      run.beat.beat
    ) &&
    run.poseKey.startsWith('lie')
  ) {
    fail(LAYOUT_FROM_BEAT, run, `an upright seat is drawn as ${run.poseKey}`);
  }
}

/**
 * I4 — Everyday: a beat that states a pose keeps it whatever the Setting says — the planner's own
 * Settings and the stress ones. The drawn pose, the layout and posture read, and the headcount
 * are all the same as with no Setting at all.
 */
const SETTING_KEEPS_STANCE = 'the Setting does not change the pose';
const withoutSetting = new Map<string, Run>();
for (const run of RUNS) {
  if (run.beat.mood === 'everyday' && !run.beat.location) {
    withoutSetting.set(`${run.beat.beat}|${run.people}|${run.engine}`, run);
  }
}
for (const run of RUNS) {
  if (run.beat.mood !== 'everyday' || !run.beat.location) continue;
  const bare = withoutSetting.get(`${run.beat.beat}|${run.people}|${run.engine}`)!;
  const signature = (of: Run) =>
    `${of.poseKey} (read ${of.social ?? 'no layout'} / ${of.base}, ${of.headcount} planned, ${of.figures} drawn)`;
  if (signature(run) !== signature(bare)) {
    fail(
      SETTING_KEEPS_STANCE,
      run,
      `without the Setting ${signature(bare)}, with it ${signature(run)}`
    );
  }
}

/**
 * I4b — every beat in the pools states its own pose, so no Setting (and no slot index) decides
 * how it is drawn.
 */
const POSE_IN_BEAT = 'the beat states its pose';
for (const run of RUNS) {
  if (!run.statesPose) {
    fail(POSE_IN_BEAT, run, `no pose words in the beat; drawn ${run.poseKey}`);
  }
}

/** I5 — headcount. */
const HEADCOUNT = 'headcount';
for (const run of RUNS.filter(clothed)) {
  const expected = run.people === 'solo' ? 1 : run.beat.two ? 2 : 1;
  // People → Solo on a two-person beat is not something the planner produces (it rerolls the
  // beat, `alignDaySlotsToPeople`), so only the planned headcount is checked there.
  if (run.people === 'solo' && run.beat.two) {
    if (run.headcount !== 1) fail(HEADCOUNT, run, `planned ${run.headcount} people with companions off`);
    continue;
  }
  if (run.headcount !== expected || run.intentPeople !== expected || run.figures !== expected) {
    fail(
      HEADCOUNT,
      run,
      `expected ${expected}: planned ${run.headcount}, read ${run.intentPeople}, drawn ${run.figures} figure(s)`
    );
  }
}

/** I6 — a one-person still never gets a two-person cue. */
const SOLO_CUES = 'one-person cue';
const TWO_PEOPLE_WORDS = /the two people|each other|both people/i;
let soloRunsWithDuoLayout = 0;
let soloRunsWithCue = 0;
for (const run of RUNS) {
  if (run.figures !== 1) continue;
  // A minimal one-person recipe, as the compact Day recipes are shaped.
  const recipe = `Day photo: One woman alone. She wears the outfit from the second image. Moment: ${run.beat.kind} moment. Place: ${run.beat.kind} place. Keep her face from the first image.`;
  const cued = withRecipePoseCue(recipe, run.layout, run.poseKey);
  const line = poseLayoutCueLine(run.layout, 1);
  if (run.layout && ALWAYS_CUED_DUO_LAYOUTS.has(run.layout)) soloRunsWithDuoLayout += 1;
  if (cued !== recipe) soloRunsWithCue += 1;
  for (const [name, text] of [
    ['withRecipePoseCue', cued],
    ['poseLayoutCueLine', line],
  ] as const) {
    const words = TWO_PEOPLE_WORDS.exec(text)?.[0];
    if (words) fail(SOLO_CUES, run, `${name}(${run.layout}) says "${words}": ${text}`);
  }
  for (const text of [cued, `${recipe} ${line}`]) {
    const issue = auditStillPrompt(text, { people: 1 }).find(
      found => found.code === 'solo-mentions-two'
    );
    if (issue) fail(SOLO_CUES, run, `audit: ${issue.message} ("${issue.evidence}")`);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('Day prompt sweep', () => {
  it('covers every mood on the three Day engines', () => {
    assert.deepEqual(ENGINES.map(poseModelFamily), ['rapid-aio', 'qwen-edit-2511', 'qwen-image-2.1']);
    for (const kind of ['everyday', 'suggestive', 'vacation', 'sport', 'intimate', 'raunchy']) {
      assert.ok(BEATS.filter(beat => beat.kind === kind).length >= 20, `${kind} beats`);
    }
    for (const theme of Object.keys(DAY_THEMES)) {
      assert.ok(BEATS.some(beat => beat.mood === theme), `${theme} beats`);
    }
    // The sweep reaches the cases the two bugs lived in.
    assert.ok(reinforcedClasslessRuns > 0, 'Edit 2511 beats without a pose class');
    assert.ok(soloRunsWithDuoLayout > 0, 'one-person stills on a two-person layout');
    assert.ok(soloRunsWithCue > 0, 'one-person stills with a recipe cue');
  });

  it('plans the same pose on every engine', () => assertHolds(ENGINE_INDEPENDENT));
  it('reads the pose from the beat, not from what the planner appends', () =>
    assertHolds(ADDITIONS_NEUTRAL));
  it('draws a layout only for a beat that says it', () => assertHolds(LAYOUT_FROM_BEAT));
  it('keeps the stance of an Everyday beat whatever the Setting', () =>
    assertHolds(SETTING_KEEPS_STANCE));
  it('plans one figure for a solo beat and two for a couple beat', () => assertHolds(HEADCOUNT));
  it('never gives a one-person still a two-person cue', () => assertHolds(SOLO_CUES));

  it('finds a pose in every pool beat, so no Setting is read for it', () =>
    assertHolds(POSE_IN_BEAT));

  it('lets the Setting supply the pose only when the beat gives none', () => {
    const drawn = (sceneHints: string, location: string, dayMood = 'everyday') => {
      const plan = planDaySlotPose({
        slot: { id: 'evening', sceneHints, location },
        dayMood,
        intimateMix: 'mixed',
        allowCompanions: true,
        model: RAPID,
      });
      const guide = resolveSceneGuidePlan(plan.sceneText, 0, { ...plan.options, openPose: true });
      return `${guide.openPose.poseKey} h${plan.headcount}`;
    };
    const bench = 'park bench under amber streetlights at blue hour';
    // No pose in the beat: the bench seats her.
    assert.equal(drawn('humming along to a song in her head', bench), 'sit:1 h1');
    // A posture or an activity in the beat wins over the bench.
    assert.equal(drawn('standing in line at the post office, weight on one hip', bench), 'stand:1 h1');
    assert.equal(drawn('stirring a pot of pasta sauce at the stove', bench), 'cook:1 h1');
    // Heat moods never read the Setting.
    assert.equal(
      drawn('humming along to a song in her head', bench, 'suggestive'),
      drawn('humming along to a song in her head', '', 'suggestive')
    );
  });

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
