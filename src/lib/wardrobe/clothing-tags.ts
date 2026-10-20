import type { SubjectGender } from '../variation/seed';
import { inferSubjectGenderFromHints } from '../checks/distinct-people';
import type { AthleticSport } from '../scene/athletic-sport-profiles';
import {
  getAthleticSportGuardrail,
  hintsDescribeCyclingActivity,
  inferAthleticSport,
} from '../scene/athletic-sport-profiles';
import { subjectGenderToClothingGender } from './clothing-gender';

export { subjectGenderToClothingGender } from './clothing-gender';

export type { AthleticSport } from '../scene/athletic-sport-profiles';
export { hintsDescribeCyclingActivity, inferAthleticSport };

export type ClothingScenePresetHints = {
  atmosphere?: string;
  aesthetic?: string;
};

export type ClothingGenderTag = 'women' | 'men' | 'neutral';

export type ClothingContextTag =
  | 'casual'
  | 'formal'
  | 'evening'
  | 'athletic'
  | 'outdoor'
  | 'cold'
  | 'warm'
  | 'wet'
  | 'work'
  | 'uniform'
  | 'costume'
  | 'beach'
  | 'urban'
  | 'swimwear'
  | 'intimate'
  | 'hosiery'
  | 'formalwear'
  | 'sleepwear'
  | 'underwear'
  | 'traditional';

export const CLOTHING_CONTEXT_TAGS: ClothingContextTag[] = [
  'casual',
  'formal',
  'evening',
  'athletic',
  'outdoor',
  'cold',
  'warm',
  'wet',
  'work',
  'uniform',
  'costume',
  'beach',
  'urban',
  'swimwear',
  'intimate',
  'hosiery',
  'formalwear',
  'sleepwear',
  'underwear',
  'traditional',
];

/** Contexts that require a matching scene tag before random pick or catalog validation. */
export const RESTRICTED_CLOTHING_CONTEXTS: ClothingContextTag[] = [
  'swimwear',
  'intimate',
  'hosiery',
  'formalwear',
  'sleepwear',
  'underwear',
];

const RESTRICTED_CONTEXT_REQUIREMENTS: Partial<
  Record<ClothingContextTag, readonly ClothingContextTag[]>
> = {
  swimwear: ['swimwear'],
  intimate: ['intimate'],
  hosiery: ['formal', 'evening', 'intimate'],
  formalwear: ['formal', 'evening'],
  sleepwear: ['intimate'],
  underwear: ['intimate'],
};

const WOMEN_GARMENT =
  /\b(?:dress|gown|skirt|heels|stiletto|tutu|cocktail dress|evening gown|a-line skirt|fish-tail skirt|maxi skirt|mini skirt|pencil skirt|wrap skirt|romper|camisole|corset top|blouse|peasant blouse|wrap blouse|halter top|slip dress|shirt dress|sweater dress|dirndl|sari|salwar kameez|hanbok|flamenco dress|ballroom dance dress|mary jane|kitten heels|block heel pumps|ballet flats|leggings|yoga pants|bikini|one-piece swimsuit|tankini|chemise|negligee|lingerie|bralette|bustier|teddy|garter belt|tap pants|stockings|pantyhose|tights|fishnet|twinset|skirt suit|fascinator|opera gloves)\b/i;

const MEN_GARMENT =
  /\b(?:brogues|monk strap|oxford dress shoes|tuxedo|three-piece suit|boxer briefs|jockstrap|codpiece|necktie with suit|suspenders and tie|chore coat with work boots|cowboy boots with hat|swim trunks|swim briefs|lounge shorts with robe)\b/i;

const WOMEN_LEAN =
  /\b(?:crop top|off-shoulder|bodysuit|spaghetti strap|wrap dress|sequin gown|platform heels|thigh-high boots with skirt)\b/i;

const MEN_LEAN =
  /\b(?:rugby shirt|fatigue jacket|military fatigue|dress shirt and tie|suit jacket|sport coat|tweed sport coat|work chore coat|steel-toe boots|hi-vis safety vest)\b/i;

/**
 * Explicit men's or women's undergarments / base-layer underwear in the input.
 * Swimwear (bikini, swim trunks, etc.) is intentionally excluded—those keep accent-only rolls.
 */
export const EXPLICIT_UNDERGARMENT_HINT =
  /\b(?:underwear|undergarments?|underpants|in her underwear|in his underwear|in their underwear|in underwear|only underwear|wearing underwear|lingerie|bra\b|bralette|sports bra|wireless bra|balconette bra|longline bra|plunge bra|push-up bra|push up bra|everyday bra|panties|hipster panties|cheeky panties|boyshorts|boy shorts|thong|g-string|g string|briefs|hipster briefs|high-waist briefs|high waist briefs|boxer briefs|boxers|boxer shorts|jockstrap|jock strap|athletic supporter|trunk underwear|underwear trunks|codpiece|undershirt|a-shirt|wifebeater|wife beater|singlet|undervest|long johns|long john|thermal underwear|union suit|compression shorts|drawers|chemise|negligee|negligée|teddy|bustier|corset lingerie|tap pants|garter belt|garters|shapewear|slip petticoat|y-fronts|y fronts|tighty whities|brief undershorts)\b/i;

export function hintsExplicitUndergarment(hints?: string): boolean {
  return EXPLICIT_UNDERGARMENT_HINT.test(hints?.trim() ?? '');
}

/** Active sport or physical exertion—not aesthetic words like "mythic folktale style". */
const ATHLETIC_ACTIVITY_HINT =
  /\b(?:sprinter|sprinting|somersault|backflip|hurdler|hurdles|marathon|triathlon|decathlon|pole vault|long jump|high jump|javelin|discus|shot put|track and field|track meet|relay race|competition|competing|athlete|athletic|workout|weightlifting|crossfit|parkour|gymnast|gymnastics|basketball|soccer|tennis|boxer|fencer|figure skater|skateboarder|climber|mountain biker|cyclist|cycling|hay bale|obstacle course|finish line|starting blocks|100m dash|400m dash|top speed|running at|running on|running through|running along|mid-flight|trail runner|running shoes|running shorts|running singlet|sports bra|jersey|cleats|track pants|workout gear|training gear|aerobics|cardio|at the gym|in the gym|gym session|working out|runner\b|jogger|jogging|yoga class|boxing|sparring|lifting weights|surf(?:ing|er)?|ski(?:ing|er)?|snowboard(?:ing|er)?)\b/i;

const EXPLICIT_COSTUME_HINT =
  /\b(?:wizard robe|knight armor|plate armor|chain mail|cosplay|costume party|in costume|wearing a costume|nun habit|monk robes|ballerina tutu|superhero suit|vampire cape|renaissance faire|halloween costume|elven gown|dwarven armor|circus ringmaster|magician cape|dressed as a wizard|dressed as a knight|dressed as a|dressed as the)\b/i;

/** Fantasy characters and settings warrant medieval/fantasy costume rolls—not modern street clothes. */
const FANTASY_WARDROBE_HINT =
  /\b(?:fantasy|high fantasy|dark fantasy|epic fantasy|mythic|legendary|enchanted|arcane|otherworldly|sorcer(?:y|er|ess)|spellcaster|warlock|wizard|mage|witch|necromancer|druid|cleric|priestess|oracle|paladin|knight|crusader|elf|elven|elvish|dwarven|dwarf|ranger|rogue|barbarian|adventurer|adventuring party|medieval|ancient armor|ornate armor|plate armor|chain mail|chainmail|leather armor|wizard robe|knight armor|cuirass|ritual garment|ritual robes|ritual garments|enchanted forest|floating citadel|ancient ruin|enchanted kingdom|fairy realm|celestial realm|underworld throne|runed armor|tabard|travel cloak|battlegear|war gear|hero gear|fantasy hero|fantasy knight|fantasy character|prophetic oracle|robed spellcaster|elven ranger|mythic beast|spellbound)\b/i;

/** Scene/setting cues for literal costumes—not art-direction words like fantasy or stage lighting. */
const SCENE_COSTUME_SETTING_HINT =
  /\b(?:cosplay|larp|renaissance faire|medieval faire|halloween costume|amusement park|circus tent|circus ring|on stage in costume|performance costume|theater costume|costume party|gothic lolita)\b/i;

const EXPLICIT_UNIFORM_HINT =
  /\b(?:in uniform|wearing uniform|service uniform|dress uniform|police uniform|military uniform|firefighter turnout|pilot uniform|flight attendant uniform|nurse scrubs|postal uniform|mail carrier uniform|bellhop uniform|referee uniform|umpire uniform|school uniform|chef whites|waiter (?:black tie )?service outfit|bartender vest|bar tender vest|sailor deck outfit|naval deck|barber smock|butcher apron|baker whites|barista apron|construction hi-vis|warehouse picker|mechanic coveralls|paramedic uniform|doctor white coat|police duty uniform)\b/i;

const WORK_SETTING_HINT =
  /\b(?:office|workshop|factory|kitchen|hospital|clinic|server room|warehouse|construction site|studio backlot|laboratory|courtroom|pharmacy|garage|mill|forge|bakery|butcher shop|newsroom|trading floor|barracks|police station|fire station|aircraft hangar|on duty|at work|work clothes)\b/i;

const WORK_PROFESSION_HINT =
  /\b(?:chef|nurse|doctor|mechanic|barista|butcher|baker|paramedic|pilot|flight attendant|barber|waiter|waitress|server|bartender|construction worker|warehouse worker|mail carrier|postal worker|firefighter|police officer|soldier|sailor|referee|umpire|bellhop)\b/i;

export type WorkProfession =
  | 'flight attendant'
  | 'construction worker'
  | 'warehouse worker'
  | 'mail carrier'
  | 'police officer'
  | 'paramedic'
  | 'firefighter'
  | 'bellhop'
  | 'barista'
  | 'mechanic'
  | 'bartender'
  | 'barber'
  | 'butcher'
  | 'baker'
  | 'referee'
  | 'soldier'
  | 'sailor'
  | 'pilot'
  | 'chef'
  | 'nurse'
  | 'doctor'
  | 'waiter';

const WORK_PROFESSION_PATTERNS: Array<{ key: WorkProfession; pattern: RegExp }> = [
  { key: 'flight attendant', pattern: /\bflight attendant\b/i },
  { key: 'construction worker', pattern: /\bconstruction worker\b/i },
  { key: 'warehouse worker', pattern: /\bwarehouse worker\b/i },
  { key: 'mail carrier', pattern: /\b(?:mail carrier|postal worker)\b/i },
  { key: 'police officer', pattern: /\b(?:police officer|police)\b/i },
  { key: 'paramedic', pattern: /\bparamedic\b/i },
  { key: 'firefighter', pattern: /\bfirefighter\b/i },
  { key: 'bellhop', pattern: /\bbellhop\b/i },
  { key: 'barista', pattern: /\bbarista\b/i },
  { key: 'mechanic', pattern: /\bmechanic\b/i },
  { key: 'bartender', pattern: /\bbartender\b/i },
  { key: 'barber', pattern: /\bbarber\b/i },
  { key: 'butcher', pattern: /\bbutcher\b/i },
  { key: 'baker', pattern: /\bbaker\b/i },
  { key: 'referee', pattern: /\b(?:referee|umpire)\b/i },
  { key: 'soldier', pattern: /\b(?:soldier|military)\b/i },
  { key: 'sailor', pattern: /\bsailor\b/i },
  { key: 'pilot', pattern: /\bpilot\b/i },
  { key: 'chef', pattern: /\bchef\b/i },
  { key: 'nurse', pattern: /\bnurse\b/i },
  { key: 'doctor', pattern: /\bdoctor\b/i },
  { key: 'waiter', pattern: /\b(?:waiter|waitress|server)\b/i },
];

/** Maps catalog label keywords for profession-aligned uniform picks. */
export const PROFESSION_UNIFORM_LABEL_HINTS: Record<WorkProfession, RegExp> = {
  chef: /\b(?:chef(?:'s)?\s*whites|chef\s*coat|chef\s*hat|chef\s*toque)\b/i,
  nurse: /\b(?:nurse scrubs|nurse uniform|scrubs set|medical scrubs|\bscrubs\b)\b/i,
  doctor: /\b(?:doctor white coat|physician coat|white coat|lab coat)\b/i,
  mechanic: /\b(?:mechanic coveralls?|shop coveralls?)\b/i,
  barista: /\b(?:barista apron|barista outfit|cafe apron)\b/i,
  butcher: /\b(?:butcher apron|butcher whites|butcher coat)\b/i,
  baker: /\b(?:baker whites|baker apron|pastry chef)\b/i,
  paramedic: /\b(?:paramedic|ems uniform|emt uniform)\b/i,
  pilot: /\b(?:pilot uniform|aviator uniform)\b/i,
  'flight attendant': /\b(?:flight attendant|airline cabin)\b/i,
  barber: /\b(?:barber smock|barber apron|barber coat)\b/i,
  waiter: /\b(?:waiter|waitress|black tie service|server vest|service waistcoat)\b/i,
  bartender: /\b(?:bar\s*tender|bartender vest|bar apron outfit)\b/i,
  'construction worker':
    /\b(?:construction hi-vis|construction coveralls?|builder hi-vis|hard hat outfit)\b/i,
  'warehouse worker': /\b(?:warehouse picker|warehouse vest|warehouse coveralls?)\b/i,
  'mail carrier': /\b(?:mail carrier|postal (?:carrier|worker|uniform)|letter carrier)\b/i,
  firefighter: /\b(?:firefighter|turnout)\b/i,
  'police officer': /\b(?:police duty|police uniform|duty uniform)\b/i,
  soldier: /\b(?:soldier|military fatigue|bdu|combat uniform)\b/i,
  sailor: /\b(?:sailor deck|naval deck|sailor uniform|submariner jumper)\b/i,
  referee: /\b(?:referee|umpire)\b/i,
  bellhop: /\bbellhop\b/i,
};

/**
 * High-signal kit accents appended when a profession uniform is rolled.
 * Keep short — these burn wardrobe budget.
 */
export const PROFESSION_KIT_EXTRAS: Record<WorkProfession, readonly string[]> = {
  chef: ['chef toque', 'kitchen clogs'],
  nurse: ['nursing clogs', 'badge reel'],
  doctor: ['stethoscope', 'ID badge'],
  mechanic: ['steel-toe boots', 'shop rag in pocket'],
  barista: ['cafe apron ties', 'slip-resistant shoes'],
  butcher: ['cut-resistant apron strap', 'non-slip clogs'],
  baker: ['flour-dusted apron', 'kitchen clogs'],
  paramedic: ['duty boots', 'radio mic'],
  pilot: ['epaulette shirt', 'pilot wings pin'],
  'flight attendant': ['scarf accent', 'cabin heels or flats'],
  barber: ['comb pocket', 'closed-toe shoes'],
  waiter: ['service napkin fold', 'polished dress shoes'],
  bartender: ['bar towel', 'non-slip shoes'],
  'construction worker': ['hard hat', 'steel-toe boots'],
  'warehouse worker': ['safety vest', 'steel-toe shoes'],
  'mail carrier': ['satchel strap', 'walking shoes'],
  firefighter: ['turnout boots', 'helmet'],
  'police officer': ['duty belt', 'patrol boots'],
  soldier: ['combat boots', 'unit patch'],
  sailor: ['deck shoes', 'watch cap'],
  referee: ['whistle', 'cleats or court shoes'],
  bellhop: ['pillbox hat', 'polished oxfords'],
};

/** Guaranteed profession summaries when catalog tags miss the job. */
export const PROFESSION_KIT_FALLBACKS: Record<WorkProfession, string> = {
  chef: 'chef whites set, chef toque, kitchen clogs',
  nurse: 'nurse scrubs set, nursing clogs, badge reel',
  doctor: 'doctor white coat over scrubs, stethoscope',
  mechanic: 'mechanic coveralls, steel-toe boots',
  barista: 'barista apron outfit, slip-resistant shoes',
  butcher: 'butcher apron over whites, non-slip clogs',
  baker: 'baker whites with flour-dusted apron, kitchen clogs',
  paramedic: 'paramedic uniform, duty boots, radio mic',
  pilot: 'pilot uniform with epaulettes, polished shoes',
  'flight attendant': 'flight attendant uniform, scarf accent',
  barber: 'barber smock, closed-toe shoes',
  waiter: 'waiter black tie service outfit, polished dress shoes',
  bartender: 'bartender vest look, bar towel, non-slip shoes',
  'construction worker': 'construction hi-vis outfit, hard hat, steel-toe boots',
  'warehouse worker': 'warehouse picker vest look, steel-toe shoes',
  'mail carrier': 'mail carrier uniform, satchel strap, walking shoes',
  firefighter: 'firefighter turnout gear, helmet, turnout boots',
  'police officer': 'police duty uniform, duty belt, patrol boots',
  soldier: 'military fatigue uniform, combat boots',
  sailor: 'sailor deck outfit, deck shoes',
  referee: 'referee striped jersey kit, whistle, court shoes',
  bellhop: 'bellhop uniform, pillbox hat, polished oxfords',
};

/** True when a catalog label reads as a named profession kit. */
export function labelMatchesProfessionUniform(label: string): boolean {
  const text = label.trim();
  if (!text) {
    return false;
  }
  return Object.values(PROFESSION_UNIFORM_LABEL_HINTS).some(hint => hint.test(text));
}

/** Enables lingerie/intimate catalog picks—not plain bedroom or hotel location alone. */
const INTIMATE_WARDROBE_HINT =
  /\b(?:boudoir|lingerie shoot|intimate apparel|intimate wear|lingerie set|getting dressed in lingerie|silk sheets and lingerie|morning after|vanity mirror and lingerie)\b/i;

export function hintsDescribeAthleticActivity(hints?: string): boolean {
  return ATHLETIC_ACTIVITY_HINT.test(hints?.trim() ?? '');
}

export function hintsExplicitCostume(hints?: string): boolean {
  return EXPLICIT_COSTUME_HINT.test(hints?.trim() ?? '');
}

export function hintsSceneSuggestsCostume(hints?: string): boolean {
  return SCENE_COSTUME_SETTING_HINT.test(hints?.trim() ?? '');
}

export function hintsFantasyWardrobe(hints?: string): boolean {
  return FANTASY_WARDROBE_HINT.test(hints?.trim() ?? '');
}

export function hintsExplicitUniform(hints?: string): boolean {
  return EXPLICIT_UNIFORM_HINT.test(hints?.trim() ?? '');
}

export function inferWorkProfession(hints?: string): WorkProfession | null {
  const value = hints?.trim() ?? '';
  if (!value) {
    return null;
  }

  for (const { key, pattern } of WORK_PROFESSION_PATTERNS) {
    if (pattern.test(value)) {
      return key;
    }
  }

  return null;
}

const SWIMWEAR_HINT =
  /\b(?:beach|pool|swim|swimming|swimwear|bikini|trunks|tropical|resort|yacht|hot tub|jacuzzi|snorkel|surfer|aquatic|lakeside|lake shore|board shorts|one-piece|sauna|onsen|hot spring|hot springs|bathhouse|steam room|water park|natatorium)\b/i;

export function hintsSwimwearOnlyMode(
  hints: string | undefined,
  contexts: readonly ClothingContextTag[]
): boolean {
  const corpus = hints?.trim() ?? '';
  if (!contexts.includes('swimwear')) {
    return false;
  }

  if (
    contexts.includes('cold') &&
    !contexts.includes('warm') &&
    !/\b(?:heated pool|indoor pool|hot tub|jacuzzi|sauna|onsen|hot spring|steam room)\b/i.test(
      corpus
    )
  ) {
    return false;
  }

  if (
    contexts.includes('formal') ||
    contexts.includes('evening') ||
    contexts.includes('formalwear')
  ) {
    return false;
  }

  if (hintsWorkWardrobeAllowed(corpus) && !SWIMWEAR_HINT.test(corpus)) {
    return false;
  }

  return (
    contexts.includes('beach') ||
    /\b(?:pool|swimming|swimwear|bikini|swim trunks|one-piece|hot tub|jacuzzi|poolside|swim briefs|board shorts|monokini|tankini|rash guard|sauna|onsen|hot spring|hot springs|bathhouse|steam room|water park|lakeside|lake shore|natatorium)\b/i.test(
      corpus
    )
  );
}

export function hintsWorkWardrobeAllowed(hints?: string): boolean {
  const value = hints?.trim() ?? '';
  if (!value) {
    return false;
  }
  if (WORK_SETTING_HINT.test(value)) {
    return true;
  }
  if (hintsExplicitUniform(value)) {
    return true;
  }
  return WORK_PROFESSION_HINT.test(value);
}

export function hintsIntimateWardrobeAllowed(hints?: string): boolean {
  const value = hints?.trim() ?? '';
  return (
    hintsExplicitUndergarment(value) ||
    INTIMATE_WARDROBE_HINT.test(value) ||
    /\b(?:sleepwear|nightgown|pajamas?|pyjamas?|bathrobe|dressing gown)\b/i.test(value)
  );
}

function resolveClothingContextConflicts(tags: Set<ClothingContextTag>, corpus: string): void {
  const athletic = hintsDescribeAthleticActivity(corpus) || tags.has('athletic');
  const fantasyWardrobe = hintsFantasyWardrobe(corpus);
  const explicitCostume =
    hintsExplicitCostume(corpus) || hintsSceneSuggestsCostume(corpus) || fantasyWardrobe;
  const workWardrobe = hintsWorkWardrobeAllowed(corpus);
  const intimateWardrobe = hintsIntimateWardrobeAllowed(corpus);

  if (fantasyWardrobe) {
    tags.add('costume');
    tags.delete('casual');
    tags.delete('urban');
  }

  if (!explicitCostume) {
    tags.delete('costume');
  }

  if (!workWardrobe) {
    tags.delete('work');
    tags.delete('uniform');
  }

  if (!intimateWardrobe) {
    tags.delete('intimate');
    tags.delete('sleepwear');
    tags.delete('underwear');
  }

  if (tags.has('swimwear') || tags.has('beach')) {
    tags.delete('formal');
    tags.delete('formalwear');
    tags.delete('evening');
    if (!explicitCostume) {
      tags.delete('costume');
    }
  }

  const coldCue =
    tags.has('cold') ||
    /\b(?:snow|frost|winter|blizzard|ice|freezing|subzero|arctic)\b/i.test(corpus);
  const warmCue =
    tags.has('warm') ||
    /\b(?:desert|tropical|sahara|midsummer|heat haze|arid|dry heat|humid summer)\b/i.test(corpus);

  if (coldCue && warmCue) {
    if (/\b(?:snow|frost|winter|blizzard|ice|freezing|subzero|arctic)\b/i.test(corpus)) {
      tags.delete('warm');
    } else if (/\b(?:desert|tropical|sahara|midsummer|arid|dry heat)\b/i.test(corpus)) {
      tags.delete('cold');
    }
  }

  const aestheticFormalOnly =
    (tags.has('formal') || tags.has('evening') || tags.has('formalwear')) &&
    !/\b(?:formal|gala|ballroom|black tie|cocktail|evening gown|opera|wedding reception|red carpet|premiere|skirt suit|formalwear|banquet)\b/i.test(
      corpus
    ) &&
    !/\b(?:ballroom|gala|black tie|wedding reception|red carpet|opera house)\b/i.test(corpus);

  if (
    aestheticFormalOnly &&
    (athletic ||
      tags.has('swimwear') ||
      tags.has('beach') ||
      tags.has('outdoor') ||
      tags.has('athletic'))
  ) {
    tags.delete('formal');
    tags.delete('formalwear');
    tags.delete('evening');
  }

  if (athletic) {
    tags.add('athletic');
    tags.delete('casual');
    if (!explicitCostume) {
      tags.delete('costume');
      tags.delete('formalwear');
      tags.delete('formal');
      tags.delete('evening');
    }
    if (!workWardrobe && !hintsExplicitUniform(corpus)) {
      tags.delete('uniform');
    }
  }

  if (tags.size === 0) {
    tags.add('casual');
  }
}

const CONTEXT_RULES: Array<{ tag: ClothingContextTag; pattern: RegExp }> = [
  {
    tag: 'athletic',
    pattern:
      /\b(?:jersey|running|jogger|yoga|gym|cycling|soccer|cleats|track pants|sweatpants|sport|ski jacket|climbing|trail runner|basketball|fencing|dance kit|triathlon|workout|compression|goalkeeper|baseball uniform|hockey|swimming|swimmer|swim meet|swim team|snorkel|mogul|parkour|sprinter|sprinting|somersault|athlete|marathon|hurdles|gymnast|competition|hay bale|obstacle course|finish line)\b/i,
  },
  {
    tag: 'formal',
    pattern:
      /\b(?:suit|tuxedo|gown|cocktail|blazer|oxford dress|brogues|monk strap|evening wear|wedding|pencil skirt|sport coat|tailcoat|formal wear|three-piece|evening gown|cocktail dress|skirt suit|twinset|formalwear|opera gloves|fascinator)\b/i,
  },
  {
    tag: 'evening',
    pattern:
      /\b(?:cocktail|evening gown|sequin|silk slip|stiletto|heels|gown|tuxedo|smoking jacket|ballroom|satin slip|pearl necklace|clutch|opera gloves|fascinator|minaudiere|stole|tiara)\b/i,
  },
  {
    tag: 'outdoor',
    pattern:
      /\b(?:hiking|trail|parka|puffer|anorak|fleece|gore-tex|windbreaker|cargo pants|work boots|mountain shell|rain slicker|field jacket|cagoule|poncho|bandana|sun hat|straw hat|backpack|climbing|camp|safari|gorpcore)\b/i,
  },
  {
    tag: 'cold',
    pattern:
      /\b(?:parka|puffer|wool|fleece|peacoat|duffle coat|shearling|down|beanie|scarf|mittens|balaclava|moon boots|overcoat|quilted|insulated|ear muffs|winter)\b/i,
  },
  {
    tag: 'warm',
    pattern:
      /\b(?:shorts|sandals|flip-flops|tank top|linen|hawaiian shirt|board shorts|muscle tank|racerback|espadrilles|sun hat|crop top|sleeveless|mesh jersey|sleeveless)\b/i,
  },
  {
    tag: 'wet',
    pattern:
      /\b(?:rain|slicker|wellington|rubber boots|gore-tex|poncho|oilskin|waterproof|hardshell|rain boots|cagoule|packable shell)\b/i,
  },
  {
    tag: 'work',
    pattern:
      /\b(?:coveralls|overalls|workbench|apron|hi-vis|safety vest|tool belt|warehouse|scrubs|lab coat|forge|paint-stained|work boots|steel-toe|utilitarian|chore coat|boiler suit|waiter|bartender|bar tender|sailor deck|barber smock|mail carrier|postal carrier|referee|umpire|chef whites|paramedic|flight attendant|bellhop|mechanic|construction hi-vis|warehouse picker)\b/i,
  },
  { tag: 'uniform', pattern: EXPLICIT_UNIFORM_HINT },
  { tag: 'costume', pattern: EXPLICIT_COSTUME_HINT },
  {
    tag: 'beach',
    pattern:
      /\b(?:board shorts|flip-flops|sarong|snorkel|bikini|swim trunks|rash guard|beach|shoreline|seaside|poolside|kaftan cover-up)\b/i,
  },
  {
    tag: 'swimwear',
    pattern:
      /\b(?:bikini|one-piece swimsuit|tankini|swim trunks|swim briefs|rash guard|cut-out swimsuit|bandeau bikini|high-waist bikini|sport swimsuit|swim set|monokini|swim top|swim bottom|competitive swim)\b/i,
  },
  { tag: 'intimate', pattern: EXPLICIT_UNDERGARMENT_HINT },
  {
    tag: 'hosiery',
    pattern:
      /\b(?:stockings|pantyhose|tights|fishnet|sheer hose|nylon hose|thigh-high stockings|stay-up stockings|back-seam stockings|seamed pantyhose|garter stockings|opaque tights|lace-top stockings)\b/i,
  },
  {
    tag: 'formalwear',
    pattern:
      /\b(?:skirt suit|pants suit|twinset|formal suit|evening suit|tweed suit|sheath dress and jacket|formal jumpsuit|ballroom-ready|chanel-style|dress suit|formal cape|ladies' tuxedo|morning dress suit)\b/i,
  },
  {
    tag: 'sleepwear',
    pattern:
      /\b(?:pajama|pyjama|nightgown|nightdress|sleep shirt|sleep set|bathrobe|dressing gown|peignoir|onesie pajama|footie pajama|lounge sleep)\b/i,
  },
  { tag: 'underwear', pattern: EXPLICIT_UNDERGARMENT_HINT },
  {
    tag: 'traditional',
    pattern:
      /\b(?:qipao|cheongsam|ao dai|abaya|kaftan dress|dashiki|boubou|djellaba|kebaya|huipil|hanfu|yukata|dirndl|lederhosen|kilt|serape|shalwar|gomesi|bunad|chapan)\b/i,
  },
  {
    tag: 'urban',
    pattern:
      /\b(?:streetwear|techwear|hoodie|denim jacket|leather jacket|bomber|sneakers|crossbody|snapback|cargo pants|oversized fit|y2k|grunge|cyberpunk|neon|metro|skateboard|parkour)\b/i,
  },
  {
    tag: 'casual',
    pattern:
      /\b(?:tee|t-shirt|henley|jeans|chinos|hoodie|sneakers|flannel|cardigan|loafers|casual|everyday|relaxed-fit)\b/i,
  },
];

const SCENE_CONTEXT_RULES: Array<{ tag: ClothingContextTag; pattern: RegExp }> = [
  {
    tag: 'cold',
    pattern:
      /\b(?:snow|frost|winter|arctic|glacier|blizzard|ice|polar|alpine|hoarfrost|siberian|tundra|iceland|antarctica|cold|freezing|subzero|mountain lodge|ski slope|frozen)\b/i,
  },
  {
    tag: 'warm',
    pattern:
      /\b(?:desert|heat haze|humid|summer|tropical|palm|sahara|savanna|oasis|jungle|rainforest|noon sun|midsummer|arid|dry heat|sauna|onsen|hot spring|steam room)\b/i,
  },
  {
    tag: 'wet',
    pattern:
      /\b(?:rain|monsoon|drizzle|downpour|puddle|storm|wet pavement|after a recent rain|spray|misty rain|showers)\b/i,
  },
  {
    tag: 'beach',
    pattern:
      /\b(?:beach|seaside|shoreline|oceanfront|boardwalk|tidal pool|sandy beach|rocky shore|surf break|beach club|poolside|black sand beach|tropical reef|overwater|harbor quay|snorkel(?:ing)?|lagoon)\b/i,
  },
  {
    tag: 'swimwear',
    pattern:
      /\b(?:pool|swimming|swim\b|aquatic|hot tub|jacuzzi|yacht deck|lakeside|lake shore|lake beach|water park|infinity pool|rooftop pool|spa pool|snorkeling|surfing|tropical resort|beach club pool|sauna|onsen|hot spring|hot springs|bathhouse|steam room|natatorium)\b/i,
  },
  {
    tag: 'outdoor',
    pattern:
      /\b(?:forest|mountain|trail|meadow|field|garden|canyon|lake|river|farm|barn|countryside|hiking|pine|valley|cliff|rooftop garden|park|orchard|vineyard|steppe|prairie|wetland|marsh|glade|fjord)\b/i,
  },
  {
    tag: 'formal',
    pattern:
      /\b(?:ballroom|gala|opera house|wedding|cathedral|courthouse|formal hall|banquet|black tie|reception|palais|palace hall|symphony|orchestra pit|red carpet|premiere)\b/i,
  },
  {
    tag: 'evening',
    pattern:
      /\b(?:midnight|dusk|twilight|blue hour|night|after hours|neon|jazz club|speakeasy|wine bar|cocktail bar|rooftop bar|night market|moonlit|starry|late evening|sunset|golden hour window)\b/i,
  },
  { tag: 'work', pattern: WORK_SETTING_HINT },
  {
    tag: 'urban',
    pattern:
      /\b(?:alley|street|city|downtown|metro|subway|skyline|urban|neon|cyberpunk|penthouse|loft|brick facade|shophouse|bodega|parking garage|overpass)\b/i,
  },
  {
    tag: 'athletic',
    pattern:
      /\b(?:gym|dojo|stadium|arena|court|track|rink|pool deck|skate park|climbing gym|yoga studio|boxing gym|ballet studio|soccer|baseball field|ferry deck running|fitness center|weight room)\b/i,
  },
  {
    tag: 'uniform',
    pattern:
      /\b(?:barracks|prison|dungeon|military|naval|submarine|aircraft hangar|police station|fire station|hospital ward|monastery|convent|academy|school campus|parade ground)\b/i,
  },
  { tag: 'costume', pattern: SCENE_COSTUME_SETTING_HINT },
];

const PRESET_ATMOSPHERE_CONTEXT: Record<string, ClothingContextTag[]> = {
  'light-rain': ['wet', 'outdoor'],
  'fog-haze': ['outdoor', 'urban'],
  'dust-particles': ['outdoor', 'warm'],
  'falling-snow': ['cold', 'outdoor'],
};

const PRESET_AESTHETIC_CONTEXT: Record<string, ClothingContextTag[]> = {
  cyberpunk: ['urban', 'evening'],
  'noir-dramatic': ['formal', 'evening', 'urban'],
  'cottage-soft': ['casual', 'outdoor'],
  'nineties-film': ['casual', 'urban'],
  'seventies-warm': ['casual', 'warm'],
};

export function normalizeClothingContextTags(
  raw: string[] | readonly string[] | undefined
): ClothingContextTag[] {
  if (!raw?.length) {
    return [];
  }

  const allowed = new Set<string>(CLOTHING_CONTEXT_TAGS);
  const tags: ClothingContextTag[] = [];

  for (const tag of raw) {
    if (allowed.has(tag)) {
      tags.push(tag as ClothingContextTag);
    }
  }

  return [...new Set(tags)];
}

export function inferClothingGender(text: string): ClothingGenderTag {
  const value = text.toLowerCase();
  let womenScore = 0;
  let menScore = 0;

  if (WOMEN_GARMENT.test(value)) womenScore += 3;
  if (WOMEN_LEAN.test(value)) womenScore += 2;
  if (MEN_GARMENT.test(value)) menScore += 3;
  if (MEN_LEAN.test(value)) menScore += 2;

  if (/\b(?:ball gown|prom dress|bridesmaid|maternity dress)\b/i.test(value)) womenScore += 4;
  if (/\b(?:tuxedo|cummerbund|dress shirt and tie)\b/i.test(value)) menScore += 2;

  if (womenScore >= menScore + 2) return 'women';
  if (menScore >= womenScore + 2) return 'men';
  return 'neutral';
}

export function inferClothingContexts(text: string): ClothingContextTag[] {
  const value = text.toLowerCase();
  const tags = new Set<ClothingContextTag>();

  if (hintsExplicitUndergarment(value)) {
    tags.add('intimate');
    tags.add('underwear');
  }

  for (const rule of CONTEXT_RULES) {
    if (rule.pattern.test(value)) {
      tags.add(rule.tag);
    }
  }

  if (tags.size === 0) {
    tags.add('casual');
  } else if (
    tags.has('swimwear') ||
    tags.has('intimate') ||
    tags.has('hosiery') ||
    tags.has('formalwear') ||
    tags.has('sleepwear') ||
    tags.has('underwear') ||
    tags.has('uniform') ||
    tags.has('costume')
  ) {
    tags.delete('casual');
  }

  resolveClothingContextConflicts(tags, value);

  return [...tags];
}

export function inferSceneClothingContexts(input: {
  sceneLocation?: string | null;
  environmentSeed?: string;
  hints?: string;
  presetOptions?: ClothingScenePresetHints;
}): ClothingContextTag[] {
  const corpus = [input.sceneLocation, input.environmentSeed, input.hints]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const tags = new Set<ClothingContextTag>();

  if (hintsAllowSwimwearCatalog(input.hints)) {
    tags.add('swimwear');
  }
  if (hintsIntimateWardrobeAllowed(corpus)) {
    tags.add('intimate');
  }
  if (hintsAllowFormalwearCatalog(input.hints)) {
    tags.add('formalwear');
    tags.add('formal');
  }
  if (hintsAllowHosieryCatalog(input.hints)) {
    tags.add('hosiery');
  }

  for (const rule of SCENE_CONTEXT_RULES) {
    if (rule.pattern.test(corpus)) {
      tags.add(rule.tag);
    }
  }

  const atmosphere = input.presetOptions?.atmosphere;
  if (atmosphere && PRESET_ATMOSPHERE_CONTEXT[atmosphere]) {
    for (const tag of PRESET_ATMOSPHERE_CONTEXT[atmosphere]!) {
      tags.add(tag);
    }
  }

  const aesthetic = input.presetOptions?.aesthetic;
  if (aesthetic && PRESET_AESTHETIC_CONTEXT[aesthetic]) {
    for (const tag of PRESET_AESTHETIC_CONTEXT[aesthetic]!) {
      tags.add(tag);
    }
  }

  if (hintsExplicitUndergarment(input.hints)) {
    tags.add('underwear');
  }

  if (
    tags.has('swimwear') ||
    /\b(?:pool|swimming|swimwear|jacuzzi|hot tub|poolside|infinity pool|rooftop pool|beach club pool|sauna|onsen|hot spring|water park|natatorium)\b/i.test(
      corpus
    )
  ) {
    tags.add('swimwear');
  }

  if (tags.size === 0) {
    tags.add('casual');
  }

  resolveClothingContextConflicts(tags, corpus);

  return [...tags];
}

const CLOTHING_HINT =
  /\b(?:wearing|dressed|outfit|wardrobe|shirt|blouse|tee|t-shirt|top|jacket|coat|hoodie|sweater|dress|skirt|pants|jeans|shorts|boots|sneakers|shoes|heels|sandals|suit|uniform|apron|overalls|vest|blazer|cardigan|leggings|romper|jumpsuit|kimono|robe|armor|gown|tuxedo|scrubs|bikini|swimsuit|swim trunks|stockings|pantyhose|tights|fascinator|opera gloves|twinset|skirt suit)\b/i;

const EXPLICIT_PRIMARY_GARMENT_PHRASE =
  /\b(?:bikini|one-piece swimsuit|tankini|swim trunks|swim briefs|evening gown|cocktail dress|wedding dress|ball gown|jumpsuit|romper|cheongsam|qipao|tuxedo|three-piece suit|chef whites|nurse scrubs|lab coat|ballerina tutu|wizard robe|knight armor|plate armor|monokini|rash guard|board shorts|high-waist bikini|lingerie set|pajama set|nightgown|dress suit|skirt suit|coveralls|mechanic coveralls|firefighter turnout|police duty uniform|pilot uniform|waiter black tie|summer dress|maxi dress|mini dress|sheath dress|denim jacket|leather jacket|track suit|running shorts)\b/i;

const EXPLICIT_WEARING_PHRASE =
  /\b(?:wearing|dressed in|wears a|wears an|outfit is|outfit:)\s+[^,.\n;]{4,}/i;

/** Generic dress phrasing such as "woman in a dress" or "in mini dress". */
const EXPLICIT_DRESS_PHRASE =
  /\b(?:in|wearing|wears)\s+(?:(?:a|an|her|his|their)\s+)?(?:\w+\s+){0,4}dress\b/i;

const DRESS_STYLE_HINTS: Array<{ phrase: RegExp; label: RegExp }> = [
  { phrase: /\bmini dress\b/i, label: /\b(?:mini|cropped)\b(?!.*\bslip\s+dress\b).*\bdress\b/i },
  { phrase: /\bmaxi dress\b/i, label: /\bmaxi\b.*\bdress\b/i },
  { phrase: /\bslip dress\b/i, label: /\bslip dress\b/i },
  { phrase: /\bwrap dress\b/i, label: /\bwrap dress\b/i },
  { phrase: /\bshirt dress\b/i, label: /\bshirt dress\b/i },
  { phrase: /\bsweater dress\b/i, label: /\bsweater dress\b/i },
  { phrase: /\bcocktail dress\b/i, label: /\bcocktail dress\b/i },
  { phrase: /\bsheath dress\b/i, label: /\bsheath dress\b/i },
  { phrase: /\bsummer dress\b/i, label: /\bsummer dress\b/i },
  { phrase: /\bevening gown\b/i, label: /\b(?:evening gown|ballroom dance dress|ball gown)\b/i },
];

/**
 * Named separates / outer layers in the brief — used for lock + catalog label scoring.
 * Order matters: more specific phrases first.
 */
export type BriefGarmentHint = {
  phrase: RegExp;
  brief: string;
  /** Catalog categories that can satisfy this garment. */
  categories: readonly ('top' | 'bottom' | 'outerwear' | 'outfit' | 'footwear')[];
  label: RegExp;
};

const COLOR_TOKEN =
  '(?:brick[- ]?red|burnt orange|powder blue|off[- ]?white|heather gray|sunflower yellow|forest green|sky blue|light blue|dark blue|navy|black|white|red|crimson|scarlet|burgundy|wine|rust|coral|salmon|pink|rose|lilac|purple|violet|blue|teal|aqua|mint|green|olive|moss|pine|yellow|gold|mustard|orange|terracotta|brown|tan|beige|khaki|sand|ivory|cream|gray|grey|charcoal|silver|bronze|copper)';

const SEPARATE_GARMENT_HINTS: BriefGarmentHint[] = [
  {
    phrase: new RegExp(`\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:crop(?:ped)?\\s+top|crop\\s+tee)\\b`, 'i'),
    brief: 'crop top',
    categories: ['top'],
    label: /\b(?:crop(?:ped)?\s+top|crop\s+tee)\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:graphic\\s+tee|band\\s+tee|v-neck\\s+tee|crewneck\\s+tee|long-sleeve\\s+tee|t-shirt|tee)\\b`,
      'i'
    ),
    brief: 'tee',
    categories: ['top'],
    label:
      /\b(?:graphic\s+tee|band\s+tee|v-neck\s+tee|crewneck\s+tee|long-sleeve\s+tee|t-shirt|tee)\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:blouse|peasant blouse|wrap blouse|off-shoulder blouse)\\b`,
      'i'
    ),
    brief: 'blouse',
    categories: ['top'],
    label: /\bblouse\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:hoodie|pullover hoodie|zip hoodie|cropped hoodie)\\b`,
      'i'
    ),
    brief: 'hoodie',
    categories: ['top', 'outerwear'],
    label: /\bhoodie\b/i,
  },
  {
    phrase: new RegExp(`\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:sweater|cardigan|jumper)\\b`, 'i'),
    brief: 'sweater',
    categories: ['top'],
    label: /\b(?:sweater|cardigan|jumper)\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:denim jacket|leather jacket|bomber jacket|field jacket|jacket|coat|peacoat|trench)\\b`,
      'i'
    ),
    brief: 'jacket',
    categories: ['outerwear', 'top'],
    label: /\b(?:jacket|coat|peacoat|trench|shell)\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:shirt|button[- ]?down|western snap shirt)\\b`,
      'i'
    ),
    brief: 'shirt',
    categories: ['top'],
    label: /\b(?:shirt|button[- ]?down)\b/i,
  },
  {
    phrase: new RegExp(`\\b(?:(?:a|an|her|his|their)\\s+)?(?:${COLOR_TOKEN}\\s+){1,2}top\\b`, 'i'),
    brief: 'top',
    categories: ['top'],
    label: /\b(?:top|tee|blouse|shirt|hoodie|sweater)\b/i,
  },
  {
    phrase: new RegExp(`\\b(?:(?:a|an|her|his|their)\\s+)(?:${COLOR_TOKEN}\\s+){0,2}top\\b`, 'i'),
    brief: 'top',
    categories: ['top'],
    label: /\b(?:top|tee|blouse|shirt|hoodie|sweater)\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:straight-leg jeans|slim jeans|baggy jeans|wide-leg jeans|cargo jeans|jeans)\\b`,
      'i'
    ),
    brief: 'jeans',
    categories: ['bottom'],
    label: /\bjeans\b/i,
  },
  {
    phrase: new RegExp(`\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:trousers|slacks|chinos|pants)\\b`, 'i'),
    brief: 'pants',
    categories: ['bottom'],
    label: /\b(?:trousers|slacks|chinos|pants)\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:shorts|cargo shorts|denim shorts)\\b`,
      'i'
    ),
    brief: 'shorts',
    categories: ['bottom'],
    label: /\bshorts\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:skirt|mini skirt|maxi skirt|pencil skirt|a-line skirt)\\b`,
      'i'
    ),
    brief: 'skirt',
    categories: ['bottom'],
    label: /\bskirt\b/i,
  },
  {
    phrase: new RegExp(
      `\\b(?:${COLOR_TOKEN}\\s+){0,2}(?:leggings|yoga pants|joggers|sweatpants)\\b`,
      'i'
    ),
    brief: 'leggings',
    categories: ['bottom'],
    label: /\b(?:leggings|yoga pants|joggers|sweatpants)\b/i,
  },
  {
    phrase: /\b(?:sneakers|trainers|running shoes|athletic shoes)\b/i,
    brief: 'sneakers',
    categories: ['footwear'],
    label: /\b(?:sneaker|trainer|running shoe|athletic shoe)\b/i,
  },
  {
    phrase: /\b(?:boots|ankle boots|combat boots|chelsea boots)\b/i,
    brief: 'boots',
    categories: ['footwear'],
    label: /\bboots?\b/i,
  },
];

/** Structured “in/wearing …” outfit clauses — stronger than lone garment tokens. */
const EXPLICIT_STRUCTURED_OUTFIT_CLAUSE =
  /\b(?:in|wearing|wears|dressed in)\s+(?:(?:a|an|her|his|their)\s+)?(?:[\w''-]+\s+){0,6}(?:top|shirt|blouse|tee|t-shirt|hoodie|sweater|jacket|coat|dress|skirt|jeans|pants|trousers|shorts|romper|jumpsuit|suit|gown|bikini|swimsuit|leggings|joggers)\b/i;

const FOOTWEAR_STYLE_HINTS: Array<{ phrase: RegExp; label: RegExp; brief: string }> = [
  {
    phrase: /\b(?:tall heels|high heels|stilettos?)\b/i,
    label: /\b(?:stiletto|platform heel|high heel)\b/i,
    brief: 'tall heels',
  },
  {
    phrase: /\bblock heels?\b/i,
    label: /\bblock heel\b/i,
    brief: 'block heels',
  },
  {
    phrase: /\bkitten heels?\b/i,
    label: /\bkitten heel\b/i,
    brief: 'kitten heels',
  },
  {
    phrase: /\b(?:heeled sandals|strappy heels)\b/i,
    label: /\b(?:heeled sandal|strappy heel|heel sandal)\b/i,
    brief: 'heeled sandals',
  },
  {
    phrase: /\b(?:pumps|court shoes)\b/i,
    label: /\b(?:pump|court shoe)\b/i,
    brief: 'heels',
  },
  {
    phrase: /\bheels\b/i,
    label: /\b(?:heel|pump|stiletto)\b/i,
    brief: 'heels',
  },
];

export function inferDressLabelFilter(hints?: string): RegExp | null {
  const value = hints?.trim() ?? '';
  if (!value) {
    return null;
  }

  for (const { phrase, label } of DRESS_STYLE_HINTS) {
    if (phrase.test(value)) {
      return label;
    }
  }

  if (hintsSpecifyDress(value)) {
    return /\bdress\b/i;
  }

  return null;
}

export function inferFootwearLabelFilter(hints?: string): RegExp | null {
  const value = hints?.trim() ?? '';
  if (!value) {
    return null;
  }

  for (const { phrase, label } of FOOTWEAR_STYLE_HINTS) {
    if (phrase.test(value)) {
      return label;
    }
  }

  return null;
}

export function hintsSpecifyFootwear(hints?: string): boolean {
  return inferFootwearLabelFilter(hints) !== null;
}

export function extractBriefGarmentPhrases(hints?: string): string[] {
  const value = hints?.trim() ?? '';
  if (!value) {
    return [];
  }

  const phrases: string[] = [];
  for (const { phrase } of DRESS_STYLE_HINTS) {
    const match = value.match(phrase);
    if (match?.[0]) {
      phrases.push(match[0].toLowerCase());
    }
  }

  if (phrases.length === 0 && EXPLICIT_DRESS_PHRASE.test(value)) {
    phrases.push('dress');
  }

  for (const { phrase, brief } of FOOTWEAR_STYLE_HINTS) {
    if (phrase.test(value) && !phrases.includes(brief)) {
      phrases.push(brief);
      break;
    }
  }

  for (const hint of SEPARATE_GARMENT_HINTS) {
    const match = value.match(hint.phrase);
    if (!match?.[0]) {
      continue;
    }
    const matched = match[0].toLowerCase().replace(/\s+/g, ' ').trim();
    if (!phrases.includes(matched) && !phrases.includes(hint.brief)) {
      phrases.push(matched);
    }
  }

  return phrases;
}

/** Separates named in the brief with catalog label filters (tops, jeans, jackets…). */
export function inferSeparateGarmentHints(hints?: string): BriefGarmentHint[] {
  const value = hints?.trim() ?? '';
  if (!value) {
    return [];
  }

  const matched: BriefGarmentHint[] = [];
  const seenBriefs = new Set<string>();
  for (const hint of SEPARATE_GARMENT_HINTS) {
    if (!hint.phrase.test(value)) {
      continue;
    }
    if (seenBriefs.has(hint.brief)) {
      continue;
    }
    seenBriefs.add(hint.brief);
    matched.push(hint);
  }
  return matched;
}

const COLOR_SYNONYMS: Array<{ hint: RegExp; label: RegExp }> = [
  {
    hint: /\b(?:red|crimson|scarlet|brick[- ]?red)\b/i,
    label: /\b(?:red|crimson|scarlet|brick[- ]?red|burgundy|wine|rust|coral)\b/i,
  },
  {
    hint: /\b(?:blue|navy|indigo|cobalt|teal|aqua|powder blue|sky blue)\b/i,
    label: /\b(?:blue|navy|indigo|cobalt|teal|aqua|powder blue|sky blue)\b/i,
  },
  {
    hint: /\b(?:black|obsidian|charcoal|ink)\b/i,
    label: /\b(?:black|obsidian|charcoal|ink|gunmetal)\b/i,
  },
  {
    hint: /\b(?:white|ivory|cream|off[- ]?white|snow)\b/i,
    label: /\b(?:white|ivory|cream|off[- ]?white|snow)\b/i,
  },
  {
    hint: /\b(?:green|olive|moss|pine|mint|forest green)\b/i,
    label: /\b(?:green|olive|moss|pine|mint|forest green)\b/i,
  },
  {
    hint: /\b(?:yellow|gold|mustard|sunflower)\b/i,
    label: /\b(?:yellow|gold|mustard|sunflower)\b/i,
  },
  {
    hint: /\b(?:pink|rose|lilac|fuchsia|magenta)\b/i,
    label: /\b(?:pink|rose|lilac|fuchsia|magenta|coral)\b/i,
  },
  {
    hint: /\b(?:brown|tan|beige|khaki|sand|terracotta|bronze)\b/i,
    label: /\b(?:brown|tan|beige|khaki|sand|terracotta|bronze|sepia|clay)\b/i,
  },
  {
    hint: /\b(?:gray|grey|silver|heather|ash|steel)\b/i,
    label: /\b(?:gray|grey|silver|heather|ash|steel)\b/i,
  },
  {
    hint: /\b(?:orange|rust|coral|salmon|burnt orange)\b/i,
    label: /\b(?:orange|rust|coral|salmon|burnt orange|terracotta)\b/i,
  },
];

/**
 * Score how well a catalog label matches garments named in the user brief.
 * Strong matches beat scene-context ties so rolled pieces follow the submission.
 */
const MATERIAL_HINT_TOKENS = [
  /\b(?:denim|leather|suede|silk|satin|linen|cotton|wool|cashmere|mesh|lace|velvet|nylon|gore-tex|neoprene|tweed|flannel|jersey|canvas)\b/i,
];

const FIT_HINT_TOKENS = [
  /\b(?:slim|relaxed|oversized|cropped|tailored|high-waist(?:ed)?|low-rise|wide-leg|tapered|fitted|boxy)\b/i,
];

/**
 * Score how well a catalog label matches garments named in the user brief.
 * Strong matches beat scene-context ties so rolled pieces follow the submission.
 */
export function scoreClothingLabelAgainstHints(label: string, hintCorpus?: string): number {
  const corpus = hintCorpus?.trim() ?? '';
  if (!corpus || !label.trim()) {
    return 0;
  }

  let score = 0;
  const separates = inferSeparateGarmentHints(corpus);
  for (const hint of separates) {
    if (hint.label.test(label)) {
      score += 10;
      const phraseMatch = corpus.match(hint.phrase);
      const phrase = phraseMatch?.[0] ?? hint.brief;
      for (const { hint: colorHint, label: colorLabel } of COLOR_SYNONYMS) {
        if (colorHint.test(phrase) && colorLabel.test(label)) {
          score += 8;
          break;
        }
      }
      // Material / fabric cues in the brief should lock matching catalog rolls.
      for (const material of MATERIAL_HINT_TOKENS) {
        if (material.test(phrase) && material.test(label)) {
          score += 5;
          break;
        }
      }
      // Silhouette / fit language (cropped, high-waist, oversized…).
      for (const fit of FIT_HINT_TOKENS) {
        if (fit.test(phrase) && fit.test(label)) {
          score += 4;
          break;
        }
      }
    }
  }

  for (const { phrase, label: dressLabel } of DRESS_STYLE_HINTS) {
    if (phrase.test(corpus) && dressLabel.test(label)) {
      score += 12;
    }
  }

  for (const { phrase, label: shoeLabel } of FOOTWEAR_STYLE_HINTS) {
    if (phrase.test(corpus) && shoeLabel.test(label)) {
      score += 10;
      break;
    }
  }

  // Whole-corpus color match even without a structured separate phrase.
  for (const { hint: colorHint, label: colorLabel } of COLOR_SYNONYMS) {
    if (colorHint.test(corpus) && colorLabel.test(label)) {
      score += 2;
      break;
    }
  }

  return score;
}

export function hintsSpecifyDress(hints?: string): boolean {
  const value = hints?.trim() ?? '';
  if (!value) {
    return false;
  }

  return (
    EXPLICIT_DRESS_PHRASE.test(value) ||
    /\b(?:summer dress|maxi dress|mini dress|sheath dress|cocktail dress|evening gown|wrap dress|slip dress|shirt dress|sweater dress)\b/i.test(
      value
    )
  );
}

/** User wants nudity or no clothing — skip catalog wardrobe rolls and do not invent outfits. */
const NO_CLOTHING_HINT =
  /\b(?:naked|nudity|unclothed|undressed|disrobed|topless|bottomless|au naturel|without clothes|no clothes|no clothing|not wearing(?: anything)?|wearing nothing|fully bare|bare body|bare skin|artistic nude|nude figure|nude portrait|nude study|nude model|in the nude|fully nude|completely nude)\b/i;

/** Fashion/color "nude" (hosiery, heels, makeup) — not artistic nudity. */
const NUDE_COLOR_OR_FASHION =
  /\bnude\b(?:\s+(?:sheer|lipstick|heels|pumps|hosiery|pantyhose|stockings|tights|beige|blush|shade|tone|mesh|silk|nylon|opaque|suede|velvet|tulle|lace|cashmere|flannel|denim|canvas|alpaca|poplin|chiffon|felt|hemp|wool|knit|tweed|fleece|linen|cotton|leather|satin|color|colour|colorway|palette|undertone|complexion|foundation|concealer|powder|lip|nail|polish|beige|sand|taupe|camel|buff|ecru|ivory|cream|peach|rose|pink|mauve|neutral|skin-tone|skintone))\b/i;

export function hintsImplyNoClothing(hints?: string): boolean {
  const value = hints?.trim() ?? '';
  if (!value) {
    return false;
  }
  if (NO_CLOTHING_HINT.test(value)) {
    return true;
  }
  if (/\bnude\b/i.test(value) && !NUDE_COLOR_OR_FASHION.test(value)) {
    return true;
  }
  return false;
}

export function buildNoClothingUserDirective(): string {
  return [
    'NO WARDROBE (mandatory):',
    'The user requested nudity or no clothing—do not add garments, fabric layers, outfits, or wardrobe descriptions.',
    'Describe skin, posture, and anatomy naturally without inventing clothing.',
    'Do not add catalog wardrobe rolls or random outfit ingredients.',
  ].join(' ');
}

export function hintsMentionClothing(hints?: string): boolean {
  const value = hints?.trim() ?? '';
  return CLOTHING_HINT.test(value) || hintsExplicitUndergarment(value);
}

/** Input names a specific core garment—random primary layers must not override it. */
export function hintsLockPrimaryGarment(hints?: string): boolean {
  const value = hints?.trim() ?? '';
  if (!value) {
    return false;
  }
  if (hintsExplicitUndergarment(value)) {
    return true;
  }
  if (EXPLICIT_WEARING_PHRASE.test(value)) {
    return true;
  }
  if (EXPLICIT_STRUCTURED_OUTFIT_CLAUSE.test(value)) {
    return true;
  }
  if (hintsSpecifyDress(value)) {
    return true;
  }
  if (hintsSpecifyFootwear(value)) {
    return true;
  }
  return EXPLICIT_PRIMARY_GARMENT_PHRASE.test(value);
}

/** Input specifies underwear—do not add random footwear, outer layers, or accessories. */
export function hintsSkipWardrobeRolls(hints?: string): boolean {
  return hintsExplicitUndergarment(hints) || hintsImplyNoClothing(hints);
}

export type ClothingPickFilters = {
  gender: 'women' | 'men' | 'any';
  contexts: ClothingContextTag[];
  excludeIds?: readonly string[];
  lockPrimaryGarment?: boolean;
  skipWardrobeRolls?: boolean;
  athleticActivity?: boolean;
  athleticSport?: AthleticSport | null;
  intimateWardrobe?: boolean;
  workWardrobe?: boolean;
  workProfession?: WorkProfession | null;
  swimwearOnly?: boolean;
  explicitCostume?: boolean;
  fantasyWardrobe?: boolean;
  hintCorpus?: string;
  avoidedTokens?: readonly string[];
};

/** Street separates that conflict with swim/sauna attire unless the brief insists. */
const STREETWEAR_BRIEF_TYPES = new Set([
  'jeans',
  'hoodie',
  'jacket',
  'pants',
  'skirt',
  'sweater',
  'shirt',
  'top',
  'tee',
  'blouse',
  'leggings',
  'shorts',
  'sneakers',
  'boots',
]);

const SWIM_COMPATIBLE_BRIEF =
  /\b(?:bikini|swimsuit|swimwear|swim trunks|swim briefs|rash guard|board shorts|one-piece|tankini|monokini|towel|robe|bathrobe)\b/i;

const CLOTHED_SWIM_VENUE_INTENT =
  /\b(?:fully clothed|street clothes|clothed poolside|jeans poolside|wearing jeans (?:at|by|near) (?:the )?(?:pool|beach|sauna)|poolside in jeans|beach in jeans)\b/i;

const SPORT_COMPATIBLE_BRIEF =
  /\b(?:jersey|kit|singlet|bib shorts|cycling|running shorts|track pants|sports bra|leotard|judogi|gi\b|cleats|running shoes|cycling shoes|helmet)\b/i;

export function briefNamesStreetwearSeparates(hints?: string): boolean {
  return inferSeparateGarmentHints(hints).some(hint => STREETWEAR_BRIEF_TYPES.has(hint.brief));
}

export function briefNamesSwimCompatibleGarments(hints?: string): boolean {
  const value = hints?.trim() ?? '';
  if (!value) {
    return false;
  }
  if (SWIM_COMPATIBLE_BRIEF.test(value)) {
    return true;
  }
  return extractBriefGarmentPhrases(value).some(phrase => SWIM_COMPATIBLE_BRIEF.test(phrase));
}

/**
 * Strong swim/sauna/sport scenes should keep scene attire when the brief only
 * names conflicting street separates (unless the user explicitly wants clothes on).
 */
export function sceneAttireShouldOverrideBrief(input: {
  hints?: string;
  contexts: readonly ClothingContextTag[];
  athleticSport?: AthleticSport | null;
  athleticActivity?: boolean;
  swimwearOnlyCandidate?: boolean;
}): boolean {
  const hints = input.hints?.trim() ?? '';
  if (!hints || !briefNamesStreetwearSeparates(hints)) {
    return false;
  }

  if (CLOTHED_SWIM_VENUE_INTENT.test(hints) || briefNamesSwimCompatibleGarments(hints)) {
    return false;
  }

  if (input.swimwearOnlyCandidate || input.contexts.includes('swimwear')) {
    return true;
  }

  if (input.athleticSport) {
    return !SPORT_COMPATIBLE_BRIEF.test(hints);
  }

  if (input.athleticActivity && input.contexts.includes('athletic')) {
    return !SPORT_COMPATIBLE_BRIEF.test(hints);
  }

  return false;
}

export function buildClothingPickFilters(input: {
  gender?: SubjectGender;
  sceneLocation?: string | null;
  environmentSeed?: string;
  hints?: string;
  presetOptions?: ClothingScenePresetHints;
  excludeIds?: readonly string[];
  fantasyWardrobe?: boolean;
  avoidedTokens?: readonly string[];
}): ClothingPickFilters {
  const hintCorpus = [input.hints, input.environmentSeed, input.sceneLocation]
    .filter(Boolean)
    .join(' ');
  const resolvedGender =
    input.gender === 'women' || input.gender === 'men'
      ? input.gender
      : (inferSubjectGenderFromHints(hintCorpus) ?? input.gender);
  const fantasyWardrobe = input.fantasyWardrobe === true || hintsFantasyWardrobe(hintCorpus);
  let contexts = inferSceneClothingContexts({
    sceneLocation: input.sceneLocation,
    environmentSeed: input.environmentSeed,
    hints: input.hints,
    presetOptions: input.presetOptions,
  });
  if (fantasyWardrobe) {
    if (!contexts.includes('costume')) {
      contexts = [...contexts, 'costume'];
    }
    contexts = contexts.filter(tag => tag !== 'casual' && tag !== 'urban');
  }

  const athleticActivity =
    hintsDescribeAthleticActivity(hintCorpus) || contexts.includes('athletic');
  const athleticSport = inferAthleticSport(hintCorpus);
  const workProfession = inferWorkProfession(hintCorpus);
  // Setting-only "office" keeps work in contexts for scoring, but does not enable
  // random service-uniform rolls without a profession or explicit uniform cue.
  const workWardrobe = Boolean(workProfession) || hintsExplicitUniform(hintCorpus);

  if (!workWardrobe) {
    contexts = contexts.filter(tag => tag !== 'work' && tag !== 'uniform');
  }

  const swimwearOnlyCandidate = hintsSwimwearOnlyMode(hintCorpus, contexts);
  const skipRolls = hintsSkipWardrobeRolls(input.hints);
  const wantsLock = hintsLockPrimaryGarment(input.hints) && !skipRolls;
  const overrideBrief = sceneAttireShouldOverrideBrief({
    hints: input.hints,
    contexts,
    athleticSport,
    athleticActivity,
    swimwearOnlyCandidate,
  });
  const lockPrimaryGarment = wantsLock && !overrideBrief;

  return {
    gender: subjectGenderToClothingGender(resolvedGender),
    contexts,
    excludeIds: input.excludeIds,
    athleticActivity,
    athleticSport,
    intimateWardrobe: hintsIntimateWardrobeAllowed(hintCorpus),
    workWardrobe,
    workProfession,
    swimwearOnly: !skipRolls && !lockPrimaryGarment && swimwearOnlyCandidate,
    explicitCostume:
      hintsExplicitCostume(hintCorpus) || hintsSceneSuggestsCostume(hintCorpus) || fantasyWardrobe,
    fantasyWardrobe,
    skipWardrobeRolls: skipRolls,
    lockPrimaryGarment,
    hintCorpus: hintCorpus || undefined,
    avoidedTokens: input.avoidedTokens,
  };
}

export function clothingMatchesGender(
  entryGender: ClothingGenderTag,
  filterGender: 'women' | 'men' | 'any'
): boolean {
  if (filterGender === 'any') {
    return true;
  }

  if (entryGender === 'neutral') {
    return true;
  }

  return entryGender === filterGender;
}

const GENDERED_PICK_CATEGORIES = new Set<string>([
  'swimwear',
  'intimate',
  'hosiery',
  'formalwear',
  'sleepwear',
  'underwear',
]);

/** Random picks with unknown subject gender skip gendered restricted garments. */
export function clothingMatchesGenderForPick(
  entryGender: ClothingGenderTag,
  entryContexts: readonly ClothingContextTag[],
  entryCategory: string | undefined,
  filterGender: 'women' | 'men' | 'any'
): boolean {
  if (filterGender !== 'any') {
    return clothingMatchesGender(entryGender, filterGender);
  }

  const restricted =
    entryHasRestrictedContext(entryContexts) ||
    (entryCategory ? GENDERED_PICK_CATEGORIES.has(entryCategory) : false);

  if (restricted && entryGender !== 'neutral') {
    return false;
  }

  return true;
}

export function entryHasRestrictedContext(entryContexts: readonly ClothingContextTag[]): boolean {
  return entryContexts.some(tag => RESTRICTED_CLOTHING_CONTEXTS.includes(tag));
}

export function clothingAllowedInScene(
  entryContexts: readonly ClothingContextTag[],
  sceneContexts: readonly ClothingContextTag[]
): boolean {
  for (const tag of RESTRICTED_CLOTHING_CONTEXTS) {
    if (!entryContexts.includes(tag)) {
      continue;
    }

    const required = RESTRICTED_CONTEXT_REQUIREMENTS[tag] ?? [tag];
    if (!required.some(requiredTag => sceneContexts.includes(requiredTag))) {
      return false;
    }
  }

  return true;
}

const FORMALWEAR_HINT =
  /\b(?:formal|gala|ballroom|black tie|cocktail|evening gown|opera|wedding reception|red carpet|premiere|skirt suit|pants suit|twinset|fascinator|opera gloves|formalwear|dress suit|banquet|charity ball)\b/i;

const HOSIERY_HINT =
  /\b(?:stockings|pantyhose|tights|hosiery|fishnet hose|sheer hose|nylon hose|back-seam stockings|thigh-high stockings|garter and stockings|seamed pantyhose)\b/i;

export function hintsAllowSwimwearCatalog(hints?: string): boolean {
  return SWIMWEAR_HINT.test(hints?.trim() ?? '');
}

export function hintsAllowIntimateCatalog(hints?: string): boolean {
  return hintsIntimateWardrobeAllowed(hints);
}

export function hintsAllowFormalwearCatalog(hints?: string): boolean {
  return FORMALWEAR_HINT.test(hints?.trim() ?? '');
}

export function hintsAllowHosieryCatalog(hints?: string): boolean {
  const value = hints?.trim() ?? '';
  return (
    HOSIERY_HINT.test(value) ||
    hintsAllowFormalwearCatalog(value) ||
    hintsAllowIntimateCatalog(value)
  );
}

export function catalogEntryAllowedByHints(
  _entry: {
    category?: string;
    contexts?: readonly ClothingContextTag[];
  },
  _hints?: string
): boolean {
  // Manual catalog picks always allow every entry; random rolls use clothingAllowedInScene.
  return true;
}

export function scoreClothingContextMatch(
  entryContexts: readonly ClothingContextTag[],
  preferredContexts: readonly ClothingContextTag[]
): number {
  if (preferredContexts.length === 0) {
    return 1;
  }

  let score = 0;
  for (const tag of preferredContexts) {
    if (entryContexts.includes(tag)) {
      score +=
        tag === 'swimwear' ||
        tag === 'intimate' ||
        tag === 'hosiery' ||
        tag === 'formalwear' ||
        tag === 'sleepwear' ||
        tag === 'underwear'
          ? 4
          : tag === 'traditional'
            ? 3
            : 2;
    }
  }

  if (entryContexts.includes('casual') && preferredContexts.includes('casual')) {
    score += 1;
  }

  return score;
}

export function buildClothingGuardrailLines(filters: ClothingPickFilters): string[] {
  const briefGarments = extractBriefGarmentPhrases(filters.hintCorpus);

  return [
    filters.athleticSport
      ? getAthleticSportGuardrail(filters.athleticSport)
      : filters.athleticActivity
        ? 'Athletic activity is happening—use practical sport or training attire matched to the activity. No costumes, wizard robes, formalwear, or unrelated uniforms.'
        : null,
    filters.athleticSport === 'running' || filters.athleticSport === 'track_field'
      ? 'Runners must wear visible shorts or track pants—never a topless or bottomless look.'
      : null,
    filters.fantasyWardrobe
      ? 'Fantasy setting—use medieval or mythic attire only (robes, armor, leather, cloaks, enchanted garments). No modern jeans, t-shirts, sneakers, hoodies, or contemporary streetwear.'
      : null,
    filters.workWardrobe
      ? filters.workProfession
        ? `Work context applies—keep assigned ${filters.workProfession} workwear or uniform coherent with the job and setting.`
        : 'Work or uniform context applies—keep assigned workwear or uniform coherent with the job and setting.'
      : filters.contexts.includes('work') || filters.contexts.includes('uniform')
        ? 'Do not add unrelated service uniforms or work coveralls unless the scene clearly calls for them.'
        : null,
    !filters.intimateWardrobe
      ? 'This is not an intimate-apparel scene—do not add lingerie, sleepwear, or underwear unless already specified in the brief.'
      : null,
    filters.contexts.includes('swimwear') && !filters.lockPrimaryGarment
      ? filters.swimwearOnly
        ? 'Swim or beach context—use swimwear only (no street clothes, jackets, or dress shoes layered on top).'
        : 'Swimwear is appropriate here—keep coverage and styling realistic for a swim or poolside setting.'
      : null,
    filters.contexts.includes('intimate') && filters.intimateWardrobe
      ? 'Intimate apparel is appropriate in this private setting—keep fabrics, fit, and mood coherent with the scene.'
      : null,
    filters.contexts.includes('formalwear') || filters.contexts.includes('formal')
      ? 'Formal or dressy attire fits this setting—keep tailoring, fabric weight, and accessories coherent with an elevated occasion.'
      : null,
    filters.contexts.includes('hosiery')
      ? 'Hosiery is appropriate here—render sheer or opaque texture, seam detail, and fit naturally with the rest of the outfit.'
      : null,
    hintsSpecifyDress(filters.hintCorpus)
      ? 'The brief calls for a dress—keep a dress silhouette; do not substitute blouses, tops, skirt separates, or jumpsuits.'
      : null,
    briefGarments.length > 0
      ? `The brief specifies ${briefGarments.join(' and ')}—keep those garment types and proportions exactly; do not substitute loafers for heels, long dresses for mini dresses, or unrelated accessories like ties.`
      : null,
    'Prefer clear silhouette, coverage, color, and material words over fabric-crease filler.',
  ].filter((line): line is string => Boolean(line));
}

export function buildClothingCoherenceUserDirective(
  filters: ClothingPickFilters,
  outfitSummary: string
): string {
  const genderLabel =
    filters.gender === 'any'
      ? "the subject's natural presentation"
      : filters.gender === 'women'
        ? 'a woman'
        : 'a man';
  const briefGarments = extractBriefGarmentPhrases(filters.hintCorpus);
  const briefSpecifiesDress = hintsSpecifyDress(filters.hintCorpus);
  const accentOnlyLock = filters.lockPrimaryGarment && !briefSpecifiesDress;

  return [
    'WARDROBE COHERENCE (mandatory):',
    `The subject reads clearly as ${genderLabel}.`,
    `Scene-appropriate clothing context: ${filters.contexts.join(', ')}.`,
    briefGarments.length > 0
      ? `Brief garment requirements: ${briefGarments.join(', ')}. These override any conflicting catalog roll.`
      : null,
    accentOnlyLock
      ? `Assigned accent pieces only (footwear/accessories): ${outfitSummary}.`
      : outfitSummary.trim()
        ? `Assigned wardrobe ingredients: ${outfitSummary}.`
        : briefGarments.length > 0
          ? 'Use the brief garment requirements above; do not invent a conflicting outfit.'
          : null,
    accentOnlyLock
      ? 'The scene brief already specifies what the subject wears—keep that garment. Weave assigned accent pieces only; do not add a second outfit, uniform, outer layer, or extra garment hanging nearby.'
      : briefSpecifiesDress
        ? 'The brief requires a dress—describe her in a dress that matches the brief. Do not swap to blouses, tops, skirt separates, or wrong dress lengths.'
        : "Weave these garments into the subject's description—do not open with a separate wardrobe paragraph.",
    'Name each garment briefly in the final prompt—short labels only, not long material paragraphs.',
    'Mention each assigned garment once—do not repeat the same piece or stack duplicate garment types.',
    accentOnlyLock
      ? 'Keep every assigned footwear or accessory in the final prompt.'
      : 'Keep every assigned garment type in the final prompt.',
    accentOnlyLock
      ? null
      : "Adjust fit, layering, or weather-appropriate styling only when needed so clothing matches the subject's gender and the environment—do not swap to unrelated outfits.",
    ...buildClothingGuardrailLines(filters),
  ]
    .filter(Boolean)
    .join(' ');
}
