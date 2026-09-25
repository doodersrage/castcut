'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  downloadSettingsBundle,
  importSettingsBundle,
  parseSettingsBundle,
} from '@/lib/settings-export';

export default function SettingsBundlePanel({
  onImported,
  onStatus,
}: {
  onImported: () => void;
  onStatus: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <ToolSection
      id="settings-data-bundle"
      title="Settings export"
      description="Lightweight JSON of shared prefs, ComfyUI settings, webhooks, scheduled batch, and avoided tokens — not history or gallery."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            downloadSettingsBundle();
            onStatus('Settings bundle downloaded.');
          }}
        >
          Export settings
        </Button>
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          Import settings
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
              return;
            }
            void file
              .text()
              .then(text => {
                importSettingsBundle(parseSettingsBundle(text));
                onImported();
                onStatus('Settings bundle imported. Reload if panels look stale.');
              })
              .catch((error: unknown) => {
                onStatus(
                  error instanceof Error ? error.message : 'Failed to import settings bundle.'
                );
              });
          }}
        />
      </div>
    </ToolSection>
  );
}
