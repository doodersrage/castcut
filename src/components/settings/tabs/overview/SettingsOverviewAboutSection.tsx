'use client';

import AppUpdateStatus from '@/components/settings/AppUpdateStatus';
import ReportBugLink from '@/components/ReportBugLink';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { POSE_REFERENCE_CREDITS_URL } from '@/lib/pose-references';

export function SettingsOverviewAboutSection() {
  return (
    <>
      <ToolSection title="About">
        <AppUpdateStatus />
        <p
          className="mt-3 text-sm text-[var(--text-secondary)]"
          data-testid="settings-pose-reference-credits"
        >
          Day and Story&rsquo;s real poses are skeletons read from openly licensed photos (CC0,
          public domain, CC BY and CC BY-SA) — no photo ships with Castcut.{' '}
          <a
            href={POSE_REFERENCE_CREDITS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Photo credits
          </a>
        </p>
      </ToolSection>

      <ToolSection title="Feedback">
        <p className="text-sm text-[var(--text-secondary)]">
          File an issue on GitHub if something in Castcut is broken or confusing.
        </p>
        <div className="mt-3">
          <ReportBugLink variant="button" />
        </div>
      </ToolSection>
    </>
  );
}
