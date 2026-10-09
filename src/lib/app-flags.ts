/**
 * Yes/no questions shared screens ask of the features (docs/architecture-boundaries.md): Play
 * answers "has this person started a film?" for the home dashboard's goal chooser, without the
 * dashboard importing Play. An unanswered flag is false.
 */
export type AppFlagName = 'home.showGoalChooser' | 'onboarding.firstFilmDone';

const answers = new Map<AppFlagName, () => boolean>();

export function registerAppFlag(name: AppFlagName, answer: () => boolean): void {
  answers.set(name, answer);
}

export function appFlag(name: AppFlagName): boolean {
  try {
    return answers.get(name)?.() === true;
  } catch {
    return false;
  }
}
