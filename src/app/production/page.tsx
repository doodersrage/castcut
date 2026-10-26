import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const FilmDirector = dynamic(() => import('@/components/production/FilmDirector'), {
  loading: () => <ToolPageSkeleton label="Loading Film Director" />,
});

export default function ProductionPage() {
  return (
    <PageCanvas accent="amber">
      <FilmDirector />
    </PageCanvas>
  );
}
