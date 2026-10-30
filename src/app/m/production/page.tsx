'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const FilmDirector = dynamic(() => import('@/components/production/FilmDirector'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading Film Director" />,
});

export default function MobileFilmDirectorPage() {
  return <FilmDirector />;
}
