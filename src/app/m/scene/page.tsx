'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MobileSceneTool = dynamic(() => import('@/components/mobile/MobileSceneTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading scene" />,
});

export default function MobileScenePage() {
  return <MobileSceneTool />;
}
