import type { ContinuityFinding } from '@/lib/checks/findings';
import type { ScriptScene } from '@/lib/script/parse';
import { coverageSubject } from './script-coverage';
import { speakerKey } from './script-cast';
import { DOING_RE } from './script-shots';

/**
 * Script notes (2026-11-08): what Castcut can't film, or films badly, found in a script's words
 * by rule — not by the LLM — the moment it's written or imported, before any shot is planned.
 * The writer is told all of this (episode-writer.ts) and still slips; an imported script was
 * never told. Each note can be fixed by the LLM (a revision of that scene) or said to be fine.
 */

/** A spoken line longer than this is a long read line and a long talking clip. */
export const NOTE_LINE_WORDS = 20;

const UNFILMABLE_RE =
  /\b(montage|flashback|flashes back|dream sequence|dreams? (?:of|that)|split screen|crowds?|audience|throng|queues? (?:of|out)|packed (?:with|room|café|bar)|the whole (?:town|room|class)|drives? (?:off|away|down)|speeding|explodes?|explosion)\b/i;
/**
 * Craft (2026-11-10, "more training for the writer"): what the writer is told and still slips on —
 * a line that says the feeling outright, names said in the lines, a scene that ends on a goodbye
 * or a walk out. Found by rule, fixed by the same revision as the rest.
 */
const FEELING =
  'angry|sad|hurt|scared|afraid|happy|upset|jealous|lonely|frustrated|betrayed|anxious|nervous|guilty|ashamed|disappointed|overwhelmed|terrified|heartbroken|furious';
const ON_THE_NOSE_RE = new RegExp(
  `\\bI(?:['’]m| am| feel| felt)\\s+(?:so |really |just |very |a little |kind of )?(?:${FEELING})\\b|\\bmakes? me (?:feel|so)\\b|\\bhow (?:does|did|do) (?:that|it|this) make you feel\\b|\\bI feel like (?:you|we)\\b`,
  'i'
);
const LEAVING_RE =
  /\b(?:walks? (?:out|off|away)|leaves?(?: the room| without)?\.?$|exits?\b|heads? (?:out|for the door)|the door (?:closes|shuts) behind)/i;
/** The line's last sentence is a goodbye ("Fine. Bye."). */
const GOODBYE_RE =
  /(?:^|[.!?…]\s+)(?:ok(?:ay)?[,.]? )?(?:bye|goodbye|good night|night|see you|see ya|take care)\b[^.!?…]*[.!?…]*$/i;

/**
 * Beats (action paragraphs and spoken lines) past which a scene runs long: a scene is about 45 s
 * on screen and each beat a shot or more — the writer, asked for a page, wrote 20 to 40 (2026-11-10).
 */
export const NOTE_SCENE_BEATS = 24;

/**
 * Inner life in the action (2026-11-10: "a breath she didn't know was held", "his obliviousness
 * is her own silent scream"): stills are posed from the action, and these give them nothing.
 */
const UNSEEN_RE =
  /\b(?:(?:she|he|they|I) (?:didn['’]t|doesn['’]t|don['’]t) know|(?:she|he|they) (?:thinks?|wonders?|reali[sz]es?|remembers?|feels?|knows?|decides?)\b|(?:silent|inner|unspoken) (?:scream|voice|plea|promise)|as if (?:she|he|they|it) (?:were|was|had)|somewhere (?:inside|deep)|a (?:memory|thought) of)/gi;

/** Phrases of inner life in a scene's action before it is noted (one is a writer's licence). */
export const NOTE_UNSEEN = 2;

/** Lines of a scene that say another speaker's name before it is noted: people rarely do. */
export const NOTE_NAMES_SAID = 2;

const CAMERA_RE =
  /\b(CLOSE ON|ANGLE ON|PAN (?:TO|ACROSS)|ZOOM (?:IN|OUT)|WE SEE|WE HEAR|INSERT|POV|SMASH CUT)\b/;

export function scriptNotes(input: {
  scriptId: string;
  scene: ScriptScene;
  /** The scenes before it in the script: a line said there again is noted. */
  earlier?: readonly ScriptScene[];
}): ContinuityFinding[] {
  const { scene } = input;
  const subject = coverageSubject(input.scriptId, scene.id);
  const out: ContinuityFinding[] = [];
  const add = (rule: ContinuityFinding['rule'], evidence: string, suggestion: string) =>
    out.push({
      id: `${subject}:${rule}`,
      rule,
      subject,
      severity: 'warns',
      source: 'Script notes',
      evidence,
      suggestion,
    });
  const action = scene.elements.filter(element => element.kind === 'action');
  const dialogue = scene.elements.filter(element => element.kind === 'dialogue' && element.speaker);
  // Seen in it: who speaks on screen (a voice heard, not seen, doesn't count).
  const seen = new Set(
    dialogue
      .filter(element => !/^(?:v\.?\s*o|o\.?\s*s|o\.?\s*c)\.?$/i.test(element.extension ?? ''))
      .map(element => speakerKey(element.speaker!))
  );
  if (seen.size >= 3) {
    add(
      'script-many',
      `${seen.size} people speak on screen here`,
      'A still holds two: split it into two scenes, or have one of them heard, not seen (V.O.).'
    );
  }
  const long = dialogue.filter(
    element => element.text.split(/\s+/).filter(Boolean).length > NOTE_LINE_WORDS
  );
  if (long.length) {
    add(
      'script-long-line',
      `${long.length} line${long.length === 1 ? '' : 's'} over ${NOTE_LINE_WORDS} words`,
      'Shorter lines read and animate better — split or trim them.'
    );
  }
  const unfilmable = action.map(element => UNFILMABLE_RE.exec(element.text)?.[0]).find(Boolean);
  if (unfilmable) {
    add(
      'script-unfilmable',
      `“${unfilmable.toLowerCase()}” in the action`,
      'Stills show a moment with one or two people: show it through them instead.'
    );
  }
  const camera = action.map(element => CAMERA_RE.exec(element.text)?.[0]).find(Boolean);
  if (camera) {
    add(
      'script-camera',
      `A camera direction (“${camera}”)`,
      'Shots are planned for you: say what is seen instead.'
    );
  }
  if (!action.length && dialogue.length) {
    add(
      'script-no-action',
      'Nothing is seen happening — only lines',
      'Give it an action line: where they are and what they do while they talk.'
    );
  } else if (action.length && !action.some(element => DOING_RE.test(element.text))) {
    add(
      'script-no-action',
      'Its action is only atmosphere — no one is doing anything',
      'Say what someone does — sits, pours, leans on the counter: the stills are posed from it.'
    );
  }
  const beats = action.length + dialogue.length;
  if (beats > NOTE_SCENE_BEATS) {
    add(
      'script-long-scene',
      `It runs ${beats} beats`,
      'A scene is about a page — eight to sixteen beats: keep what moves it on, and cut the rest.'
    );
  }
  // The same line said twice (a small model's loop): the second is a shot that says nothing new.
  // Said in an earlier scene of the script too (2026-11-10: one line in three scenes of four).
  const said = new Map<string, number>();
  for (const element of dialogue) {
    const key = lineKey(element.text);
    if (key.split(' ').length >= 3) said.set(key, (said.get(key) ?? 0) + 1);
  }
  const repeated = [...said.entries()].find(([, times]) => times > 1);
  const before = new Set(
    (input.earlier ?? []).flatMap(earlier =>
      earlier.elements
        .filter(element => element.kind === 'dialogue' && element.speaker)
        .map(element => lineKey(element.text))
    )
  );
  const again = repeated ? null : [...said.keys()].find(key => before.has(key));
  if (repeated || again) {
    const key = repeated?.[0] ?? again!;
    const line = dialogue.find(element => lineKey(element.text) === key)!;
    add(
      'script-repeated-line',
      repeated
        ? `“${clip(line.text)}” is said ${repeated[1]} times`
        : `“${clip(line.text)}” was said in an earlier scene`,
      'Say it once — or change it the second time, so it lands differently.'
    );
  }
  // What a still can't show: what someone thinks, knows or remembers, said in the action.
  const unseen = action.flatMap(element => element.text.match(UNSEEN_RE) ?? []);
  if (unseen.length >= NOTE_UNSEEN) {
    add(
      'script-unseen',
      `The action tells what can’t be seen (“${unseen[0]!.toLowerCase()}”)`,
      'Say what the camera sees — what they do, their face, what they hold — not what they think.'
    );
  }
  const onTheNose = dialogue.filter(element => ON_THE_NOSE_RE.test(element.text));
  if (onTheNose.length) {
    add(
      'script-on-the-nose',
      `${onTheNose.length === 1 ? 'A line says' : `${onTheNose.length} lines say`} the feeling outright (“${clip(onTheNose[0]!.text)}”)`,
      'Let them talk around it — what they do or ask instead shows what they feel.'
    );
  }
  // A speaker's name said by someone else in the scene, line by line.
  const names = [...new Set(dialogue.map(element => speakerKey(element.speaker!)))]
    .map(key => key.split(' ')[0]!)
    .filter(name => name.length > 1);
  const named = dialogue.filter(element => {
    const own = speakerKey(element.speaker!).split(' ')[0];
    return names.some(
      name => name !== own && new RegExp(`\\b${escapeRe(name)}\\b`, 'i').test(element.text)
    );
  });
  if (named.length >= NOTE_NAMES_SAID) {
    add(
      'script-names',
      `Names said in ${named.length} lines`,
      'People rarely say each other’s names when they talk: keep one at most.'
    );
  }
  const spoken = scene.elements.filter(
    element => element.kind === 'action' || (element.kind === 'dialogue' && element.speaker)
  );
  const last = spoken[spoken.length - 1];
  if (
    last &&
    spoken.length > 2 &&
    (last.kind === 'action' ? LEAVING_RE.test(last.text.trim()) : GOODBYE_RE.test(last.text.trim()))
  ) {
    add(
      'script-weak-ending',
      last.kind === 'action' ? 'It ends on someone leaving' : 'It ends on a goodbye',
      'End on a turn instead — a reaction, a decision, or a line that lands.'
    );
  }
  return out;
}

const lineKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A line quoted short in a note. */
function clip(text: string, words = 8): string {
  const all = text.replace(/\s+/g, ' ').trim().split(' ');
  return all.length > words ? `${all.slice(0, words).join(' ')}…` : all.join(' ');
}
