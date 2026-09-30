'use client';

import { SegmentedControl } from '@/components/ui/ToolPageShell';
import { setGalleryManageMode, useGalleryManageMode } from '@/lib/gallery-manage-mode';

export default function GalleryModeSwitch() {
  const manage = useGalleryManageMode();
  return (
    <SegmentedControl
      aria-label="Gallery mode"
      value={manage ? 'manage' : 'browse'}
      onChange={value => setGalleryManageMode(value === 'manage')}
      options={[
        { value: 'browse', label: 'Browse' },
        { value: 'manage', label: 'Manage' },
      ]}
    />
  );
}
