import { Suspense } from 'react';
import PlayCampaignWizard from '@/components/PlayCampaignWizard';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

export default function MobileFilmPage() {
  return (
    <Suspense fallback={<ToolPageSkeleton label="Loading film" />}>
      <PlayCampaignWizard />
    </Suspense>
  );
}
