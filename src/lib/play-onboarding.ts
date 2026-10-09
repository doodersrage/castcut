/** Play's onboarding milestones (first film started, first film cut) with their Play metrics. */

import { markOnboardingStepDone } from './onboarding-store';

/** First Moodboard → Day / Roleplay film loop after a still lands. */
export function markOnboardingFirstPlayCampaign(): boolean {
  void import('./play-metrics').then(({ recordFirstPlayCampaignStart }) => {
    recordFirstPlayCampaignStart();
  });
  void import('./local-observability').then(({ noteFirstPlayCampaignMetric }) => {
    noteFirstPlayCampaignMetric();
  });
  return markOnboardingStepDone('first-play-campaign');
}

/** First successful Cut film in Day or Roleplay (Play success metric). */
export function markOnboardingFirstFilmCut(): boolean {
  void import('./play-metrics').then(({ recordFirstFilmCut }) => {
    recordFirstFilmCut();
  });
  void import('./local-observability').then(({ noteFirstFilmCutMetric }) => {
    noteFirstFilmCutMetric();
  });
  return markOnboardingStepDone('first-film-cut');
}
