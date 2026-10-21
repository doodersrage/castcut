'use client';

import AppUpdateStatus from '@/components/settings/AppUpdateStatus';
import ReportBugLink from '@/components/ReportBugLink';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { POSE_REFERENCE_CREDITS_URL } from '@/lib/pose/references';
import { APP_HAS_PLAY } from '@/lib/app/profile';
import { PRODUCT_NAME } from '@/lib/app/brand';

export function SettingsOverviewAboutSection() {
  return (
    <>
      <ToolSection title="About">
        <AppUpdateStatus />
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Theme, density and queue toasts are in{' '}
          <a href="/profile" className="underline underline-offset-2">
            Profile → Appearance
          </a>
          .
        </p>
        {APP_HAS_PLAY ? (
          <p
            className="mt-3 text-sm text-[var(--text-secondary)]"
            data-testid="settings-pose-reference-credits"
          >
            Day and Story&rsquo;s real poses are skeletons read from openly licensed photos (CC0,
            public domain, CC BY and CC BY-SA), motion capture and keypoint annotations — no photo
            ships with Castcut. A few two-person poses no source had are Castcut&rsquo;s own
            drawings.{' '}
            <a
              href={POSE_REFERENCE_CREDITS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Photo credits
            </a>
            . The 3D pose editor&rsquo;s bodies are Blender Studio&rsquo;s Human Base Meshes (CC0),
            rigged for Castcut.{' '}
            <a
              href="/pose-3d/LICENSE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              data-testid="settings-pose-3d-credits"
            >
              Body credits
            </a>
          </p>
        ) : null}
      </ToolSection>

      <ToolSection title="Feedback">
        <p className="text-sm text-[var(--text-secondary)]">
          File an issue on GitHub if something in {PRODUCT_NAME} is broken or confusing.
        </p>
        <div className="mt-3">
          <ReportBugLink variant="button" />
        </div>
      </ToolSection>
    </>
  );
}
