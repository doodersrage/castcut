import path from 'node:path';
import type { NextConfig } from 'next';
import castcutConfig from '../../next.config.base.cjs';

const repoRoot = path.join(__dirname, '..', '..');

/**
 * Prompt Studio, the classic tools: Castcut's base config (without its bundle analyzer), with the repository as the root so the
 * shared code in src/ resolves (docs/architecture-boundaries.md).
 */
/** Castcut's tracing globs are relative to the repository root; this app sits two levels down. */
function fromRepoRoot(globs: Record<string, string[]> | undefined): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(globs ?? {}).map(([route, list]) => [
      route,
      list.map(glob => glob.replace(/^\.\//, '../../')),
    ])
  );
}

const config: NextConfig = {
  ...castcutConfig,
  env: { ...castcutConfig.env, NEXT_PUBLIC_APP_PROFILE: 'classic' },
  outputFileTracingExcludes: fromRepoRoot(castcutConfig.outputFileTracingExcludes),
  outputFileTracingIncludes: fromRepoRoot(castcutConfig.outputFileTracingIncludes),
  turbopack: { ...castcutConfig.turbopack, root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default config;
