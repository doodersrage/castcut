export type PetSpecies = 'dog' | 'cat' | 'rabbit' | 'bird' | 'other';

export type ParsedPetHints = {
  species: PetSpecies | null;
  breedHint: string | null;
  pair: boolean;
  raw: string;
  hasSpeciesConstraints: boolean;
};

const DOG_PATTERN =
  /\b(dog|dogs|puppy|puppies|corgi|retriever|shepherd|husky|beagle|bulldog|poodle|dachshund|collie|terrier|malamute|doberman|rottweiler|greyhound|labrador|spaniel|shiba|akita|mastiff|whippet|dalmatian|chihuahua|samoyed)\b/i;
const CAT_PATTERN =
  /\b(cat|cats|kitten|kittens|tabby|maine coon|ragdoll|siamese|persian|bengal|sphynx|calico|tuxedo cat|scottish fold|british shorthair|abyssinian|birman)\b/i;
const RABBIT_PATTERN = /\b(rabbit|rabbits|bunny|bunnies|holland lop|lop ear)\b/i;
const BIRD_PATTERN =
  /\b(bird|birds|parrot|parrots|macaw|cockatiel|budgie|budgerigar|canary|finch|cockatoo|african grey|lovebird)\b/i;
const REPTILE_PATTERN =
  /\b(reptile|reptiles|lizard|lizards|gecko|geckos|snake|snakes|tortoise|turtle|bearded dragon|iguana|chameleon|python|corn snake|leopard gecko)\b/i;
const PAIR_PATTERN =
  /\b(two|pair|couple|duo|both|twins)\b.{0,24}\b(dogs|cats|puppies|kittens|rabbits|birds|pets|animals)\b|\b(two|pair of)\s+(dogs|cats|puppies|kittens|rabbits|birds|pets)\b/i;

function detectSpecies(text: string): PetSpecies | null {
  if (DOG_PATTERN.test(text)) {
    return 'dog';
  }
  if (CAT_PATTERN.test(text)) {
    return 'cat';
  }
  if (RABBIT_PATTERN.test(text)) {
    return 'rabbit';
  }
  if (BIRD_PATTERN.test(text)) {
    return 'bird';
  }
  if (REPTILE_PATTERN.test(text)) {
    return 'other';
  }
  return null;
}

function extractBreedHint(text: string, species: PetSpecies | null): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (species === 'dog' && DOG_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (species === 'cat' && CAT_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (species === 'rabbit' && RABBIT_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (species === 'bird' && BIRD_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const firstClause = trimmed.split(/[.;]/)[0]?.trim();
  return firstClause && firstClause.length <= 120 ? firstClause : trimmed.slice(0, 120);
}

export function parsePetHints(
  hints?: string,
  overrides?: {
    species?: PetSpecies | null;
    pair?: boolean;
  }
): ParsedPetHints {
  const raw = hints?.trim() ?? '';
  const species = overrides?.species ?? detectSpecies(raw);
  const pair = overrides?.pair ?? PAIR_PATTERN.test(raw);
  const breedHint = extractBreedHint(raw, species);

  return {
    species,
    breedHint,
    pair,
    raw,
    hasSpeciesConstraints: Boolean(species || breedHint),
  };
}

export function buildPetMandatoryBlock(parsed: ParsedPetHints, hints?: string): string | null {
  const lines: string[] = [];

  if (parsed.pair) {
    lines.push('MANDATORY PET COUNT: exactly two animals in frame—no third pet, crowd, or extras.');
  } else {
    lines.push(
      'MANDATORY PET COUNT: exactly one animal as the primary subject—no extra pets or animal crowds.'
    );
  }

  lines.push(
    'MANDATORY EXCLUSIONS: no people, human hands, faces, silhouettes, or human body parts anywhere in frame.'
  );

  if (parsed.species) {
    lines.push(
      `MANDATORY SPECIES: keep the subject clearly a ${parsed.species}; do not substitute a different animal type.`
    );
  }

  if (parsed.breedHint && hints?.trim()) {
    lines.push(`MANDATORY PET IDENTITY: honor the user's pet description—${parsed.breedHint}.`);
  }

  return lines.join('\n');
}
