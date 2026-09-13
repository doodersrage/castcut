'use client';

import AppUpdateStatus from '@/components/settings/AppUpdateStatus';
import ReportBugLink from '@/components/ReportBugLink';
import { ToolSection } from '@/components/ui/ToolPageShell';

export function SettingsOverviewAboutSection() {
  return (
    <>
      <ToolSection title="About">
        <AppUpdateStatus />
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
