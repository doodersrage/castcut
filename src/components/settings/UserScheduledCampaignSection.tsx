'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import type { UserScheduledCampaign } from '@/lib/auth/types';

const DEFAULT_CAMPAIGN: UserScheduledCampaign = {
  enabled: false,
  target: 'random-scene',
  count: 3,
  intervalMin: 60,
  autoQueueComfyUi: false,
};

export default function UserScheduledCampaignSection(props: {
  onStatus?: (message: string | null) => void;
}) {
  const [campaign, setCampaign] = useState<UserScheduledCampaign>(DEFAULT_CAMPAIGN);
  const [loading, setLoading] = useState(false);

  const loadCampaign = useCallback(async () => {
    const response = await fetch('/api/auth/profile', { cache: 'no-store' });
    const data = (await response.json()) as {
      user?: { scheduledCampaign?: UserScheduledCampaign };
    };
    if (response.ok && data.user) {
      setCampaign(data.user.scheduledCampaign ?? DEFAULT_CAMPAIGN);
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void loadCampaign();
    });
  }, [loadCampaign]);

  async function saveCampaign() {
    setLoading(true);
    props.onStatus?.(null);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledCampaign: campaign }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Save failed.');
      }
      props.onStatus?.('Scheduled campaign saved.');
    } catch (error) {
      props.onStatus?.(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ToolSection title="User scheduled campaign">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Per-account scene batches when{' '}
        <code className="text-[var(--text-secondary)]">SERVER_USER_MAINTENANCE=true</code> on the
        server. Distinct from the browser scheduled batch below.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={campaign.enabled}
          onChange={event => setCampaign(prev => ({ ...prev, enabled: event.target.checked }))}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        />
        Enable scheduled campaign
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Target</span>
          <select
            value={campaign.target}
            onChange={event =>
              setCampaign(prev => ({
                ...prev,
                target: event.target.value as UserScheduledCampaign['target'],
              }))
            }
            className="ui-input w-full"
          >
            <option value="random-scene">Random scene</option>
            <option value="topics">Topics batch</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Interval (minutes)</span>
          <TextInput
            type="number"
            value={String(campaign.intervalMin)}
            onChange={event =>
              setCampaign(prev => ({
                ...prev,
                intervalMin: Math.max(5, Number(event.target.value) || 60),
              }))
            }
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Count</span>
          <TextInput
            type="number"
            value={String(campaign.count)}
            onChange={event =>
              setCampaign(prev => ({
                ...prev,
                count: Math.max(1, Math.min(12, Number(event.target.value) || 3)),
              }))
            }
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={campaign.autoQueueComfyUi}
            onChange={event =>
              setCampaign(prev => ({ ...prev, autoQueueComfyUi: event.target.checked }))
            }
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
          />
          Auto-queue to ComfyUI
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Best-of-N (optional)</span>
          <TextInput
            type="number"
            value={campaign.bestOfN ? String(campaign.bestOfN) : ''}
            placeholder="Off"
            onChange={event => {
              const raw = event.target.value.trim();
              setCampaign(prev => ({
                ...prev,
                bestOfN: raw ? Math.max(2, Math.min(8, Number(raw) || 2)) : undefined,
              }));
            }}
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={campaign.bestOfNVision ?? false}
            onChange={event =>
              setCampaign(prev => ({ ...prev, bestOfNVision: event.target.checked }))
            }
            disabled={!campaign.bestOfN || campaign.bestOfN < 2 || !campaign.autoQueueComfyUi}
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)] disabled:opacity-40"
          />
          Vision pick for best-of-N
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={loading} onClick={() => void saveCampaign()}>
          Save campaign
        </Button>
      </div>
    </ToolSection>
  );
}
