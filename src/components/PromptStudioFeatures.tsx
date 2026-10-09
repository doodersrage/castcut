import NsfwGeneratorPluginInit from '@/components/NsfwGeneratorPluginInit';
import PluginRuntimeInit from '@/components/PluginRuntimeInit';

/**
 * Prompt Studio's app-wide features, mounted by its root layout (as Castcut mounts
 * PlayFeatures): the plugin runtime and the env-gated adult generator plugin. Their pages
 * (Plugins) are Prompt Studio's, so Castcut does not load them. docs/architecture-boundaries.md.
 */
export default function PromptStudioFeatures() {
  return (
    <>
      <NsfwGeneratorPluginInit />
      <PluginRuntimeInit />
    </>
  );
}
