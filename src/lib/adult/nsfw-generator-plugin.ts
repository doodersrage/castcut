import type { PluginManifest } from '../plugin/manifest';
import {
  isNsfwGeneratorEnabledClient,
  isNsfwGeneratorEnabledServer,
  NSFW_GENERATOR_ENV_CLIENT,
  NSFW_GENERATOR_ENV_SERVER,
} from './nsfw-generator-env';

export const NSFW_GENERATOR_PLUGIN_ID = 'nsfw-generator';
export const NSFW_GENERATOR_ROUTE = '/plugins/nsfw-generator';

export const NSFW_GENERATOR_MANIFEST: PluginManifest = {
  id: NSFW_GENERATOR_PLUGIN_ID,
  label: 'Adult generator',
  version: '1.0.0',
  enabled: true,
  nav: [
    {
      href: NSFW_GENERATOR_ROUTE,
      label: 'Adult generator',
      description: 'NSFW scene prompts with presets (env-gated)',
    },
  ],
  tools: [
    {
      id: 'generator',
      title: 'Adult generator',
      route: NSFW_GENERATOR_ROUTE,
    },
  ],
};

export function isNsfwGeneratorPlugin(manifest: PluginManifest): boolean {
  return manifest.id.trim().toLowerCase() === NSFW_GENERATOR_PLUGIN_ID;
}

/** Hide nav/install surface when the deploy flag is off. Prefer runtime health check in UI. */
export function shouldExposeNsfwGeneratorPlugin(): boolean {
  return isNsfwGeneratorEnabledClient() || isNsfwGeneratorEnabledServer();
}

export function nsfwGeneratorPluginEnvLabels(): { server: string; client: string } {
  return {
    server: NSFW_GENERATOR_ENV_SERVER,
    client: NSFW_GENERATOR_ENV_CLIENT,
  };
}
