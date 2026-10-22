/**
 * Play's fields in the synced studio-extras payload (registered by play-features.ts). Same keys
 * and the same apply guards as when studio-extras owned them, so the stored payload is unchanged.
 */

import type { StudioExtrasPayload, StudioExtrasSection } from '../app/studio-extras';
import type { DayDressPlateEntry } from '../day/dress-plate-cache';
import { loadDressPlates, replaceDressPlates } from '../day/dress-plate-store';
import {
  loadSavedFittingGarments,
  replaceSavedFittingGarments,
  type SavedFittingGarment,
} from '../fitting/saved-garments';
import {
  clearPlayCampaignState,
  loadPlayCampaignState,
  savePlayCampaignState,
  type PlayCampaignState,
} from './campaign';
import { loadPlayMetrics, savePlayMetrics, type PlayMetrics } from './metrics';
import { loadMyPosePacks, replaceMyPosePacks } from '../pose/my-pose-packs';
import type { PosePack } from '../day/pose-packs';
import { loadAllDirections, replaceDirections } from '../director/store';

export const PLAY_STUDIO_EXTRAS_SECTION: StudioExtrasSection = {
  collect: () => ({
    playMetrics: loadPlayMetrics(),
    playCampaignState: loadPlayCampaignState(),
    fittingSavedGarments: loadSavedFittingGarments(),
    dressPlates: loadDressPlates(),
    /** "My packs" — Day slot poses saved as a pose pack. */
    myPosePacks: loadMyPosePacks(),
    /** The Director's saved directions (every Cast member). */
    directorDirections: loadAllDirections(),
  }),
  apply: (payload: StudioExtrasPayload) => {
    const fittingSavedGarments = payload.fittingSavedGarments as SavedFittingGarment[] | undefined;
    if (fittingSavedGarments) {
      replaceSavedFittingGarments(fittingSavedGarments);
    }
    // An empty list from the server never empties a local one (see studio-extras).
    const dressPlates = payload.dressPlates as DayDressPlateEntry[] | undefined;
    if (dressPlates && (dressPlates.length > 0 || loadDressPlates().length === 0)) {
      replaceDressPlates(dressPlates);
    }
    const myPosePacks = payload.myPosePacks as PosePack[] | undefined;
    if (myPosePacks) {
      replaceMyPosePacks(myPosePacks);
    }
    if (Array.isArray(payload.directorDirections)) {
      replaceDirections(payload.directorDirections);
    }
    const playMetrics = payload.playMetrics as PlayMetrics | undefined;
    if (playMetrics) {
      savePlayMetrics(playMetrics);
    }
    if ('playCampaignState' in payload) {
      const state = payload.playCampaignState as PlayCampaignState | null | undefined;
      if (state) {
        savePlayCampaignState(state);
      } else {
        clearPlayCampaignState();
      }
    }
  },
};
