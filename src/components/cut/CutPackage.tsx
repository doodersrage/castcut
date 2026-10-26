'use client';

import { Button } from '@/components/ui/Button';
import UploadButton from '@/components/ui/UploadButton';

/**
 * Cut's package (M4 F7): the cut, its versions and — with media — its files, in one .zip for
 * another machine or a backup; and a package imported here as versions (the edit you have is
 * left alone).
 */
export default function CutPackage({
  canPackage,
  busy,
  disabled,
  onPackage,
  onImport,
}: {
  canPackage: boolean;
  busy: boolean;
  disabled?: boolean;
  onPackage: (full: boolean) => void;
  onImport: (file: File) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="cut-package">
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || busy || !canPackage}
        loading={busy}
        loadingLabel="Packaging"
        title="The cut, its versions and every picture, clip and sound it plays — opens on another machine"
        data-testid="cut-package-full"
        onClick={() => onPackage(true)}
      >
        Package with media
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || busy || !canPackage}
        title="The cut and its versions, pointing at the same media — for a machine that has them"
        data-testid="cut-package-light"
        onClick={() => onPackage(false)}
      >
        Package (light)
      </Button>
      <UploadButton
        label="Import a package…"
        accept=".zip,application/zip"
        testId="cut-package-import"
        disabled={disabled || busy}
        onFile={onImport}
      />
    </div>
  );
}
