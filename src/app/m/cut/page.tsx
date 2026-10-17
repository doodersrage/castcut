'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const CutRoom = dynamic(() => import('@/components/cut/CutRoom'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading Cut" />,
});

export default function MobileCutPage() {
  return <CutRoom />;
}
