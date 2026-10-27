@AGENTS.md

# Castcut — Claude Code Instructions

## Project mission

Castcut is a local-first AI filmmaking and production workbench.
It helps users develop characters and visual references, plan stories
and shots, generate assets through ComfyUI, preserve continuity,
organize takes, edit sequences, manage audio, and prepare deliverables.

The goal is a coherent filmmaking workflow, not simply a wrapper around
AI image or video generation.

## Mandatory rules

1. Read the relevant Next.js documentation referenced by AGENTS.md
   before modifying code that depends on those APIs or conventions.
2. Inspect the existing architecture and established project patterns
   before proposing or implementing changes.
3. Treat the actual repository as the source of truth. Do not assume
   frameworks, APIs, paths, scripts, or features without verifying them.
4. Preserve existing functionality unless a change explicitly requires
   otherwise.
5. Do not make broad rewrites when a focused change will solve the problem.
6. Protect user projects, generated media, configuration, and production
   history. Never perform destructive migrations or cleanup without
   understanding the impact.
7. Do not mark work complete without running the relevant checks and
   reporting their results.
8. Do not implement the entire roadmap in one pass. Work in small,
   verifiable increments.

## Initial workflow

Before implementing a feature:

1. Inspect the relevant files and trace the existing behavior.
2. Identify dependencies, affected components, persistence, and tests.
3. Summarize the current implementation and the proposed change.
4. Identify risks, compatibility concerns, and migration requirements.
5. Define clear acceptance criteria.
6. Implement the smallest complete change.
7. Run relevant tests, type checks, linting, and build checks where available.
8. Summarize files changed, behavior affected, checks run, and remaining risks.

## Roadmap discipline

Use ROADMAP.md for product direction and IMPLEMENTATION_PLAN.md
for the current, audited implementation sequence, if those files exist.

Do not assume roadmap items are already implemented. Verify the current
code before deciding what to build.

Prioritize correctness, reliability, data integrity, and a coherent user
workflow over adding more features.

## Generation and take integrity

When working on generation or media workflows:

- Trace the complete path from user action through queue execution,
  output handling, persistence, and UI display.
- Preserve the relationship between prompts, settings, references,
  generated outputs, and their associated takes.
- Handle failures, retries, duplicate submissions, and interrupted jobs
  consistently with existing architecture.
- Avoid silently overwriting successful outputs.
- Preserve enough provenance to understand how a take was produced.
- Do not assume ComfyUI behavior; inspect the current integration and
  relevant documentation.

## UI and UX

- Follow the existing design system and component conventions.
- Prefer consistent, task-focused interfaces over unrelated new panels.
- Preserve keyboard accessibility, loading states, error states, and
  useful empty states.
- Make destructive actions explicit and recoverable where practical.
- Avoid fabricated product data or fake success states.

## Data and security

- Validate untrusted input at appropriate boundaries.
- Keep secrets and credentials out of client bundles, logs, and commits.
- Follow existing authorization and filesystem access patterns.
- Treat project files and generated media as user data.
- Make schema changes backward-compatible where practical, with a clear
  migration and rollback strategy.

## Git and dependency safety

- Do not discard unrelated user changes.
- Do not reset, clean, or rewrite Git history unless explicitly requested.
- Avoid adding dependencies when existing project tools are sufficient.
- Do not commit, push, or publish unless explicitly requested.

## Definition of done

A change is complete when:

- The requested behavior is implemented.
- Relevant tests and checks have been run, with failures disclosed.
- Existing behavior and user data are protected.
- Documentation is updated when necessary.
- Remaining limitations and follow-up work are stated clearly.
