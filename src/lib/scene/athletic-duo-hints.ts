import { inferAthleticSport } from './athletic-sport-profiles';
import { isMultiPersonInput } from '../checks/distinct-people';

const ATHLETIC_DUO_COMPETITION_HINT =
  /\b(?:competition|competing|race|racing|fierce|rival(?:ry|s)?|versus|vs\.?|sprint finish|wheel-to-wheel|head-to-head)\b/i;

export function hintsDescribeAthleticDuoCompetition(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || !isMultiPersonInput(trimmed)) {
    return false;
  }

  if (!ATHLETIC_DUO_COMPETITION_HINT.test(trimmed)) {
    return false;
  }

  return inferAthleticSport(trimmed) !== null;
}
