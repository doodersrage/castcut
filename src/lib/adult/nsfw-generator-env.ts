/** Env-gated adult content — Adult generator plugin and Roleplay Sultry / Explicit / Raunchy. */

export const NSFW_GENERATOR_ENV_SERVER = 'PROMPT_NSFW_GENERATOR_ENABLED';
export const NSFW_GENERATOR_ENV_CLIENT = 'NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED';

export function isNsfwGeneratorEnabledServer(): boolean {
  return process.env[NSFW_GENERATOR_ENV_SERVER]?.trim().toLowerCase() === 'true';
}

/** Client/build-time flag — must match server gate for a working deployment. */
export function isNsfwGeneratorEnabledClient(): boolean {
  if (typeof process !== 'undefined') {
    return process.env[NSFW_GENERATOR_ENV_CLIENT]?.trim().toLowerCase() === 'true';
  }
  return false;
}

export function nsfwGeneratorEnvHint(): string {
  return `Set ${NSFW_GENERATOR_ENV_SERVER}=true and ${NSFW_GENERATOR_ENV_CLIENT}=true, then rebuild.`;
}
