'use client';

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  decideFinding,
  findingDecisionMap,
  loadFindingDecisions,
  subscribeFindingDecisions,
  undecideFinding,
  type FindingDecision,
} from '@/lib/checks/finding-decisions';
import {
  coverageFindings,
  coverageSummary,
  sceneCoverage,
  unsetPlaceShots,
} from '@/lib/day/script-coverage';
import { loadSettingsCache } from '@/lib/settings/cache';
import SceneScriptReimport from '@/components/day-planner/SceneScriptReimport';
import SceneScriptShots from '@/components/day-planner/SceneScriptShots';
import ScriptStoryboard from '@/components/day-planner/ScriptStoryboard';
import { storyboard } from '@/lib/day/storyboard';
import { orphanedShots } from '@/lib/day/script-reimport';
import { shotsToPrepare } from '@/lib/day/scene-run';
import { SCENE_LIMIT_PER_CAST } from '@/lib/day/scenes';
import type { PlannedShot } from '@/lib/day/script-shots';
import type { SavedScene, SceneScriptLink } from '@/lib/day/scenes';
import {
  shotSceneDraft,
  shotsForScene,
  withSceneShots,
  type ShotSceneDraft,
} from '@/lib/day/script-shots';
import { Button, ButtonLink } from '@/components/ui/Button';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { FieldError } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import UploadButton from '@/components/ui/UploadButton';
import {
  addScriptPatch,
  createScript,
  normalizeSavedScripts,
  removeScriptPatch,
  renameScriptPatch,
  setScriptCastPatch,
  setScriptPlacePatch,
  setScriptShotsPatch,
  SCRIPT_SOURCE_MAX,
  scriptsForCast,
  scriptSummary,
  type ScriptsCache,
} from '@/lib/day/scene-scripts';
import {
  parseScript,
  type ParsedScript,
  type ScriptElement,
  type ScriptScene,
} from '@/lib/script/parse';
import {
  locationChoice,
  resolvePlaces,
  resolveSpeakers,
  type ScriptCastMember,
  type ScriptPlaceChoice,
} from '@/lib/day/script-cast';
import { useLocations } from '@/components/location/useLocations';
import type { LocationRecord } from '@/lib/location/records';
import type { SavedScript } from '@/lib/day/scene-scripts';
import { useSceneScripts } from '@/hooks/day-planner/useSceneScripts';

const NO_DECISIONS: FindingDecision[] = [];
let decisionsCache: { key: string; value: FindingDecision[] } | null = null;
/** The stored decisions, the same array while they are unchanged (useSyncExternalStore). */
function decisionsSnapshot(): FindingDecision[] {
  const value = loadFindingDecisions();
  const key = JSON.stringify(value);
  if (decisionsCache?.key !== key) decisionsCache = { key, value };
  return decisionsCache.value;
}

const PLACE_LABELS: Record<'home' | 'work' | 'elsewhere', string> = {
  home: 'Her home',
  work: 'Her workplace',
  elsewhere: 'Somewhere else (as written)',
};

/**
 * Who's who and where (M3 S3): speaking parts to Cast members, places to home / work or a
 * location record (M8 T2).
 */
function NamesAndPlaces({
  script,
  parsed,
  cast,
  locations,
  onCast,
  onPlace,
}: {
  locations: readonly LocationRecord[];
  script: SavedScript;
  parsed: ParsedScript;
  cast: readonly ScriptCastMember[];
  onCast: (speaker: string, castId: string | null | undefined) => void;
  onPlace: (place: string, choice: ScriptPlaceChoice | undefined) => void;
}) {
  const speakers = resolveSpeakers(
    parsed.scenes.flatMap(scene => scene.speakers),
    cast,
    script.castMap
  );
  const places = resolvePlaces(
    parsed.scenes.map(scene => scene.place).filter(Boolean),
    script.placeMap,
    locations
  );
  const nameOf = (id: string | null | undefined) =>
    id === null ? 'Not in the Cast' : (cast.find(member => member.id === id)?.name ?? '');
  if (!speakers.length && !places.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {speakers.length ? (
        <div data-testid="script-speakers">
          <h4 className="type-caption mb-1 font-medium">Who&apos;s who</h4>
          <ul className="space-y-1">
            {speakers.map(part => (
              <li
                key={part.speaker}
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid={`script-speaker-${part.speaker}`}
                data-status={part.status}
              >
                <span className="min-w-[6rem] font-medium">{part.speaker}</span>
                <select
                  aria-label={`Who plays ${part.speaker}`}
                  className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm"
                  value={part.castId === null ? 'none' : (part.castId ?? '')}
                  onChange={event => {
                    const value = event.target.value;
                    onCast(part.speaker, value === 'none' ? null : value || undefined);
                  }}
                >
                  <option value="">Not known yet</option>
                  {cast.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                  <option value="none">Not in the Cast</option>
                </select>
                {part.status === 'suggested' ? (
                  <>
                    <span className="type-caption text-[var(--text-muted)]">
                      matched by {part.how} — confirm?
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`script-speaker-confirm-${part.speaker}`}
                      onClick={() => onCast(part.speaker, part.castId)}
                    >
                      Confirm
                    </Button>
                  </>
                ) : part.status === 'unknown' ? (
                  <span className="type-caption ui-status-danger">unknown</span>
                ) : (
                  <span className="type-caption text-[var(--text-muted)]">
                    {nameOf(part.castId)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {places.length ? (
        <div data-testid="script-places">
          <h4 className="type-caption mb-1 font-medium">Where</h4>
          <ul className="space-y-1">
            {places.map(place => (
              <li
                key={place.place}
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid={`script-place-${place.place}`}
                data-status={place.status}
                data-choice={place.choice}
              >
                <span className="min-w-[6rem] font-medium">{place.place}</span>
                <select
                  aria-label={`Where ${place.place} is`}
                  className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm"
                  value={place.choice}
                  onChange={event => onPlace(place.place, event.target.value as ScriptPlaceChoice)}
                >
                  {(Object.keys(PLACE_LABELS) as Array<keyof typeof PLACE_LABELS>).map(choice => (
                    <option key={choice} value={choice}>
                      {PLACE_LABELS[choice]}
                    </option>
                  ))}
                  {locations.length ? (
                    <optgroup label="Locations">
                      {locations.map(location => (
                        <option key={location.id} value={locationChoice(location.id)}>
                          {location.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                <span className="type-caption text-[var(--text-muted)]">
                  {place.status === 'suggested'
                    ? place.locationId
                      ? 'matched by name'
                      : 'as Castcut reads it'
                    : 'set by you'}
                  {place.room ? ` · ${place.room}` : ''}
                </span>
                {place.status === 'confirmed' ? (
                  <Button size="sm" variant="ghost" onClick={() => onPlace(place.place, undefined)}>
                    Reset
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Element({ element }: { element: ScriptElement }) {
  const lines = element.text.split('\n');
  const body = lines.map((line, index) => (
    <span key={index}>
      {index ? <br /> : null}
      {line}
    </span>
  ));
  switch (element.kind) {
    case 'character':
      return <p className="mt-2 pl-[30%] font-medium uppercase">{element.text}</p>;
    case 'dialogue':
      return <p className="pl-[15%] pr-[15%]">{body}</p>;
    case 'parenthetical':
      return <p className="pl-[22%] italic text-[var(--text-muted)]">{element.text}</p>;
    case 'transition':
      return <p className="mt-2 text-right uppercase">{element.text}</p>;
    case 'centered':
      return <p className="mt-2 text-center">{element.text}</p>;
    case 'lyric':
      return <p className="pl-[15%] italic">{body}</p>;
    case 'note':
      return (
        <p className="mt-2 rounded bg-[var(--bg-muted)] px-2 py-1 type-caption text-[var(--text-muted)]">
          Note: {element.text}
        </p>
      );
    case 'section':
    case 'synopsis':
      return <p className="mt-2 type-caption text-[var(--text-muted)]">{element.text}</p>;
    case 'page-break':
      return <hr className="my-2 border-[var(--border-subtle)]" />;
    default:
      return <p className="mt-2">{body}</p>;
  }
}

function SceneReading({
  scene,
  index,
  meta,
  children,
}: {
  scene: ScriptScene;
  index: number;
  /** A short status after the heading (an open script's coverage). */
  meta?: string;
  children?: ReactNode;
}) {
  const label = scene.heading || `Beat ${index + 1}`;
  // Its text and shots only while it is open (M6 V7): a feature script's 60 scenes, all drawn
  // though folded, put about 10,000 elements on the page and slowed every frame.
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1"
      data-testid={`script-scene-${scene.id}`}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">
          {scene.number ? `${scene.number}. ` : ''}
          {label}
        </span>
        <span className="type-caption ml-2 text-[var(--text-muted)]">
          {[
            scene.setting,
            scene.dayPart,
            scene.speakers.length ? scene.speakers.join(', ') : '',
            `lines ${scene.from}–${scene.to}`,
            meta,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </summary>
      {open ? (
        <>
          <div className="mt-1 font-mono text-xs leading-relaxed">
            {scene.elements.map((element, at) => (
              <Element key={at} element={element} />
            ))}
          </div>
          {children}
        </>
      ) : null}
    </details>
  );
}

function Reading({
  parsed,
  shotsFor,
  metaFor,
}: {
  parsed: ParsedScript;
  metaFor?: (scene: ScriptScene) => string;
  /** An open script's shot list under each scene (S4). */
  shotsFor?: (scene: ScriptScene, index: number) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      {parsed.issues.length ? (
        <ul className="space-y-1" data-testid="script-issues">
          {parsed.issues.map((issue, at) => (
            <li key={at} className="type-caption ui-status-danger">
              Line {issue.line}: {issue.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="type-caption text-[var(--text-muted)]" data-testid="script-summary">
        {scriptSummary(parsed)}
      </p>
      <div className="space-y-1">
        {parsed.scenes.map((scene, index) => (
          <SceneReading key={scene.id} scene={scene} index={index} meta={metaFor?.(scene)}>
            {shotsFor?.(scene, index)}
          </SceneReading>
        ))}
      </div>
    </div>
  );
}

/**
 * The Scene page's Script section (M3 S2): import a screenplay (Fountain or plain text) for the
 * Cast, see how it reads — scene by scene, what wasn't understood — and keep it. Its scenes become
 * planned shots and Scenes in S4.
 */
export default function SceneScripts({
  castId,
  castName,
  cast,
  cache,
  update,
  scenes,
  makeScene,
  openScene,
  prepareRun,
}: {
  castId: string;
  castName?: string;
  /** The Cast, for matching speaking parts. */
  cast: readonly ScriptCastMember[];
  cache: ScriptsCache;
  update: (patch: ScriptsCache) => void;
  /** The Cast's Scenes (what each planned shot became). */
  scenes: readonly SavedScene[];
  /** Make a Scene from a shot and open it; `also` links the shot in the same write. */
  makeScene: (
    input: Pick<ShotSceneDraft, 'name' | 'slot' | 'partnerCharacterId'> & {
      fromScript: SceneScriptLink;
    },
    also: (sceneId: string) => ScriptsCache | null
  ) => string | null;
  openScene: (sceneId: string) => void;
  /** Prepare a run over the script (M5 W3): its planned shots made into Scenes, nothing rendered. */
  prepareRun?: (
    script: SavedScript,
    made: Array<{ shot: PlannedShot; draft: ShotSceneDraft }>
  ) => { created: number } | null;
}) {
  // The store hands them over clean: only their per-Cast cap is applied here (M6 V7).
  const scripts = useMemo(
    () =>
      scriptsForCast(
        normalizeSavedScripts(cache.scripts, undefined, new Set<unknown>(cache.scripts)),
        castId
      ),
    [cache.scripts, castId]
  );
  // /scene?script=<id> opens that script (Film Director's next actions, M5 W2).
  const locations = useLocations();
  const [openId, setOpenId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('script')?.trim() || null
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reimporting, setReimporting] = useState(false);
  const [prepareNote, setPrepareNote] = useState<string | null>(null);
  // M9 T3: the open script as a storyboard instead of its reading.
  const [board, setBoard] = useState(false);
  const open = scripts.find(script => script.id === openId) ?? null;
  const openParsed = useMemo(() => (open ? parseScript(open.source) : null), [open]);
  const draftParsed = useMemo(() => (draft?.trim() ? parseScript(draft) : null), [draft]);
  const madeSceneIds = useMemo(() => new Set(scenes.map(scene => scene.id)), [scenes]);
  const orphans = useMemo(
    () => (open && openParsed ? orphanedShots(open.shots, openParsed) : []),
    [open, openParsed]
  );
  // Coverage (S5): how far each planned scene has got, and what looks missing.
  const decisions = useSyncExternalStore(
    subscribeFindingDecisions,
    decisionsSnapshot,
    () => NO_DECISIONS
  );
  const coverage = useMemo(() => {
    if (!open || !openParsed) return null;
    const cut = loadSettingsCache().tools.cut;
    const decided = findingDecisionMap(decisions);
    const unsetPlaces = unsetPlaceShots({
      scenes: openParsed.scenes,
      shots: open.shots ?? [],
      placeMap: open.placeMap,
      locations,
    });
    const byScene = new Map(
      openParsed.scenes.map(scene => {
        const shots = shotsForScene(open.shots, scene.id);
        const counts = sceneCoverage(shots, scenes, cut);
        const findings = coverageFindings({
          scriptId: open.id,
          scene,
          shots,
          coverage: counts,
          unsetPlaces,
        }).map(finding => ({ finding, decision: decided.get(finding.id) }));
        return [scene.id, { counts, findings }] as const;
      })
    );
    const all = [...byScene.values()];
    const planned = all.filter(entry => entry.counts.planned).length;
    const sum = (key: 'made' | 'kept' | 'inCut') =>
      all.reduce((total, entry) => total + entry.counts[key], 0);
    const open_ = all.reduce(
      (total, entry) => total + entry.findings.filter(item => !item.decision).length,
      0
    );
    const total = [
      `${planned} of ${all.length} scene${all.length === 1 ? '' : 's'} planned`,
      `${sum('made')} shot${sum('made') === 1 ? '' : 's'} made`,
      `${sum('kept')} kept`,
      `${sum('inCut')} in the Cut`,
      open_ ? `${open_} to look at` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return { byScene, total };
  }, [decisions, locations, open, openParsed, scenes]);

  const keep = () => {
    if (!draft) return;
    const script = createScript({ castId, source: draft });
    if (!script) {
      setError(
        draft.length > SCRIPT_SOURCE_MAX
          ? `That script is too long to keep (${draft.length.toLocaleString()} characters; at most ${SCRIPT_SOURCE_MAX.toLocaleString()}).`
          : 'Paste or upload a script first.'
      );
      return;
    }
    update(addScriptPatch(cache, script));
    setDraft(null);
    setError(null);
    setOpenId(script.id);
  };

  const remove = async () => {
    if (!open) return;
    const ok = await confirmAction({
      title: `Delete the script “${open.name}”?`,
      body: 'Scenes already made from it stay. The script text goes.',
      confirmLabel: 'Delete script',
      tone: 'danger',
    });
    if (!ok) return;
    update(removeScriptPatch(cache, open.id));
    setOpenId(null);
  };

  /** "Make it a Scene" from a planned shot — the shot list's and the storyboard's (M9 T3). */
  const makeFromShot = (
    scene: ScriptScene,
    sceneIndex: number,
    shot: PlannedShot,
    shotIndex: number
  ) => {
    if (!open) return;
    const sceneShots = shotsForScene(open.shots, scene.id);
    const draft = shotSceneDraft({
      shot,
      scene,
      sceneIndex,
      shotIndex,
      castId,
      cast,
      castMap: open.castMap,
      placeMap: open.placeMap,
      locations,
    });
    makeScene(
      {
        ...draft,
        fromScript: { scriptId: open.id, sceneId: scene.id, shotId: shot.id },
      },
      sceneId =>
        setScriptShotsPatch(
          cache,
          open.id,
          withSceneShots(
            open.shots,
            scene.id,
            sceneShots.map(entry =>
              entry.id === shot.id ? { ...entry, madeSceneId: sceneId } : entry
            )
          )
        )
    );
  };

  return (
    <ToolSection data-testid="scene-scripts" title="Script">
      <p className="type-caption mb-2 text-[var(--text-muted)]">
        A screenplay for {castName ?? 'this Cast'} — Fountain or plain text. See how it reads, scene
        by scene, then plan each scene&apos;s shots and make them Scenes.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {scripts.map(script => (
          <Button
            key={script.id}
            size="sm"
            variant={script.id === openId ? 'secondary' : 'ghost'}
            aria-pressed={script.id === openId}
            data-testid={`script-open-${script.id}`}
            onClick={() => {
              setDraft(null);
              setOpenId(script.id === openId ? null : script.id);
            }}
          >
            {script.name}
          </Button>
        ))}
        <Button
          size="sm"
          variant={scripts.length ? 'ghost' : 'secondary'}
          data-testid="script-import"
          onClick={() => {
            setOpenId(null);
            setDraft(draft === null ? '' : null);
            setError(null);
          }}
        >
          {draft === null ? 'Import a script' : 'Cancel'}
        </Button>
      </div>

      {draft !== null ? (
        <div className="mt-3 space-y-2" data-testid="script-import-form">
          <textarea
            aria-label="Script text"
            className="h-48 w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 font-mono text-xs"
            placeholder={'INT. KITCHEN - MORNING\n\nShe pours coffee.\n\nNORA\nCoffee first.'}
            value={draft}
            data-testid="script-import-text"
            onChange={event => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <UploadButton
              label="Upload a file…"
              accept=".fountain,.spmd,.txt,.md,text/plain"
              testId="script-import-file"
              onFile={file => void file.text().then(text => setDraft(text))}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!draftParsed}
              data-testid="script-keep"
              onClick={keep}
            >
              Keep this script
            </Button>
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
          {draftParsed ? <Reading parsed={draftParsed} /> : null}
        </div>
      ) : null}

      {open && openParsed ? (
        <div className="mt-3 space-y-2" data-testid="script-reading">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Script name"
              className="min-w-[12rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-sm"
              defaultValue={open.name}
              key={open.id}
              data-testid="script-name"
              onBlur={event => {
                const patch = renameScriptPatch(cache, open.id, event.target.value);
                if (patch) update(patch);
              }}
            />
            <Button
              size="sm"
              variant={board ? 'secondary' : 'ghost'}
              aria-pressed={board}
              data-testid="script-board-toggle"
              title="See its planned shots as a board — each with its kept take, or a card"
              onClick={() => setBoard(value => !value)}
            >
              {board ? 'Script' : 'Storyboard'}
            </Button>
            {board && open.shots?.length ? (
              <ButtonLink
                size="sm"
                variant="ghost"
                href={`/cut?from=script&script=${encodeURIComponent(open.id)}`}
                data-testid="script-animatic"
              >
                Cut it as an animatic →
              </ButtonLink>
            ) : null}
            {prepareRun ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={!open.shots?.length}
                title="Make its planned shots into Scenes and list what a run would render — nothing renders yet"
                data-testid="script-prepare-run"
                onClick={() => {
                  const parsed = openParsed;
                  const { fit, overLimit } = shotsToPrepare(open, scenes);
                  const made = fit.flatMap(shot => {
                    const sceneIndex = parsed.scenes.findIndex(scene => scene.id === shot.sceneId);
                    const scene = parsed.scenes[sceneIndex];
                    if (!scene) return [];
                    const shotIndex = shotsForScene(open.shots, scene.id).findIndex(
                      entry => entry.id === shot.id
                    );
                    return [
                      {
                        shot,
                        draft: shotSceneDraft({
                          shot,
                          scene,
                          sceneIndex,
                          shotIndex,
                          castId,
                          cast,
                          castMap: open.castMap,
                          placeMap: open.placeMap,
                          locations,
                        }),
                      },
                    ];
                  });
                  const result = prepareRun(open, made);
                  setPrepareNote(
                    result
                      ? [
                          result.created
                            ? `${result.created} planned shot${result.created === 1 ? '' : 's'} made into Scenes`
                            : 'Every planned shot is a Scene already',
                          overLimit
                            ? `${overLimit} not made: the Cast has ${SCENE_LIMIT_PER_CAST} Scenes`
                            : '',
                          'the run is listed below — nothing renders until you start it',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : null
                  );
                }}
              >
                Prepare a run…
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={reimporting ? 'secondary' : 'ghost'}
              aria-pressed={reimporting}
              data-testid="script-reimport-open"
              onClick={() => setReimporting(!reimporting)}
            >
              Import a new version
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="script-delete"
              onClick={() => void remove()}
            >
              Delete
            </Button>
          </div>
          <NamesAndPlaces
            script={open}
            parsed={openParsed}
            cast={cast}
            locations={locations}
            onCast={(speaker, member) => {
              const patch = setScriptCastPatch(cache, open.id, speaker, member);
              if (patch) update(patch);
            }}
            onPlace={(place, choice) => {
              const patch = setScriptPlacePatch(cache, open.id, place, choice);
              if (patch) update(patch);
            }}
          />
          {prepareNote ? (
            <p className="type-caption" data-testid="script-prepare-note">
              {prepareNote}
            </p>
          ) : null}
          {reimporting ? (
            <SceneScriptReimport
              script={open}
              parsed={openParsed}
              madeSceneIds={madeSceneIds}
              onClose={() => setReimporting(false)}
              onApply={next => {
                update({
                  scripts: (cache.scripts ?? []).map(script =>
                    script.id === next.id ? next : script
                  ),
                });
                setReimporting(false);
              }}
            />
          ) : null}
          {orphans.length ? (
            <div className="space-y-1" data-testid="script-orphans">
              <p className="type-caption font-medium">Shots from scenes no longer in the script</p>
              <SceneScriptShots
                scene={{
                  id: '~orphans',
                  heading: '',
                  place: '',
                  elements: [],
                  speakers: [],
                  from: 0,
                  to: 0,
                }}
                sceneIndex={-1}
                orphans
                shots={orphans}
                scenes={scenes}
                onShots={kept => {
                  const keptIds = new Set(kept.map(shot => shot.id));
                  const gone = new Set(
                    orphans.filter(shot => !keptIds.has(shot.id)).map(shot => shot.id)
                  );
                  const patch = setScriptShotsPatch(
                    cache,
                    open.id,
                    (open.shots ?? []).filter(shot => !gone.has(shot.id))
                  );
                  if (patch) update(patch);
                }}
                onMake={() => {}}
                onOpenScene={openScene}
              />
            </div>
          ) : null}
          {coverage ? (
            <p className="type-caption" data-testid="script-coverage">
              <span className="font-medium">Coverage:</span> {coverage.total}
            </p>
          ) : null}
          {board ? (
            <ScriptStoryboard
              rows={storyboard({ scenes: openParsed.scenes, shots: open.shots, made: scenes })}
              onOpenScene={openScene}
              onMake={card => {
                const sceneIndex = openParsed.scenes.findIndex(
                  entry => entry.id === card.shot.sceneId
                );
                const scene = openParsed.scenes[sceneIndex];
                if (!scene) return;
                const shotIndex = shotsForScene(open.shots, scene.id).findIndex(
                  entry => entry.id === card.shot.id
                );
                makeFromShot(scene, sceneIndex, card.shot, shotIndex);
              }}
            />
          ) : (
            <Reading
              parsed={openParsed}
              metaFor={scene => {
                const counts = coverage?.byScene.get(scene.id)?.counts;
                return counts?.planned
                  ? `${counts.made}/${counts.planned} made · ${counts.kept} kept`
                  : '';
              }}
              shotsFor={(scene, sceneIndex) => {
                const sceneShots = shotsForScene(open.shots, scene.id);
                const sceneCov = coverage?.byScene.get(scene.id);
                return (
                  <SceneScriptShots
                    coverage={sceneCov ? coverageSummary(sceneCov.counts) : ''}
                    findings={sceneCov?.findings}
                    onDecide={(id, kind) => (kind ? decideFinding(id, kind) : undecideFinding(id))}
                    scene={scene}
                    sceneIndex={sceneIndex}
                    shots={sceneShots}
                    scriptShots={open.shots ?? []}
                    scenes={scenes}
                    onShots={next => {
                      const patch = setScriptShotsPatch(
                        cache,
                        open.id,
                        withSceneShots(open.shots, scene.id, next)
                      );
                      if (patch) update(patch);
                    }}
                    onMake={(shot, shotIndex) => makeFromShot(scene, sceneIndex, shot, shotIndex)}
                    onOpenScene={openScene}
                  />
                );
              }}
            />
          )}
        </div>
      ) : null}
    </ToolSection>
  );
}

/**
 * The Script section on the script store (M6 V6/V7, useSceneScripts): a script saved re-renders
 * this section only, not the whole Scene page around it.
 */
export function SceneScriptsSection({
  sceneTool,
  ...props
}: Omit<Parameters<typeof SceneScripts>[0], 'cache' | 'update'> & {
  sceneTool: Parameters<typeof useSceneScripts>[0];
}) {
  const { cache, update } = useSceneScripts(sceneTool);
  return <SceneScripts {...props} cache={cache} update={update} />;
}
