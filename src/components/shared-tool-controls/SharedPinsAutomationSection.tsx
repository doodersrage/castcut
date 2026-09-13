'use client';

import { PINNED_VARIATION_SEED_LABEL } from '@/lib/tool-ui-labels';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { FieldDivider, FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { SharedAdvancedSectionsProps } from '@/components/shared-tool-controls/SharedAdvancedSections';

export type SharedPinsAutomationSectionProps = Pick<
  SharedAdvancedSectionsProps,
  | 'roleplayVariant'
  | 'showWardrobeOption'
  | 'onAlwaysIncludeClothingChange'
  | 'onSeedLlmWithIngredientsChange'
  | 'seedLlmWithIngredients'
  | 'checkboxClass'
  | 'alwaysIncludeClothing'
  | 'wardrobeHelp'
  | 'lockedWardrobeId'
  | 'lockedLocation'
  | 'lockedVariationSeed'
  | 'onAutoFixRulesChange'
  | 'lockedWardrobeLabel'
  | 'onClearLockedWardrobe'
  | 'onClearLockedLocation'
  | 'onClearLockedVariationSeed'
  | 'autoFixRules'
  | 'onActiveCharacterDescriptorChange'
  | 'activeCharacterDescriptor'
>;

export default function SharedPinsAutomationSection({
  roleplayVariant,
  showWardrobeOption,
  onAlwaysIncludeClothingChange,
  onSeedLlmWithIngredientsChange,
  seedLlmWithIngredients,
  checkboxClass,
  alwaysIncludeClothing,
  wardrobeHelp,
  lockedWardrobeId,
  lockedLocation,
  lockedVariationSeed,
  onAutoFixRulesChange,
  lockedWardrobeLabel,
  onClearLockedWardrobe,
  onClearLockedLocation,
  onClearLockedVariationSeed,
  autoFixRules,
  onActiveCharacterDescriptorChange,
  activeCharacterDescriptor,
}: SharedPinsAutomationSectionProps) {
  return (
    <>
      {!roleplayVariant &&
      ((showWardrobeOption && onAlwaysIncludeClothingChange) || onSeedLlmWithIngredientsChange) ? (
        <>
          <FieldDivider />
          {onSeedLlmWithIngredientsChange ? (
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={seedLlmWithIngredients}
                onChange={e => onSeedLlmWithIngredientsChange(e.target.checked)}
                className={checkboxClass}
              />
              <span className="space-y-1">
                <span className="type-heading block">Seed LLM with location & wardrobe</span>
                <span className="type-caption block">
                  When on, injects rolled location / outfit / environment ingredients and few-shot
                  examples. Turn off for completionist local models — only your keywords or hints go
                  to the LLM.
                </span>
              </span>
            </label>
          ) : null}
          {showWardrobeOption && onAlwaysIncludeClothingChange ? (
            <label
              className={`flex cursor-pointer items-start gap-3 ${
                onSeedLlmWithIngredientsChange ? 'mt-3' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={alwaysIncludeClothing}
                onChange={e => onAlwaysIncludeClothingChange(e.target.checked)}
                className={checkboxClass}
              />
              <span className="space-y-1">
                <span className="type-heading block">Always include wardrobe</span>
                <span className="type-caption block">
                  {wardrobeHelp ??
                    'When on, auto-rolls catalog outfits for people and appends clothing if the model omits it. Independent of Seed LLM above — turn both off for keyword-only prompts.'}
                </span>
              </span>
            </label>
          ) : null}
        </>
      ) : null}

      {!roleplayVariant &&
        (lockedWardrobeId || lockedLocation || lockedVariationSeed || onAutoFixRulesChange) && (
          <CollapsibleSection
            title="Pins & automation"
            summary="Locked scene ingredients and post-generation fixes."
            persistKey="shared-pins-automation"
            defaultOpen={Boolean(lockedWardrobeId || lockedLocation || lockedVariationSeed)}
          >
            {lockedWardrobeId && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-caption rounded-[var(--radius-full)] border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2.5 py-1 text-[var(--tint-info-text)]">
                  Locked kit: {lockedWardrobeLabel ?? lockedWardrobeId}
                </span>
                {onClearLockedWardrobe && (
                  <Button
                    variant="ghost"
                    onClick={onClearLockedWardrobe}
                    className="!min-h-8 px-2 type-caption"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            {lockedLocation && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-caption rounded-[var(--radius-full)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-1 text-[var(--tint-warning-text)]">
                  Locked location: {lockedLocation}
                </span>
                {onClearLockedLocation && (
                  <Button
                    variant="ghost"
                    onClick={onClearLockedLocation}
                    className="!min-h-8 px-2 type-caption"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            {lockedVariationSeed && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="type-caption max-w-full truncate rounded-[var(--radius-full)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-[var(--accent-text)]"
                  title={lockedVariationSeed}
                >
                  {PINNED_VARIATION_SEED_LABEL}:{' '}
                  {lockedVariationSeed.length > 48
                    ? `${lockedVariationSeed.slice(0, 48)}…`
                    : lockedVariationSeed}
                </span>
                {onClearLockedVariationSeed && (
                  <Button
                    variant="ghost"
                    onClick={onClearLockedVariationSeed}
                    className="!min-h-8 px-2 type-caption"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            {onAutoFixRulesChange && (
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={autoFixRules}
                  onChange={e => onAutoFixRulesChange(e.target.checked)}
                  className={checkboxClass}
                />
                <span className="space-y-1">
                  <span className="type-heading block">Auto-fix lint errors</span>
                  <span className="type-caption block">
                    After generation, apply rule-based fixes when lint reports errors.
                  </span>
                </span>
              </label>
            )}

            {onActiveCharacterDescriptorChange && (
              <div className="space-y-2">
                <FieldLabel hint="Injected into Character generation as a mandatory descriptor.">
                  Active character descriptor
                </FieldLabel>
                <textarea
                  value={activeCharacterDescriptor ?? ''}
                  onChange={event => onActiveCharacterDescriptorChange(event.target.value)}
                  rows={3}
                  placeholder="e.g. athletic woman, mid-20s, short copper hair, green eyes"
                  className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
                />
              </div>
            )}
          </CollapsibleSection>
        )}
    </>
  );
}
