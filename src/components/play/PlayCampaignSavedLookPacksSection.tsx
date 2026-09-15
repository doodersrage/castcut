'use client';

import { downloadLookPackFile } from '@/lib/look-pack';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

type PlayCampaignSavedLookPacksSectionProps = Pick<
  ReturnType<typeof usePlayCampaignWizardOrchestration>,
  'savedLookPacks' | 'applySavedLookPack'
>;

export default function PlayCampaignSavedLookPacksSection({
  savedLookPacks,
  applySavedLookPack,
}: PlayCampaignSavedLookPacksSectionProps) {
  if (savedLookPacks.length === 0) {
    return null;
  }

  return (
    <ToolSection
      title="Saved look packs"
      description="Reuse a vibe without re-running Look vision."
      data-testid="play-campaign-look-packs"
    >
      <ul className="ui-list">
        {savedLookPacks.map(entry => (
          <li key={entry.id} className="ui-list-row items-center">
            <div className="ui-list-primary min-w-0">
              <p className="type-heading">{entry.name}</p>
              <p className="type-caption text-[var(--text-muted)]">
                {new Date(entry.savedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => applySavedLookPack(entry.id)}>
                Load
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadLookPackFile({
                    pack: entry.pack,
                    name: entry.name,
                    id: entry.id,
                  })
                }
              >
                Export
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </ToolSection>
  );
}
