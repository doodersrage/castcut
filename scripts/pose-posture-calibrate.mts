/**
 * Posture question calibration: on stills whose DWPose posture read is unconfident against a
 * confident guide, ask the vision model the pose check's yes/no posture question (merged with the
 * beat's gesture questions, as the app asks them) and count caught posture misses / false alarms.
 *
 *   node --import tsx scripts/pose-posture-calibrate.mts <dataset.json> [--ask] [--rows]
 *
 * The dataset is a JSON array of
 *   { id, label: 'R' | 'W', beat?, layout?, image, guide: { aspect, people }, openpose,
 *     postureLabel?: 'R' | 'W' }
 * where `postureLabel` (else `label`) is the still's posture judged by eye against its guide.
 * `--ask` asks the vision model (LM Studio, VISION_URL / VISION_MODEL) and caches the replies next
 * to the dataset (`<dataset>.posture-answers.json`).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  gestureQuestions,
  gestureVisionPrompt,
  parseGestureAnswers,
  type GestureAnswer,
} from '../src/lib/pose-gesture';
import { applyPostureAnswer, postureQuestion } from '../src/lib/pose-posture-question';
import { DEFAULT_MIN_POSE_MATCH, parseOpenPoseJson, scorePoseMatch } from '../src/lib/pose-score';

type Row = {
  id: string;
  label: 'R' | 'W';
  postureLabel?: 'R' | 'W';
  beat?: string;
  layout?: string;
  image?: string;
  guide: { aspect: number; people: Array<Array<{ x: number; y: number } | null>> };
  openpose: unknown;
};

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: pose-posture-calibrate.mts <dataset.json> [--ask] [--rows]');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(file, 'utf8')) as Row[];
const cacheFile = `${file}.posture-answers.json`;
const cache: Record<string, string> = existsSync(cacheFile)
  ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, string>)
  : {};
const VISION_URL = process.env.VISION_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const VISION_MODEL = process.env.VISION_MODEL ?? 'nsfwvision-qwen3-vl-8b-v3';

async function ask(image: string, prompt: string): Promise<string> {
  const url = `data:image/png;base64,${readFileSync(image).toString('base64')}`;
  const response = await fetch(VISION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

type Scored = {
  row: Row;
  wrong: boolean;
  before: number;
  after: number;
  asked: boolean;
  answer: GestureAnswer | null;
  posture: string;
};

const scored: Scored[] = [];
for (const row of rows) {
  const detected = parseOpenPoseJson(row.openpose);
  if (!detected || row.guide.people.length === 0) continue;
  const match = scorePoseMatch({
    guide: row.guide.people,
    guideAspect: row.guide.aspect,
    detected,
  });
  const question = postureQuestion(match);
  let answers: GestureAnswer[] | null = null;
  if (question && row.image) {
    const questions = [
      question,
      ...gestureQuestions({ beat: row.beat, layout: row.layout ?? null }),
    ].slice(0, 3);
    const prompt = gestureVisionPrompt(questions);
    const key = `${row.id}|${prompt}`;
    if (!(key in cache) && flags.includes('--ask')) {
      cache[key] = await ask(row.image, prompt);
      writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
      process.stderr.write('.');
    }
    answers = parseGestureAnswers(cache[key], questions);
  }
  const after = applyPostureAnswer(match, question, answers);
  const lead = match.posture[0];
  scored.push({
    row,
    wrong: (row.postureLabel ?? row.label) === 'W',
    before: match.score,
    after: after.score,
    asked: Boolean(question),
    answer: answers?.find(a => a.id === 'posture') ?? null,
    posture: lead
      ? `${lead.guide.posture}${lead.guide.confident ? '' : '?'}→${lead.still?.posture ?? '-'}${lead.still?.confident ? '' : '?'}`
      : '-',
  });
}
process.stderr.write('\n');

const wrong = scored.filter(s => s.wrong);
const right = scored.filter(s => !s.wrong);
const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((100 * n) / d)}%`);
function report(name: string, miss: (s: Scored) => boolean) {
  const caught = wrong.filter(miss).length;
  const alarms = right.filter(miss).length;
  console.log(
    `${name.padEnd(40)} caught ${String(caught).padStart(3)}/${wrong.length} (${pct(caught, wrong.length)})  ` +
      `false alarms ${String(alarms).padStart(3)}/${right.length} (${pct(alarms, right.length)})`
  );
}
console.log(
  `${scored.length} stills: ${wrong.length} posture wrong, ${right.length} right; question on ${scored.filter(s => s.asked).length} (${wrong.filter(s => s.asked).length} wrong, ${right.filter(s => s.asked).length} right)`
);
report('keypoints only (before)', s => s.before < DEFAULT_MIN_POSE_MATCH);
report('keypoints + posture question', s => s.after < DEFAULT_MIN_POSE_MATCH);
for (const conf of [50, 70, 90]) {
  report(
    `keypoints + question "no" ≥ ${conf}`,
    s =>
      s.before < DEFAULT_MIN_POSE_MATCH ||
      (s.answer?.answer === 'no' && s.answer.confidence >= conf)
  );
}

if (flags.includes('--rows')) {
  for (const s of scored.filter(x => x.asked || x.wrong || x.before < DEFAULT_MIN_POSE_MATCH)) {
    console.log(
      [
        s.wrong ? 'W' : 'R',
        s.before.toFixed(2),
        s.after.toFixed(2),
        s.posture,
        s.answer ? `${s.answer.answer}/${s.answer.confidence}` : '-',
        s.row.id,
      ].join(' | ')
    );
  }
}
