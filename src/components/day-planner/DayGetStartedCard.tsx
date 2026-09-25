'use client';

import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/Button';
import { startStarterPlayFilm } from '@/lib/play-starter';
import { toMobileStudioHref } from '@/lib/mobile-studio';

/**
 * Open (and scroll to) the Day Setup section — it sits at the bottom of the page, far from the
 * "pick a Cast" blocker, and is often collapsed.
 */
export function revealDaySetup(): void {
  if (typeof document === 'undefined') return;
  const section = document.querySelector<HTMLDetailsElement>('details.day-character-section');
  if (!section) return;
  section.open = true;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * First-run card at the top of Day: what's missing (Cast lead, then plate) and the one-tap ways
 * to fix it, instead of a caption pointing at a Setup section two screens down.
 */
export default function DayGetStartedCard({
  hasCharacter,
  hasPlate,
  characterId,
  mobile = false,
}: {
  hasCharacter: boolean;
  hasPlate: boolean;
  characterId?: string | null;
  mobile?: boolean;
}) {
  const router = useRouter();
  if (hasCharacter && hasPlate) {
    return null;
  }
  const href = (path: string) => (mobile ? toMobileStudioHref(path) : path);
  const startStarter = () => {
    const result = startStarterPlayFilm({ existingCharacterId: characterId || undefined });
    router.push(href(result.href));
  };

  return (
    <div
      className="mb-3 rounded-[var(--radius-lg)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-3"
      data-testid="day-get-started"
    >
      {!hasCharacter ? (
        <>
          <p className="type-heading">Day needs a Cast lead</p>
          <p className="type-caption mt-1 text-[var(--text-secondary)]">
            Pick the character this day follows — or let a starter film create one and plan the day
            for you.
          </p>
        </>
      ) : (
        <>
          <p className="type-heading">Add a plate for this Cast</p>
          <p className="type-caption mt-1 text-[var(--text-secondary)]">
            Day stills keep the face and outfit from a plate — Keep a try-on in Outfit, or pick a
            look plate in Setup.
          </p>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!hasCharacter ? (
          <Button
            size="sm"
            variant="primary"
            onClick={startStarter}
            data-testid="day-get-started-starter"
          >
            Make a starter film
          </Button>
        ) : (
          <ButtonLink
            size="sm"
            variant="primary"
            href={href(
              characterId ? `/fitting?character=${encodeURIComponent(characterId)}` : '/fitting'
            )}
            data-testid="day-get-started-outfit"
          >
            Open Outfit
          </ButtonLink>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={revealDaySetup}
          data-testid="day-get-started-setup"
        >
          {hasCharacter ? 'Pick a plate in Setup' : 'Choose a character'}
        </Button>
      </div>
    </div>
  );
}
