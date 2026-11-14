# Castcut — plan to finish the buildout

**Written:** 13 November 2026, against `main` at `6af0cc2f` (v3.17.0).

Castcut's own roadmap ([ROADMAP.md](ROADMAP.md), M0–M12, plus the script-driven Short in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)) is essentially done. What remains is making the
output trustworthy, fast and unattended, and proven by someone other than its author. The plan:
freeze features and run six phases over roughly 12 weeks, solo.

This is a proposal read from the repository's documents and code, not an audit of every file. Each
phase should be reconciled against the code before work starts, as ROADMAP.md asks.

## At a glance

| Phase                         | Weeks | Gate                                         |
| ----------------------------- | ----- | -------------------------------------------- |
| 1. Close the open gates       | 1     | CI green on 20 consecutive runs of `main`    |
| 2. One record, one road       | 2–3   | A project restores on a second machine in CI |
| 3. A server-side runner       | 3–6   | A 70-shot short renders with the tab closed  |
| 4. Continuity you can measure | 6–9   | Under 10% of rejected takes have no finding  |
| 5. Speed through two tiers    | 8–10  | A 12-scene animatic in under 15 minutes      |
| 6. Prove it and prune it      | 10–12 | A public film, and five outside testers      |

Phases 1 to 3 build on each other. Continuity, speed and the proving phase overlap.

## 1. Close the open gates (week 1)

Three checks have been waiting on a person since v3.0.1, and two tests are unreliable. Clear both
before anything else.

- [ ] Run the real Docker upgrade with `scripts/upgrade-check.mjs` before and after.
- [ ] Smoke-test the `.deb` desktop build at the window.
- [ ] Do the V5 timed walkthrough.
- [ ] Fix "This Day as a script", which fails on the base commit.
- [ ] Fix "a shot's story state is kept after a reload", which is flaky.
- [ ] Run e2e against a production build. The "Loading scene" flake was dev-server only.

**Done when:** CI is green on 20 consecutive runs of `main`.

## 2. One record, one road (weeks 2–3)

A Short's moments still live in two places, and most production state sits in storage with no
schema version. Finish the consolidation before building on it.

- **Finish Step 5f.** A linked Short stops reading `tools.day`. Close the tombstone-merge gap, where
  a Scene deleted on another device empties its slim card.
- **Version the stored state.** Dexie is still at `version(1)`. The M0 audit found most production
  state in one unversioned `settings-cache` blob. Check what has moved since, then give Scenes,
  scripts and Cut versioned stores with tested migrations.

**Done when:** a project exports as one folder and restores on a second machine in CI.

## 3. A server-side runner (weeks 3–6)

This is the biggest structural gap. Take assembly lives in React hooks
(`useDayPlannerToolOrchestrationCore.ts` is 4,249 lines), so a run with checks, redo and keep-best
still needs the Scene page open.

- **Build Part 14 option B.** Extract take assembly (references, plates, pose guides, prompt
  building) into a pure module the server can call.
- **Keep the run record in SQLite** and make the browser a viewer of it.
- **Retry lost jobs automatically.** Today a job ComfyUI lost is queued again by hand.

**Done when:** you start a 70-shot short, close the browser, and return to dailies. Killing ComfyUI
mid-run resumes with no duplicates.

## 4. Continuity you can measure (weeks 6–9)

The T5 review in [docs/consistency-report.md](docs/consistency-report.md) (76 takes, two faces,
Auto-review on) sets the targets. Of 27 rejected takes, 5 had no finding at all.

| Check            | Where it stands                                                    | What to do                                                                                 |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Place            | Found 0, missed 2. "Same place" rendered as different rooms.       | Compare backgrounds against the location's picture. M8's "Make its picture" is still open. |
| Garment colour   | "Ink coveralls" rendered white, unflagged.                         | Check garment and colour against the outfit.                                               |
| Pose             | 44–47% precision. Seated and half-hidden bodies score falsely low. | Use the gesture question for those shots instead of the skeleton score.                    |
| Two-person shots | The twinned close-up is open. The partner has no reverse shots.    | Fix the cropped pose guide. Add his close-up on his line.                                  |

- **Grow the reviewed set** to about 300 takes with two reviewers, including clips and two-person
  shots.
- **Run `checkQuality` nightly** so every change to a check cites its numbers.

**Done when:** under 10% of rejected takes have no finding, and any check that triggers a reroll is
at least 70% precise or demoted to advisory.

## 5. Speed through two tiers (weeks 8–10)

An animated shot takes about 6 minutes, so a 12-scene short of roughly 70 shots runs 1–2 hours or
more. The engine rematch showed Qwen-Image 2.1 Turbo at a fifth of Edit 2511's time, with weaker
framing and face match.

- **Preview on 2.1 Turbo.** Draft every shot on it and place the drafts in the animatic.
- **Finish on Edit 2511.** Render and animate only the shots approved from the animatic.
- **Show the budget** before a run starts: shots, minutes, and which tier.

**Done when:** a 12-scene short is a watchable animatic in under 15 minutes, and finals run
overnight unattended.

## 6. Prove it and prune it (weeks 10–12)

Every review so far had one reviewer, and the project has had little outside use. The last phase
puts the tool in front of other people.

- **Make a flagship film.** 3–5 minutes, two or more characters, made only in Castcut, published
  with its project package.
- **Test with outsiders.** Put five people through [the first-film guide](docs/first-film.md) on
  clean machines with a timer.
- **Cut surface area.** Move the parked Extras into a plugin, reduce four workspace modes to two,
  and make the "her"-default copy neutral.

**Done when:** the film is public, and the five testers reach a first cut without help.

## What not to build

None of these moves the numbers above, so they wait until the six phases are done.

- More generation engines
- More cloud providers
- More Cut effects
- Phone parity

## Sources

- [ROADMAP.md](ROADMAP.md): product direction and milestones
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): the M0 audit, Part 14 (runs with the tab
  closed), Part 20 (the script-driven Short), the engine rematch
- [docs/consistency-report.md](docs/consistency-report.md): the V3 and T5 reviewed sets
- [docs/limitations.md](docs/limitations.md): known limitations
- [CHANGELOG.md](CHANGELOG.md): releases through v3.17.0
