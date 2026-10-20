export type EloEntry = {
  id: string;
  label: string;
  rating: number;
  matches: number;
};

const K = 32;

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function updateEloRatings(
  entries: EloEntry[],
  winnerId: string,
  loserId: string
): EloEntry[] {
  const winner = entries.find(entry => entry.id === winnerId);
  const loser = entries.find(entry => entry.id === loserId);
  if (!winner || !loser) {
    return entries;
  }

  const expectedWinner = expectedScore(winner.rating, loser.rating);
  const expectedLoser = expectedScore(loser.rating, winner.rating);

  return entries.map(entry => {
    if (entry.id === winnerId) {
      return {
        ...entry,
        rating: Math.round(entry.rating + K * (1 - expectedWinner)),
        matches: entry.matches + 1,
      };
    }
    if (entry.id === loserId) {
      return {
        ...entry,
        rating: Math.round(entry.rating + K * (0 - expectedLoser)),
        matches: entry.matches + 1,
      };
    }
    return entry;
  });
}

export function createEloBracket(entryIds: string[]): Array<[string, string]> {
  const shuffled = [...entryIds].sort(() => Math.random() - 0.5);
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  return pairs;
}

export function initEloEntries(ids: string[], labels: Record<string, string>): EloEntry[] {
  return ids.map(id => ({
    id,
    label: labels[id] ?? id,
    rating: 1500,
    matches: 0,
  }));
}
