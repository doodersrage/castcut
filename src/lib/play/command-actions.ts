/**
 * Play's command palette actions (lib/app/command-actions.ts). App actions are registered once by
 * lib/play/features.ts; the pages add their own while open (Day: Queue the Day, Animate all; Cut:
 * Cut the film — which replaces the "open Cut" one here).
 */

import type { CommandAction } from '../app/command-actions';
import { loadSettingsCache, saveSharedSettings } from '../settings/cache';

/**
 * Film's create form shows while no Cast is picked: put the current one down (as Film's own
 * "None" does). Cast's "New character" and the palette's "New Cast member" both do this.
 */
export function putDownActiveCast(): void {
  saveSharedSettings({
    ...loadSettingsCache().shared,
    activeCharacterId: undefined,
    activeLookId: undefined,
    activeCharacterDescriptor: undefined,
    ipAdapterImageFilename: undefined,
    ipAdapterImageFilenames: undefined,
    ipAdapterImageUrl: undefined,
    ipAdapterComfyUrl: undefined,
    ipAdapterStrength: undefined,
    ipAdapterModelFilename: undefined,
    identityKind: undefined,
  });
}

export const NEW_CAST_MEMBER_HREF = '/play?new=1';

export const PLAY_COMMAND_ACTION_IDS = {
  newCastMember: 'play-new-cast-member',
  openStory: 'play-open-story',
  openOutfit: 'play-open-outfit',
  openDay: 'play-open-day',
  cutFilm: 'play-cut-film',
  queueDay: 'play-queue-day',
  animateAll: 'play-animate-all',
} as const;

export const PLAY_APP_COMMAND_ACTIONS: CommandAction[] = [
  {
    id: PLAY_COMMAND_ACTION_IDS.newCastMember,
    label: 'New Cast member',
    subtitle: 'Film · name a new lead (a photo helps)',
    keywords: 'character cast lead person create add',
    run: () => putDownActiveCast(),
    href: NEW_CAST_MEMBER_HREF,
  },
  {
    id: PLAY_COMMAND_ACTION_IDS.openStory,
    label: 'Open Story',
    subtitle: 'Story · beats that continue your Cast’s film',
    keywords: 'roleplay beats story scene',
    href: '/story',
  },
  {
    id: PLAY_COMMAND_ACTION_IDS.openOutfit,
    label: 'Open Outfit',
    subtitle: 'Outfit · dress your Cast and try looks on',
    keywords: 'fitting wardrobe clothes try on dress',
    href: '/fitting',
  },
  {
    id: PLAY_COMMAND_ACTION_IDS.openDay,
    label: 'Open Day',
    subtitle: 'Day · queue the day, animate, cut',
    keywords: 'day planner morning night stills queue',
    href: '/day',
  },
  {
    id: PLAY_COMMAND_ACTION_IDS.cutFilm,
    label: 'Cut the film',
    subtitle: 'Opens Cut · arrange the shots and cut',
    keywords: 'cut film assemble edit export movie',
    href: '/cut',
  },
];
