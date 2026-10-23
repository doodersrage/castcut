'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const SceneTool = dynamic(() => import('@/components/day-planner/SceneTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading scene" />,
});

export default function MobileScenePage() {
  return <SceneTool compact />;
}
