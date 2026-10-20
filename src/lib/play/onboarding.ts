/** Play's onboarding milestones (first film started, first film cut) with their Play metrics. */

import { markOnboardingStepDone } from '../app/onboarding-store';

/** First Moodboard → Day / Roleplay film loop after a still lands. */
export function markOnboardingFirstPlayCampaign(): boolean {
  void import('./metrics').then(({ recordFirstPlayCampaignStart }) => {
    recordFirstPlayCampaignStart();
  });
  void import('../server/local-observability').then(({ noteFirstPlayCampaignMetric }) => {
    noteFirstPlayCampaignMetric();
  });
  return markOnboardingStepDone('first-play-campaign');
}

/** First successful Cut film in Day or Roleplay (Play success metric). */
export function markOnboardingFirstFilmCut(): boolean {
  void import('./metrics').then(({ recordFirstFilmCut }) => {
    recordFirstFilmCut();
  });
  void import('../server/local-observability').then(({ noteFirstFilmCutMetric }) => {
    noteFirstFilmCutMetric();
  });
  return markOnboardingStepDone('first-film-cut');
}
