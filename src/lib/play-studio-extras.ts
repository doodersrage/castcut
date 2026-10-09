/**
 * Play's fields in the synced studio-extras payload (registered by play-features.ts). Same keys
 * and the same apply guards as when studio-extras owned them, so the stored payload is unchanged.
 */

import type { StudioExtrasPayload, StudioExtrasSection } from './studio-extras';
import type { DayDressPlateEntry } from './dress-plate-cache';
import { loadDressPlates, replaceDressPlates } from './dress-plate-store';
import {
  loadSavedFittingGarments,
  replaceSavedFittingGarments,
  type SavedFittingGarment,
} from './fitting-saved-garments';
import {
  clearPlayCampaignState,
  loadPlayCampaignState,
  savePlayCampaignState,
  type PlayCampaignState,
} from './play-campaign';
import { loadPlayMetrics, savePlayMetrics, type PlayMetrics } from './play-metrics';
import { loadMyPosePacks, replaceMyPosePacks } from './my-pose-packs';
import type { PosePack } from './day-pose-packs';

export const PLAY_STUDIO_EXTRAS_SECTION: StudioExtrasSection = {
  collect: () => ({
    playMetrics: loadPlayMetrics(),
    playCampaignState: loadPlayCampaignState(),
    fittingSavedGarments: loadSavedFittingGarments(),
    dressPlates: loadDressPlates(),
    /** "My packs" — Day slot poses saved as a pose pack. */
    myPosePacks: loadMyPosePacks(),
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
