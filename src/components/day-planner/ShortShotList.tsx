'use client';

import { scenePagePath } from '@/lib/day/scene-links';
import {
  shortShotSummary,
  type ShortShotRow,
  type ShortShotStatus,
} from '@/lib/day/short-shot-list';

const STATUS_WORDS: Record<ShortShotStatus, string> = {
  kept: 'Kept',
  'to-check': 'To check',
  'no-take': 'No take yet',
  'not-made': 'Not made',
};

const STATUS_TONE: Record<ShortShotStatus, string> = {
  kept: 'text-[var(--tint-success-text)]',
  'to-check': 'text-[var(--tint-warning-text)]',
  'no-take': 'text-[var(--text-muted)]',
  'not-made': 'text-[var(--text-muted)]',
};

/**
 * A Short's shot list (2026-11-12): one row a shot, in script order — the table a director or AD
 * works from. A made shot's slate opens its Scene; the cards stay the other view.
 */
export default function ShortShotList({
  rows,
  castId,
}: {
  rows: readonly ShortShotRow[];
  castId: string;
}) {
  if (!rows.length) {
    return (
      <p className="type-caption text-[var(--text-muted)]" data-testid="short-shot-list-empty">
        No shots yet — write the short as a script, and its shots are listed here.
      </p>
    );
  }
  const sceneHref = (sceneId: string) =>
    `${scenePagePath()}?${new URLSearchParams({ character: castId, scene: sceneId }).toString()}`;
  return (
    <div data-testid="short-shot-list">
      <p
        className="type-caption mb-2 text-[var(--text-muted)]"
        data-testid="short-shot-list-summary"
      >
        {shortShotSummary(rows)}
      </p>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
        <table className="ui-table">
          <caption className="sr-only">Shot list, in script order</caption>
          <thead>
            <tr>
              <th scope="col">Shot</th>
              <th scope="col">Take</th>
              <th scope="col">Scene</th>
              <th scope="col">Size</th>
              <th scope="col">Who</th>
              <th scope="col">Line or action</th>
              <th scope="col">Takes</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.shotId}
                data-status={row.status}
                data-testid={`short-shot-row-${row.label}`}
              >
                <th
                  scope="row"
                  className="whitespace-nowrap font-medium text-[var(--text-primary)]"
                >
                  {row.sceneId ? (
                    <a
                      href={sceneHref(row.sceneId)}
                      className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      aria-label={`Shot ${row.label} — open on Scene`}
                    >
                      {row.label}
                    </a>
                  ) : (
                    row.label
                  )}
                </th>
                <td>
                  <span className="flex h-9 w-16 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-muted)]">
                    {row.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a ComfyUI take, not a static asset
                      <img src={row.thumb} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                </td>
                <td className="whitespace-nowrap">{row.heading}</td>
                <td className="whitespace-nowrap" title={`${row.sizeTitle} · ${row.purpose}`}>
                  {row.size}
                  <span className="block text-[var(--text-muted)]">{row.purpose}</span>
                </td>
                <td>{row.who}</td>
                <td className="min-w-[16rem]">{row.text}</td>
                <td className="tabular-nums">{row.takes}</td>
                <td className={`whitespace-nowrap ${STATUS_TONE[row.status]}`}>
                  {STATUS_WORDS[row.status]}
                  {row.why ? (
                    <span className="block max-w-[14rem] whitespace-normal text-[var(--text-muted)]">
                      {row.why}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
