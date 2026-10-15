import { redirect } from 'next/navigation';

/** Look is retired — old phone links open the Cast on the phone (retired-look.ts). */
export default async function MobileMoodboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { character } = await searchParams;
  const id = typeof character === 'string' ? character.trim() : '';
  redirect(id ? `/m?character=${encodeURIComponent(id)}` : '/m');
}
