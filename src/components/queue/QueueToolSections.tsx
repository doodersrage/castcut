'use client';

import { requeueComfyJobFromEntry } from '@/lib/comfyui-requeue';
import FailedJobFixButtons from '@/components/FailedJobFixButtons';
import { EmptyState, ErrorState } from '@/components/ui/ViewState';
import { Button } from '@/components/ui/Button';
import {
  CollapsibleSection,
  ToolBadge,
  ToolLayout,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import { formatPoolQueueStrip } from '@/lib/comfyui-host-ready';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import QueueActiveJobRow from '@/components/queue/QueueActiveJobRow';
import QueueCompletedRow from '@/components/queue/QueueCompletedRow';
import type { useQueueToolOrchestration } from '@/hooks/useQueueToolOrchestration';

const ACCENT = 'brand' as const;

type QueueToolViewModel = ReturnType<typeof useQueueToolOrchestration>;

type QueueToolSectionsProps = QueueToolViewModel & {
  description: string;
};

export default function QueueToolSections({
  description,
  isSimple,
  entries,
  queueHealth,
  status,
  setStatus,
  pending,
  failed,
  recent,
  orphanHostJobs,
  orphanHostCount,
  generateCta,
  poolQueue,
  refreshEntries,
  refreshHealth,
  interruptComfyQueue,
  freeComfyVram,
  restartComfy,
  cancelJob,
  cancelHostJob,
  claimHostJob,
  claimAllHostJobs,
  retryFailed,
  retryEntry,
}: QueueToolSectionsProps) {
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Queue</ToolBadge>}
      title="ComfyUI job queue"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.queue} />
      {queueHealth?.ok || poolQueue.anyOk ? (
        <div className="ui-queue-strip">
          <p className="text-sm text-[var(--text-muted)]">{formatPoolQueueStrip(poolQueue)}</p>
          {poolQueue.totalRunning + poolQueue.totalPending > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => void interruptComfyQueue()}>
              Interrupt queue
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => void freeComfyVram()}>
            Free VRAM
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void restartComfy()}>
            Restart ComfyUI
          </Button>
        </div>
      ) : (
        <ErrorState
          compact
          title="ComfyUI health unavailable"
          description="The queue stats endpoint did not respond. Use Settings → Heal & ready, or check your ComfyUI URL under Connection."
          action={{ label: 'Heal & ready', href: '/settings?tab=comfyui&section=connection' }}
        />
      )}

      <ToolSection title={`Active (${pending.length})`}>
        {pending.length === 0 ? (
          orphanHostJobs.length > 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              No gallery jobs are active. Host jobs that are not in this gallery are listed below.
            </p>
          ) : entries.length === 0 ? (
            <EmptyState
              compact
              branded
              icon="inbox"
              title="Queue is empty"
              description="Start a film and Queue day, or send a still from Generate. Engines can wait — try demo stills on Day if Comfy is offline."
              action={generateCta}
            />
          ) : (
            <EmptyState
              compact
              icon="inbox"
              title="No pending jobs"
              description="Nothing running. Continue your film on Day, or queue another still."
              action={generateCta}
            />
          )
        ) : (
          <ul className="ui-list">
            {pending.map(entry => (
              <QueueActiveJobRow
                key={entry.id}
                entry={entry}
                onRetry={() => retryEntry(entry)}
                onCancel={() => void cancelJob(entry)}
              />
            ))}
          </ul>
        )}
      </ToolSection>

      {orphanHostJobs.length > 0 ? (
        <ToolSection title={`On ComfyUI (${orphanHostJobs.length})`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              Running or queued on the ComfyUI pool, but not in this gallery. Import to track
              outputs here, or cancel one without interrupting the rest of the queue.
            </p>
            {orphanHostJobs.length > 1 ? (
              <Button size="sm" variant="secondary" onClick={() => void claimAllHostJobs()}>
                Import all
              </Button>
            ) : null}
          </div>
          <ul className="ui-list">
            {orphanHostJobs.map(job => (
              <li
                key={job.id}
                className="ui-list-row flex-col items-stretch gap-2 sm:flex-row sm:items-start"
              >
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="truncate font-mono text-sm text-[var(--text-primary)]">{job.id}</p>
                  <p className="type-caption">
                    {job.status}
                    {job.statusMessage ? ` · ${job.statusMessage}` : ''}
                    {orphanHostCount > 1 && job.comfyUrl ? ` · ${job.comfyUrl}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
                  <Button size="sm" variant="secondary" onClick={() => void claimHostJob(job)}>
                    Import
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void cancelHostJob(job)}>
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      {isSimple ? (
        <CollapsibleSection
          title={`Failed (${failed.length})`}
          summary={
            failed.length > 0 ? 'Retry jobs that errored in ComfyUI.' : 'No failures right now.'
          }
          defaultOpen={failed.length > 0}
          persistKey="queue-failed"
        >
          {failed.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No failed jobs"
              description="Failed gallery jobs will appear here so you can retry them in one place."
              action={
                pending.length === 0 && recent.length === 0
                  ? generateCta
                  : { label: 'Open Gallery', href: '/gallery' }
              }
            />
          ) : (
            <>
              <Button variant="secondary" className="mb-3" onClick={() => void retryFailed()}>
                Retry all failed
              </Button>
              <ul className="ui-list ui-scroll-region max-h-[min(24rem,50vh)] overflow-y-auto">
                {failed.map(entry => (
                  <li
                    key={entry.id}
                    className="ui-list-row flex-col items-stretch gap-2 sm:flex-row sm:items-start"
                  >
                    <div className="ui-list-primary min-w-0 space-y-1">
                      <p className="truncate text-sm text-[var(--text-primary)]">{entry.prompt}</p>
                      <p className="type-caption ui-status-danger">
                        {entry.statusMessage ?? entry.status} · {entry.model}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="shrink-0 self-start"
                        onClick={() => void requeueComfyJobFromEntry(entry)}
                      >
                        Retry
                      </Button>
                      <FailedJobFixButtons
                        entry={entry}
                        onStatus={setStatus}
                        onDone={() => {
                          refreshEntries();
                          void refreshHealth();
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      ) : (
        <ToolSection title={`Failed (${failed.length})`}>
          {failed.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No failed jobs"
              description="Failed gallery jobs will appear here so you can retry them in one place."
              action={
                pending.length === 0 && recent.length === 0
                  ? generateCta
                  : { label: 'Open Gallery', href: '/gallery' }
              }
            />
          ) : (
            <>
              <Button variant="secondary" className="mb-3" onClick={() => void retryFailed()}>
                Retry all failed
              </Button>
              <ul className="ui-list">
                {failed.map(entry => (
                  <li key={entry.id} className="ui-list-row items-start">
                    <div className="ui-list-primary min-w-0 space-y-1">
                      <p className="truncate text-sm text-[var(--text-primary)]">{entry.prompt}</p>
                      <p className="type-caption ui-status-danger">
                        {entry.statusMessage ?? entry.status} · {entry.model}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void requeueComfyJobFromEntry(entry)}
                      >
                        Retry
                      </Button>
                      <FailedJobFixButtons
                        entry={entry}
                        onStatus={setStatus}
                        onDone={() => {
                          refreshEntries();
                          void refreshHealth();
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ToolSection>
      )}

      {isSimple ? (
        <CollapsibleSection
          title="Recent completed"
          summary={`${recent.length} finished job${recent.length === 1 ? '' : 's'} in gallery.`}
          defaultOpen={recent.length > 0}
          persistKey="queue-recent"
        >
          {recent.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No completed jobs yet"
              description="Finished outputs land in Gallery — start from a prompt tool to queue your first run."
              action={generateCta}
            />
          ) : (
            <ul className="ui-list ui-scroll-region max-h-[min(24rem,50vh)] overflow-y-auto">
              {recent.map(entry => (
                <QueueCompletedRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </CollapsibleSection>
      ) : (
        <ToolSection title="Recent completed">
          {recent.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No completed jobs yet"
              description="Finished outputs land in Gallery — start from a prompt tool to queue your first run."
              action={generateCta}
            />
          ) : (
            <ul className="ui-list">
              {recent.map(entry => (
                <QueueCompletedRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </ToolSection>
      )}

      {status ? <p className="text-sm ui-status-success">{status}</p> : null}
    </ToolLayout>
  );
}
