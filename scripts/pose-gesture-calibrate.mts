/**
 * Gesture check calibration: hand reads (DWPose body + hands vs the guide), the vision model's
 * yes/no action questions, and the two combined, on a labelled set of stills.
 *
 *   node --import tsx scripts/pose-gesture-calibrate.mts <dataset.json> [--ask] [--rows]
 *
 * The dataset is a JSON array of
 *   { id, label: 'R' | 'W', beat, layout, image?, guide: { aspect, people }, openpose }
 * where `label` is the still judged by eye (R = the beat's gesture / prop is shown, W = missed),
 * `openpose` is the DWPose `openpose_json` read WITH hand detection, and `image` the still's path.
 * `--ask` asks the vision model (LM Studio, VISION_URL / VISION_MODEL) for every row with
 * questions and caches the replies next to the dataset (`<dataset>.answers.json`).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  decideGesture,
  gestureQuestions,
  gestureVisionPrompt,
  parseGestureAnswers,
  readHandGestures,
  type GestureAnswer,
} from '../src/lib/pose-gesture';
import { parseOpenPoseJson, scorePoseMatch } from '../src/lib/pose-score';

type Row = {
  id: string;
  label: 'R' | 'W';
  beat: string;
  layout: string;
  image?: string;
  guide: { aspect: number; people: Array<Array<{ x: number; y: number } | null>> };
  openpose: unknown;
};

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: pose-gesture-calibrate.mts <dataset.json> [--ask] [--rows]');
  process.exit(1);
}
const rows = (JSON.parse(readFileSync(file, 'utf8')) as Row[]).filter(
  row => row.label === 'R' || row.label === 'W'
);
const cacheFile = `${file}.answers.json`;
const cache: Record<string, string> = existsSync(cacheFile)
  ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, string>)
  : {};

const VISION_URL = process.env.VISION_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const VISION_MODEL = process.env.VISION_MODEL ?? 'nsfwvision-qwen3-vl-8b-v3';

async function ask(image: string, prompt: string): Promise<string> {
  const bytes = readFileSync(image);
  const url = `data:image/png;base64,${bytes.toString('base64')}`;
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
  asked: boolean;
  answers: GestureAnswer[] | null;
  handMiss: boolean;
  handRead: boolean;
  handKinds: string;
};

const scored: Scored[] = [];
for (const row of rows) {
  const questions = gestureQuestions({ beat: row.beat, layout: row.layout });
  const detected = parseOpenPoseJson(row.openpose);
  let handMiss = false;
  let handRead = false;
  let handKinds = '';
  if (detected && row.guide.people.length > 0) {
    const match = scorePoseMatch({
      guide: row.guide.people,
      guideAspect: row.guide.aspect,
      detected,
    });
    const index = match.assignment[0] ?? -1;
    const aspect =
      detected.canvas.width > 0 ? detected.canvas.width / detected.canvas.height : row.guide.aspect;
    const reads = readHandGestures({
      guide: row.guide.people[0]!,
      guideAspect: row.guide.aspect,
      still: index >= 0 ? detected.people[index] : null,
      stillHands: index >= 0 ? detected.hands?.[index] : null,
      stillAspect: aspect,
    });
    handRead = reads.some(read => read.still !== 'unknown');
    handMiss = reads.some(read => read.still === 'missing');
    handKinds = reads.map(read => `${read.kind}:${read.still}`).join(' ');
  }
  let answers: GestureAnswer[] | null = null;
  if (questions.length > 0) {
    const key = `${row.id}|${questions.map(q => q.text).join('|')}`;
    if (!(key in cache) && flags.includes('--ask') && row.image) {
      cache[key] = await ask(row.image, gestureVisionPrompt(questions));
      writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
      process.stderr.write('.');
    }
    answers = parseGestureAnswers(cache[key], questions);
  }
  scored.push({ row, asked: questions.length > 0, answers, handMiss, handRead, handKinds });
}
process.stderr.write('\n');

const wrong = scored.filter(s => s.row.label === 'W');
const right = scored.filter(s => s.row.label === 'R');
const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((100 * n) / d)}%`);
function report(name: string, flag: (s: Scored) => boolean) {
  const caught = wrong.filter(flag).length;
  const alarms = right.filter(flag).length;
  const precision = caught + alarms === 0 ? 0 : caught / (caught + alarms);
  console.log(
    `${name.padEnd(46)} caught ${String(caught).padStart(3)}/${wrong.length} (${pct(caught, wrong.length)})  ` +
      `false alarms ${String(alarms).padStart(3)}/${right.length} (${pct(alarms, right.length)})  ` +
      `precision ${Math.round(precision * 100)}%`
  );
}

const llmNo = (s: Scored, conf: number) =>
  Boolean(s.answers?.some(a => a.answer === 'no' && a.confidence >= conf));
const llmYes = (s: Scored, conf: number) =>
  Boolean(s.answers?.some(a => a.answer === 'yes' && a.confidence >= conf)) &&
  !s.answers?.some(a => a.answer === 'no');

console.log(
  `${rows.length} stills: ${wrong.length} wrong, ${right.length} right; ` +
    `questions on ${scored.filter(s => s.asked).length}, answered ${scored.filter(s => s.answers).length}, ` +
    `hands read on ${scored.filter(s => s.handRead).length}`
);
report('(a) hands alone (any gesture missing)', s => s.handMiss);
for (const conf of [50, 70, 80, 90, 95]) {
  report(`(b) vision "no" ≥ ${conf}`, s => llmNo(s, conf));
}
for (const conf of [70, 80, 90]) {
  report(
    `(c) vision "no" ≥ ${conf} OR hands (no vision yes)`,
    s => llmNo(s, conf) || (s.handMiss && !llmYes(s, 50))
  );
  report(`(c) vision "no" ≥ ${conf} AND hands`, s => llmNo(s, conf) && s.handMiss);
}
report('(c) decideGesture (shipped rule)', s =>
  s.asked
    ? decideGesture({
        questions: gestureQuestions({ beat: s.row.beat, layout: s.row.layout }),
        answers: s.answers,
      }).miss
    : false
);

if (flags.includes('--rows')) {
  for (const s of scored) {
    console.log(
      [
        s.row.label,
        s.row.id,
        s.row.layout,
        s.answers?.map(a => `${a.id}=${a.answer}/${a.confidence}`).join(',') ?? '-',
        s.handKinds || '-',
        s.row.beat.slice(0, 60),
      ].join(' | ')
    );
  }
}
