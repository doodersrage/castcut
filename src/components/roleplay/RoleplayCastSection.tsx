'use client';

import { useMemo } from 'react';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import { RoleplayCastActionsSection } from '@/components/roleplay/sections/RoleplayCastActionsSection';
import { RoleplayCastArchetypeSection } from '@/components/roleplay/sections/RoleplayCastArchetypeSection';
import { RoleplayCastPhotoSection } from '@/components/roleplay/sections/RoleplayCastPhotoSection';
import { RoleplayCastToneSettingSection } from '@/components/roleplay/sections/RoleplayCastToneSettingSection';
import type { RoleplayCastSectionProps } from '@/components/roleplay/roleplay-cast-section-types';
import { ROLEPLAY_CONTENT, ROLEPLAY_TONES } from '@/lib/roleplay';

export type {
  RoleplayCastApplyReferenceInput,
  RoleplayCastSectionProps,
} from '@/components/roleplay/roleplay-cast-section-types';

function moodSummary(
  tone: RoleplayCastSectionProps['tone'],
  content: RoleplayCastSectionProps['content'],
  setting: string | undefined,
  allowGore: boolean | undefined
): string {
  const toneLabel = ROLEPLAY_TONES.find(entry => entry.id === tone)?.label ?? tone;
  const contentLabel = ROLEPLAY_CONTENT.find(entry => entry.id === content)?.label ?? content;
  const place = setting?.trim();
  const parts = [toneLabel, contentLabel];
  if (allowGore) {
    parts.push('Gore');
  }
  if (place) {
    parts.push(place.length > 36 ? `${place.slice(0, 36)}…` : place);
  }
  return parts.join(' · ');
}

export default function RoleplayCastSection(props: RoleplayCastSectionProps) {
  const { playAs, tone, content, toolSettings } = props;
  const mood = useMemo(
    () => moodSummary(tone, content, toolSettings.setting, toolSettings.allowGore),
    [tone, content, toolSettings.setting, toolSettings.allowGore]
  );

  return (
    <ToolSection title="Cast yourself">
      <p className="text-sm text-[var(--text-muted)]">
        Pick a part, write a bio, then roll scenes. Mood, setting, and photo play live under the
        folds below.
      </p>
      <RoleplayCastArchetypeSection {...props} />
      <RoleplayCastActionsSection {...props} />
      <CollapsibleSection
        title="Mood & world"
        summary={mood}
        defaultOpen={false}
        persistKey="roleplay-cast-mood"
      >
        <RoleplayCastToneSettingSection {...props} />
      </CollapsibleSection>
      <CollapsibleSection
        key={playAs}
        title="Play as"
        summary={playAs === 'photo' ? 'From photo — identity from reference' : 'From bio'}
        defaultOpen={playAs === 'photo'}
      >
        <RoleplayCastPhotoSection {...props} />
      </CollapsibleSection>
    </ToolSection>
  );
}
