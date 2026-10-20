import type { SubjectGender } from '../variation/seed';

export function subjectGenderToClothingGender(
  gender: SubjectGender | undefined
): 'women' | 'men' | 'any' {
  if (gender === 'women' || gender === 'men') {
    return gender;
  }

  return 'any';
}
