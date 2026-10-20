import { redirect } from 'next/navigation';
import { retiredLookHref } from '@/lib/app/retired-look';

/** Look is retired — old links open the Cast's looks (retired-look.ts). */
export default async function MoodboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { character } = await searchParams;
  redirect(retiredLookHref(typeof character === 'string' ? character : undefined));
}
