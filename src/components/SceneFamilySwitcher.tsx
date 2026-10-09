'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChipButton } from '@/components/ui/Field';
import { appHasRoute } from '@/lib/app-profile';

const ALL_SCENE_FAMILY_OPTIONS = [
  { href: '/character', label: 'Character' },
  { href: '/pet', label: 'Pet' },
  { href: '/fantasy', label: 'Fantasy' },
  { href: '/background', label: 'Background' },
  { href: '/story', label: 'Story' },
] as const;

/** The scene families this app has (the classic app: no Character / Story pages). */
export const SCENE_FAMILY_OPTIONS = ALL_SCENE_FAMILY_OPTIONS.filter(option =>
  appHasRoute(option.href)
);

export default function SceneFamilySwitcher() {
  const pathname = usePathname() ?? '';
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-2">
      {SCENE_FAMILY_OPTIONS.map(option => {
        const active = pathname === option.href || pathname.startsWith(`${option.href}/`);
        return (
          <ChipButton key={option.href} active={active} onClick={() => router.push(option.href)}>
            {option.label}
          </ChipButton>
        );
      })}
    </div>
  );
}
