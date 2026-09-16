'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MobilePlayTool = dynamic(() => import('@/components/mobile/MobilePlayTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading Story" />,
});

export default function MobileStoryPage() {
  return <MobilePlayTool />;
}
