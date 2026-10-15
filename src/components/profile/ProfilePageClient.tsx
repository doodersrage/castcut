'use client';

import dynamic from 'next/dynamic';
import { useProfilePageDescription } from '@/hooks/useToolPageDescription';
import { ToolLayout } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const ProfilePanel = dynamic(() => import('@/components/profile/ProfilePanel'), {
  loading: () => <ToolPageSkeleton label="Loading profile" />,
});

const ACCENT = 'brand' as const;

export default function ProfilePageClient() {
  const description = useProfilePageDescription();

  return (
    <ToolLayout accent={ACCENT} width="default" title="Profile" description={description}>
      <ProfilePanel />
    </ToolLayout>
  );
}
