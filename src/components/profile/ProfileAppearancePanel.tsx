'use client';

import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/storage/browser-storage';
import { useEffect, useState } from 'react';
import type { AmbientIntensity } from '@/lib/settings/ambient-settings';
import { loadAmbientIntensity, saveAmbientIntensity } from '@/lib/settings/ambient-settings';
import { applyCalmUi, loadCalmUi, saveCalmUi } from '@/lib/settings/calm-settings';
import type { UiDensity } from '@/lib/settings/density-settings';
import { loadUiDensity, saveUiDensity } from '@/lib/settings/density-settings';
import { loadToastPreferenceEnabled, rememberToastPreference } from '@/lib/app/toast';
import { resetUiChrome } from '@/lib/app/reset-ui-chrome';
import { pushAppToast } from '@/lib/app/toast';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import ThemePreferenceControl from '@/components/ThemePreferenceControl';
import WorkspaceModeControl from '@/components/WorkspaceModeControl';

export default function ProfileAppearancePanel() {
  const [ambient, setAmbient] = useState<AmbientIntensity>('subtle');
  const [density, setDensity] = useState<UiDensity>('comfortable');
  const [calm, setCalm] = useState(false);
  const [toastsEnabled, setToastsEnabled] = useState(true);
  const [resetNote, setResetNote] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      setAmbient(loadAmbientIntensity());
      setDensity(loadUiDensity());
      setCalm(loadCalmUi());
      setToastsEnabled(loadToastPreferenceEnabled());
    };
    scheduleAfterCommit(read);
    // Read again once browser storage has hydrated / synced: the first read could run before
    // the synced values landed, and the selects then showed "Subtle" on a "Vivid" page.
    window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, read);
    return () => window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, read);
  }, []);

  return (
    <ToolSection title="Appearance">
      <ThemePreferenceControl />

      <div className="mt-6">
        <WorkspaceModeControl variant="panel" />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="ui-field-row text-sm">
          <span className="type-caption text-[var(--text-muted)]">Ambient background</span>
          <select
            value={ambient}
            onChange={event => {
              const next = event.target.value as AmbientIntensity;
              setAmbient(next);
              saveAmbientIntensity(next);
            }}
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          >
            <option value="off">Off</option>
            <option value="subtle">Subtle</option>
            <option value="normal">Normal</option>
            <option value="vivid">Vivid</option>
          </select>
        </label>
        <label className="ui-field-row text-sm">
          <span className="type-caption text-[var(--text-muted)]">Density</span>
          <select
            value={density}
            onChange={event => {
              const next = event.target.value as UiDensity;
              setDensity(next);
              saveUiDensity(next);
            }}
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          >
            <option value="comfortable">Comfortable — roomy type & padding</option>
            <option value="compact">Compact — denser tools & gallery</option>
          </select>
        </label>
      </div>
      <p className="ui-meta mt-2">
        Comfortable enlarges display titles and card padding. Compact tightens gutters, inputs, and
        section gaps across the app.
      </p>

      <label className="mt-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm">
        <input
          type="checkbox"
          className="ui-checkbox mt-1"
          checked={calm}
          onChange={event => {
            const next = event.target.checked;
            setCalm(next);
            saveCalmUi(next);
            applyCalmUi();
            if (toastsEnabled) {
              pushAppToast({
                text: next ? 'Calm UI on — quieter motion' : 'Calm UI off',
                tone: 'info',
                ttlMs: 2200,
              });
            }
          }}
        />
        <span>
          <span className="block font-medium text-[var(--text-primary)]">Calm UI</span>
          <span className="type-caption text-[var(--text-muted)]">
            Softens ambient drift, disables floaty hovers, and skips enter animations. Pairs well
            with reduced motion.
          </span>
        </span>
      </label>

      <label className="mt-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm">
        <input
          type="checkbox"
          className="ui-checkbox mt-1"
          checked={toastsEnabled}
          onChange={event => {
            const next = event.target.checked;
            setToastsEnabled(next);
            rememberToastPreference(next);
            if (next) {
              pushAppToast({ text: 'Activity notifications enabled', tone: 'info', ttlMs: 2500 });
            }
          }}
        />
        <span>
          <span className="block font-medium text-[var(--text-primary)]">
            Activity notifications
          </span>
          <span className="type-caption text-[var(--text-muted)]">
            Show queue confirmations, held Best-quality warnings, and other activity in the
            bottom-right system tray.
          </span>
        </span>
      </label>

      <div className="mt-6 space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
        <p className="type-heading">Reset layout</p>
        {/* The full list (pins, recent pages, nav groups, per-tool model memory, last draft and
            route; density back to Comfortable) is in the hover text. */}
        <p
          className="type-caption text-[var(--text-muted)]"
          title="Clears pinned tools, recent destinations, expanded nav groups, remembered collapsibles, per-tool model/workflow memory, last draft and last tool route. Density returns to Comfortable; workspace to Simple. Theme, ambient, Calm UI and toasts stay."
        >
          Forgets pinned tools, recent pages, open sections and remembered drafts. Your theme stays.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (
              !window.confirm(
                'Reset the layout? Pinned tools, recent pages, open sections and remembered drafts are forgotten.'
              )
            ) {
              return;
            }
            resetUiChrome();
            setDensity('comfortable');
            setResetNote('Layout reset. Reload if anything still looks the same.');
            if (toastsEnabled) {
              pushAppToast({
                text: 'Layout reset',
                tone: 'info',
              });
            }
          }}
        >
          Reset layout
        </Button>
        {resetNote ? (
          <p className="type-caption text-[var(--tint-info-text)]">{resetNote}</p>
        ) : null}
      </div>
    </ToolSection>
  );
}
