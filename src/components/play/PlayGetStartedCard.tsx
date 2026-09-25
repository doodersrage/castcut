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

/** Scroll to Outfit's Character section and focus its picker. */
function revealOutfitCharacter(): void {
  if (typeof document === 'undefined') return;
  const section = document.querySelector<HTMLElement>(
    '[data-testid="fitting-character"], [data-testid="mobile-fitting-character"]'
  );
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  section.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true });
}

/**
 * First-run card at the top of Day / Outfit: what's missing and the one-tap ways to fix it,
 * instead of a caption pointing at a section further down. Day covers Cast lead then plate;
 * Outfit only the Cast lead (its Plate section sits right below and has its own empty state).
 */
export default function PlayGetStartedCard({
  tool = 'day',
  hasCharacter,
  hasPlate,
  characterId,
  mobile = false,
}: {
  tool?: 'day' | 'outfit';
  hasCharacter: boolean;
  hasPlate: boolean;
  characterId?: string | null;
  mobile?: boolean;
}) {
  const router = useRouter();
  if (hasCharacter && (hasPlate || tool === 'outfit')) {
    return null;
  }
  const testId = tool === 'day' ? 'day-get-started' : 'outfit-get-started';
  const href = (path: string) => (mobile ? toMobileStudioHref(path) : path);
  const startStarter = () => {
    const result = startStarterPlayFilm({ existingCharacterId: characterId || undefined });
    router.push(href(result.href));
  };

  return (
    <div
      className="mb-3 rounded-[var(--radius-lg)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-3"
      data-testid={testId}
    >
      {!hasCharacter ? (
        <>
          <p className="type-heading">
            {tool === 'day' ? 'Day needs a Cast lead' : 'Outfit needs a Cast lead'}
          </p>
          <p className="type-caption mt-1 text-[var(--text-secondary)]">
            {tool === 'day'
              ? 'Pick the character this day follows — or let a starter film create one and plan the day for you.'
              : 'Try-ons dress a Cast lead and are saved to them — pick one, or let a starter film create one.'}
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
            data-testid={`${testId}-starter`}
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
            data-testid={`${testId}-outfit`}
          >
            Open Outfit
          </ButtonLink>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={tool === 'day' ? revealDaySetup : revealOutfitCharacter}
          data-testid={`${testId}-setup`}
        >
          {hasCharacter ? 'Pick a plate in Setup' : 'Choose a character'}
        </Button>
      </div>
    </div>
  );
}
