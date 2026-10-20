'use client';

import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene/hint-source';
import type { VideoToolCache } from '@/lib/settings/cache';

type VideoPromptHistorySeedSectionProps = {
  toolSettings: VideoToolCache;
  subject: string;
  accentFocusClassName: string;
  onSubjectChange: (value: string) => void;
  onUpdateToolSettings: (patch: Partial<VideoToolCache>) => void;
};

export default function VideoPromptHistorySeedSection({
  toolSettings,
  subject,
  accentFocusClassName,
  onSubjectChange,
  onUpdateToolSettings,
}: VideoPromptHistorySeedSectionProps) {
  return (
    <HistoryHintSeedPanel
      tool="video"
      hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
      historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
      hints={subject}
      randomTheme={toolSettings.randomTheme ?? ''}
      lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
      onHintSourceChange={source => onUpdateToolSettings({ hintSource: source })}
      onHistorySeedScopeChange={scope => onUpdateToolSettings({ historySeedScope: scope })}
      onHintsChange={onSubjectChange}
      onRandomThemeChange={theme => onUpdateToolSettings({ randomTheme: theme })}
      onHistorySeedApplied={result => {
        onSubjectChange(result.hints);
        onUpdateToolSettings({
          lastHistorySeedEntryId: result.entryId,
          hintSource: 'history',
        });
      }}
      accentFocusClassName={accentFocusClassName}
    />
  );
}
