import type { AppNavLink } from '../app/nav-catalog';
import type { ServerEnvSummary } from '../server/server-env-summary';
import {
  isNsfwGeneratorEnabledClient,
  isNsfwGeneratorEnabledServer,
  NSFW_GENERATOR_ENV_SERVER,
} from './nsfw-generator-env';
import { NSFW_GENERATOR_ROUTE } from './nsfw-generator-plugin';

export const NSFW_GENERATOR_NAV_LINK: AppNavLink = {
  href: NSFW_GENERATOR_ROUTE,
  label: 'Adult generator',
  description: 'NSFW scene prompts with presets',
};

export function readNsfwGeneratorEnabledFromServerEnv(
  serverEnv: ServerEnvSummary | undefined
): boolean {
  if (!serverEnv?.groups?.length) {
    return false;
  }
  for (const group of serverEnv.groups) {
    for (const field of group.fields) {
      if (field.key === NSFW_GENERATOR_ENV_SERVER) {
        return field.value.trim().toLowerCase() === 'true';
      }
    }
  }
  return false;
}

/** True when either build-time client flag or server env gate is on. */
export function isNsfwGeneratorEnabledAnywhere(serverEnv?: ServerEnvSummary): boolean {
  return (
    isNsfwGeneratorEnabledClient() ||
    isNsfwGeneratorEnabledServer() ||
    readNsfwGeneratorEnabledFromServerEnv(serverEnv)
  );
}

export async function fetchNsfwGeneratorEnabled(): Promise<boolean> {
  if (isNsfwGeneratorEnabledClient() || isNsfwGeneratorEnabledServer()) {
    return true;
  }
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as { serverEnv?: ServerEnvSummary };
    return readNsfwGeneratorEnabledFromServerEnv(data.serverEnv);
  } catch {
    return false;
  }
}
