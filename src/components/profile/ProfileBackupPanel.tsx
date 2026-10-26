'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import BackupRestoreFlow from '@/components/BackupRestoreFlow';
import Link from 'next/link';
import { downloadStudioBackup } from '@/lib/storage/studio-backup';
import { settingsTabHref } from '@/lib/settings/nav';

export default function ProfileBackupPanel() {
  const [status, setStatus] = useState<string | null>(null);

  function exportBackup() {
    downloadStudioBackup();
    setStatus('Backup downloaded.');
  }

  return (
    <ToolSection title="Full backup & restore">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Export or restore history, gallery, settings, extras (gallery ELO, recipes, views), and
        workflows. On a new machine, import this JSON then reload.
      </p>
      <p className="mb-3 text-sm text-[var(--text-muted)]" data-testid="profile-backup-pictures">
        This file names your pictures and clips but doesn’t carry them. For a new machine, also take
        a{' '}
        <Link className="underline" href={settingsTabHref('data')}>
          Pictures backup
        </Link>{' '}
        (Settings → Data) and restore it there.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={exportBackup}>
          Download backup
        </Button>
        <BackupRestoreFlow
          testId="profile-backup-restore"
          onRestored={message => {
            setStatus(`${message.replace(/ Reload to finish\.$/, '')} Reloading…`);
            window.setTimeout(() => window.location.reload(), 600);
          }}
          onError={setStatus}
        />
      </div>
      {status ? <p className="mt-2 text-sm text-[var(--tint-success-text)]">{status}</p> : null}
    </ToolSection>
  );
}
