# Castcut — pose system plan

**Written:** 18 November 2026, against `main` at `20cd6335` (v4.1.0).

Nothing automatic can judge a pose reliably today, so this plan builds a trustworthy judge first and
uses it to fix delivery, framing and continuity. It runs six phases over about 10 weeks.

This is a proposal read from the code and reports; nothing was run to write it. The gates' target
numbers are proposals too. Each phase should be reconciled against the code before work starts.

## Where the pose system stands today

Edit 2511 and Rapid AIO hold most poses, Qwen-Image 2.1 holds fewer, and the automatic check is
right less than half the time.

| What                                     | Today                                                          | Source                  |
| ---------------------------------------- | -------------------------------------------------------------- | ----------------------- |
| Everyday poses right, by eye             | Rapid AIO 95%, Edit 2511 95%, Qwen-Image 2.1 81%               | Pose report card, 5 Oct |
| Sport poses right, by eye                | Rapid AIO 80%, Edit 2511 88%, Qwen-Image 2.1 63%               | Pose report card        |
| Pose check precision                     | 44–47%, so it only advises                                     | Consistency report      |
| Pose check against eye labels            | flagged 16% of wrong stills and 8% of right ones               | Pose report card        |
| ControlNet on Qwen-Image 2.1, hard poses | about 7 in 10 right against 5 in 10, at 2.5–3× the render time | `docs/models.md`        |
| Size                                     | 62 modules, about 18,400 lines in `src/lib/pose`               | Repo                    |

Push-up and pull-up hold on no engine and stay out of the built-in packs.

## At a glance

| Phase                              | Weeks | Gate                                                  |
| ---------------------------------- | ----- | ----------------------------------------------------- |
| 1. A benchmark that stays current  | 1–2   | One command regenerates the card                      |
| 2. A judge you can trust           | 2–4   | Posture verdict 85% precise at 70% recall             |
| 3. Close the gap on Qwen-Image 2.1 | 4–6   | 90% of everyday and 80% of sport poses, on 2.1        |
| 4. Guides that fit the shot        | 5–7   | No duplicate figures; 90% of close-ups stay close-ups |
| 5. Pose continuity within a scene  | 7–9   | No unscripted posture jump between adjacent shots     |
| 6. Speed and upkeep                | 9–10  | The pose check adds under 2 s a take                  |

The benchmark and the judge come first because every later gate is scored with them.

## 1. A benchmark that stays current (weeks 1–2)

The report card dates from v2.3 on Qwen-Image 2.1 Pruna 8-step, with two or three stills a cell and
one Cast. Every later phase needs it current.

- **Re-run the card** with `scripts/pose-bench` on today's engines, including 2.1 Turbo, at five
  seeds a cell.
- **Label once, with two reviewers.** Keep the labels as the gold set. This also settles whether
  V3's labels were flipped as T5's were.

**Done when:** one command regenerates the card.

## 2. A judge you can trust (weeks 2–4)

The pose check returns one score that mixes several questions. Its misses are arm gestures and
missing props; its false alarms are seated and half-hidden bodies.

- **Split the verdict.** Score posture, gesture or prop, framing and headcount separately, and
  report precision and recall for each on the gold set.
- **Keep the existing rule.** A verdict at 70% precision or better may redo a take; the rest
  advise.
- **Test 3D.** Try comparing poses after the existing 3D lift, since foreshortened limbs cause many
  false misses.

**Done when:** the posture verdict reaches 85% precision at 70% recall, and the judge agrees with
the eye on 90% of card cells.

## 3. Close the gap on Qwen-Image 2.1 (weeks 4–6)

Qwen-Image 2.1 gives the closest face and the weakest poses: 16 layouts are weak on it, and today
most of those stills move to another engine.

- **Use ControlNet per layout.** Turn it on only for the layouts weak on 2.1, and for built-in
  poses as well as ones the player made.
- **Compare it with the hand-off.** Moving a still to Edit 2511 costs a model switch and a looser
  face match (0.52 against 0.18 on the card).

**Done when:** 2.1 holds 90% of everyday and 80% of sport poses without leaving the engine.

## 4. Guides that fit the shot (weeks 5–7)

A guide cropped to a shot size can mislead every engine. On 15 Nov, seated two-shots kept hips and
knees on the bottom edge, and the engines drew a person twice (0 of 3 clean with the map as drawn,
3 of 3 once fixed).

- **Test the matrix:** shot size × posture × one or two people, through the guide builder.
- **Check invariants in unit tests:** no joint stubs on an edge, and one figure per person.
- **Confirm live** on a small A/B with the same seeds.

**Done when:** the matrix shows no duplicate figures on three seeds, and 90% of close-ups come back
as close-ups.

## 5. Pose continuity within a scene (weeks 7–9)

Each shot's pose is planned on its own today, so nothing ties a character's posture in one shot to
the next. Short clips cut together need that tie.

- **Block each scene once in 3D.** Place the characters with the rig and derive every shot's guide
  from its camera. `rig3d-world.ts` and `camera-shot.ts` exist; check how far they already go.
- **Chain clips.** Each clip starts from the pose the last one ended on, and end frames pass the
  posture verdict from phase 2.

**Done when:** a 43-shot short has no posture jump between adjacent shots that the script doesn't
call for.

## 6. Speed and upkeep (weeks 9–10)

The pose check runs as a ComfyUI job plus a vision call for each take, and the library still
carries a legacy guide style kept for A/B.

- **Move the check off the GPU queue.** Try DWPose on the CPU, and run checks while the next take
  renders.
- **Prune.** Retire the legacy guide style once the benchmark shows OpenPose is at least as good
  everywhere.

**Done when:** the pose check adds under 2 s a take.

## Sources

- [docs/pose-report-card.md](docs/pose-report-card.md): pose accuracy by engine, weak layouts, the
  check against eye labels
- [docs/consistency-report.md](docs/consistency-report.md): the pose check's precision on V3 and
  T5, and why it became advisory
- [docs/models.md](docs/models.md): the ControlNet result on Qwen-Image 2.1
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): the 15 Nov cropped-guide fix
- [src/lib/pose](src/lib/pose): `score.ts`, `gesture.ts`, `posture.ts`, `guide-openpose.ts`,
  `rig3d-pose.ts`
