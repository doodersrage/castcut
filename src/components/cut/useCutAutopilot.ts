'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CutPreviewLoaded } from '@/hooks/useCutPreview';
import type { useCutRoom } from '@/hooks/useCutRoom';
import { cutTempMusicCues, makeTempMusic } from '@/lib/film/temp-music-client';
import { filmShapeOf } from '@/lib/video/resolution';

type CutRoomView = ReturnType<typeof useCutRoom>;

/**
 * The episode autopilot's cut (episode-autopilot.ts): a run that finished with "cut the film when
 * it's done" opens Cut with ?autocut=1, and this cuts it as the guide says — the lines read on the
 * stills, the stills widened for a wide film, music by scene, then Cut film (shots its checks
 * flagged are cut anyway: the run listed them to look at). Once: the URL forgets autocut, so a
 * reload doesn't cut again. Returns what it is doing, for the status line.
 */
export function useCutAutopilot(input: {
  vm: CutRoomView;
  loaded: CutPreviewLoaded | null;
  feelingOf: (key: string) => string;
}): string | null {
  const { vm, loaded, feelingOf } = input;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const stage = useRef<'idle' | 'options' | 'music' | 'cut' | 'done'>('idle');
  const [note, setNote] = useState<string | null>(null);
  /** Cut film was asked for (the last step). */
  const [cutting, setCutting] = useState(false);
  const wanted = params.get('autocut') === '1';

  // 1. The episode's options, and the URL without autocut.
  const { mounted, shots, options, setOptions } = vm;
  useEffect(() => {
    if (!wanted || !mounted || stage.current !== 'idle' || !shots.length) return;
    stage.current = 'options';
    setOptions({
      ...options,
      readLines: true,
      ...(filmShapeOf(options) === 'wide' ? { widen: true } : {}),
    });
    setNote('Autopilot: laying out the episode…');
    const next = new URLSearchParams(params.toString());
    next.delete('autocut');
    router.replace(`${pathname}?${next.toString()}`);
  }, [mounted, options, params, pathname, router, setOptions, shots.length, wanted]);

  // 2. Music by scene once the monitor has the cut laid out, then Cut film.
  const { setEffect, cutFilm } = vm;
  useEffect(() => {
    if (stage.current !== 'options' || !loaded) return;
    stage.current = 'music';
    void (async () => {
      const cues = cutTempMusicCues(loaded, feelingOf);
      if (cues.length) {
        const made = await makeTempMusic(
          cues,
          (id, effect) => setEffect(id, effect, true),
          label => setNote(`Autopilot: music by scene — ${label}`)
        );
        if (made.error)
          setNote(`Autopilot: music stopped (${made.error}) — cutting without the rest.`);
      }
      stage.current = 'cut';
      setNote('Autopilot: cutting the film — reading the lines, widening the stills…');
      setCutting(true);
      await cutFilm();
    })();
  }, [cutFilm, feelingOf, loaded, setEffect]);

  // 3. The pre-cut check found shots to look at: the run listed them already — cut anyway.
  const { problems, resolveProblems, cutDone, error } = vm;
  useEffect(() => {
    if (stage.current === 'cut' && problems?.length) void resolveProblems('cut-anyway');
  }, [problems, resolveProblems]);

  // 4. Done (or not).
  if (cutting && cutDone) return 'Autopilot: the episode is cut — it is in Your films.';
  if (cutting && error) return `Autopilot: the cut stopped — ${error}`;
  return note;
}
