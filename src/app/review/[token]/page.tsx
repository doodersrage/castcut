import FilmReviewPage from '@/components/FilmReviewPage';

export const metadata = { title: 'Film review', robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FilmReviewPage token={token} />;
}
