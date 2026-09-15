'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import MediaScaffoldReadyPanel from '@/components/MediaScaffoldReadyPanel';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { ToolBadge, ToolLayout, accentFocusClass } from '@/components/ui/ToolPageShell';
import { ControlNetConditioningSection } from '@/components/controlnet/sections/ControlNetConditioningSection';
import { ControlNetReferenceSection } from '@/components/controlnet/sections/ControlNetReferenceSection';
import { ControlNetStructureSection } from '@/components/controlnet/sections/ControlNetStructureSection';
import { ControlNetResultSection } from '@/components/controlnet/sections/ControlNetResultSection';
import { CONTROLNET_ACCENT } from '@/components/controlnet/controlnet-tool-shared';
import type { useControlNetToolOrchestration } from '@/hooks/useControlNetToolOrchestration';

type ViewModel = ReturnType<typeof useControlNetToolOrchestration>;
type Props = ViewModel & { description: string };

export default function ControlNetToolSections({ description, ...vm }: Props) {
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    actions,
    mode,
    subject,
    scene,
    detailNotes,
    slotStrengths,
    slotModes,
    presets,
    presetNameDraft,
    setPresetNameDraft,
    setSlotStrengths,
    setSlotModes,
    setMode,
    saveSlotPreset,
    loadSlotPreset,
    deleteSlotPreset,
    setSubject,
    setScene,
    setDetailNotes,
    refFile,
    refPreview,
    scanning,
    extraRefFiles,
    extraRefPreviews,
    output,
    setOutput,
    rawPrompt,
    source,
    loading,
    error,
    setError,
    copied,
    handoffSourceImageUrl,
    handoffControlImageUrls,
    selectedModel,
    hintText,
    queueControlNetOptions,
    onRefChange,
    scanWithVision,
    onExtraRefChange,
    generate,
    copyOutput,
  } = vm;

  return (
    <ToolLayout
      accent={CONTROLNET_ACCENT}
      badge={<ToolBadge accent={CONTROLNET_ACCENT}>ControlNet</ToolBadge>}
      title="ControlNet"
      description={description}
      sidebarPersistKey="controlnet"
      sidebar={
        <SharedToolControls
          toolId="controlnet"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detailLevel => updateShared({ detail: detailLevel })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output || subject || scene}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.controlnet} />
      <EditToolRecipeStrip
        toolId="controlnet"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <TurboEditStrengthControls
        model={shared.model}
        tool="controlnet"
        value={normalizeTurboEditStrength(shared.turboEditStrength)}
        onChange={turboEditStrength => updateShared({ turboEditStrength })}
      />
      <HistoryHintSeedPanel
        tool="controlnet"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={subject}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setSubject}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result => {
          setSubject(result.hints);
          updateToolSettings({
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          });
        }}
        accentFocusClassName={accentFocusClass(CONTROLNET_ACCENT)}
      />
      <div className="mb-4">
        <MediaScaffoldReadyPanel
          kind="controlnet"
          onImported={(_summary, result) => {
            if (result.sharedPatch) {
              updateShared(result.sharedPatch);
            }
            setError(null);
          }}
        />
      </div>
      <ControlNetConditioningSection
        mode={mode}
        setMode={setMode}
        slotStrengths={slotStrengths}
        setSlotStrengths={setSlotStrengths}
        slotModes={slotModes}
        setSlotModes={setSlotModes}
        presets={presets}
        presetNameDraft={presetNameDraft}
        setPresetNameDraft={setPresetNameDraft}
        saveSlotPreset={saveSlotPreset}
        loadSlotPreset={loadSlotPreset}
        deleteSlotPreset={deleteSlotPreset}
      />
      <ControlNetReferenceSection
        refFile={refFile}
        refPreview={refPreview}
        scanning={scanning}
        handoffSourceImageUrl={handoffSourceImageUrl}
        extraRefFiles={extraRefFiles}
        extraRefPreviews={extraRefPreviews}
        handoffControlImageUrls={handoffControlImageUrls}
        slotStrengths={slotStrengths}
        setSlotStrengths={setSlotStrengths}
        slotModes={slotModes}
        setSlotModes={setSlotModes}
        onRefChange={onRefChange}
        scanWithVision={scanWithVision}
        onExtraRefChange={onExtraRefChange}
      />
      <ControlNetStructureSection
        mounted={mounted}
        subject={subject}
        setSubject={setSubject}
        scene={scene}
        setScene={setScene}
        detailNotes={detailNotes}
        setDetailNotes={setDetailNotes}
        refFile={refFile}
        loading={loading}
        error={error}
        generate={generate}
      />
      <ControlNetResultSection
        output={output}
        setOutput={setOutput}
        rawPrompt={rawPrompt}
        source={source}
        mode={mode}
        copied={copied}
        hintText={hintText}
        shared={shared}
        selectedModel={selectedModel}
        actions={actions}
        queueControlNetOptions={queueControlNetOptions}
        copyOutput={copyOutput}
      />
    </ToolLayout>
  );
}
