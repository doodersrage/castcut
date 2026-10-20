/** Keep CONTEXT_RULES aligned with src/lib/wardrobe/clothing-tags.ts (runtime catalog tagging). */

const WOMEN_GARMENT =
  /\b(?:dress|gown|skirt|heels|stiletto|tutu|cocktail dress|evening gown|a-line skirt|fish-tail skirt|maxi skirt|mini skirt|pencil skirt|wrap skirt|romper|camisole|corset top|blouse|peasant blouse|wrap blouse|halter top|slip dress|shirt dress|sweater dress|dirndl|sari|salwar kameez|hanbok|flamenco dress|ballroom dance dress|mary jane|kitten heels|block heel pumps|ballet flats|leggings|yoga pants|bikini|one-piece swimsuit|tankini|chemise|negligee|lingerie|bralette|bustier|teddy|garter belt|tap pants|stockings|pantyhose|tights|fishnet|twinset|skirt suit|fascinator|opera gloves)\b/i;

const MEN_GARMENT =
  /\b(?:brogues|monk strap|oxford dress shoes|tuxedo|three-piece suit|boxer briefs|jockstrap|codpiece|necktie with suit|suspenders and tie|chore coat with work boots|cowboy boots with hat|swim trunks|swim briefs|lounge shorts with robe)\b/i;

const WOMEN_LEAN =
  /\b(?:crop top|off-shoulder|bodysuit|spaghetti strap|wrap dress|sequin gown|platform heels|thigh-high boots with skirt)\b/i;

const MEN_LEAN =
  /\b(?:rugby shirt|fatigue jacket|military fatigue|dress shirt and tie|suit jacket|sport coat|tweed sport coat|work chore coat|steel-toe boots|hi-vis safety vest)\b/i;

const EXPLICIT_UNIFORM_HINT =
  /\b(?:in uniform|wearing uniform|service uniform|dress uniform|police uniform|military uniform|firefighter turnout|pilot uniform|flight attendant uniform|nurse scrubs|postal uniform|mail carrier uniform|bellhop uniform|referee uniform|umpire uniform|school uniform|chef whites|waiter (?:black tie )?service outfit|bartender vest|bar tender vest|sailor deck outfit|naval deck|barber smock|butcher apron|baker whites|barista apron|construction hi-vis|warehouse picker|mechanic coveralls|paramedic uniform|doctor white coat|police duty uniform)\b/i;

const EXPLICIT_COSTUME_HINT =
  /\b(?:wizard robe|knight armor|plate armor|chain mail|cosplay|costume party|in costume|wearing a costume|nun habit|monk robes|ballerina tutu|superhero suit|vampire cape|renaissance faire|halloween costume|elven gown|dwarven armor|circus ringmaster|magician cape|dressed as a wizard|dressed as a knight|dressed as a|dressed as the)\b/i;

const EXPLICIT_UNDERGARMENT_HINT =
  /\b(?:thong|g-string|g string|cheeky panties|boyshorts?|hipster panties|bikini-cut panties|bikini cut panties|string bikini panties|bra\b|bralette|sports bra|push-up bra| balconette bra|underwire bra|lace bra|mesh bra|lingerie set|lingerie top|lingerie bottom|boxer briefs|boxers\b|tighty whities|briefs\b|jockstrap|A-shirt|wifebeater|undershirt|long johns|thermal underwear|union suit|shapewear|camisole top only|panties only|underwear only)\b/i;

const CONTEXT_RULES = [
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

function mergeCategoryContexts(category, contexts, text) {
  const tags = new Set(contexts);

  if (category === 'swimwear') {
    tags.add('swimwear');
    tags.add('beach');
    tags.add('warm');
    tags.delete('casual');
    tags.delete('work');
    tags.delete('cold');
  }

  if (category === 'intimate') {
    tags.add('intimate');
    tags.delete('casual');
    tags.delete('work');
    tags.delete('outdoor');
    if (
      /\b(?:lace|satin|silk|chemise|negligee|garter|bustier|luxury|champagne|embroidered)\b/i.test(
        text
      )
    ) {
      tags.add('evening');
    }
  }

  if (category === 'hosiery') {
    tags.add('hosiery');
    tags.add('formal');
    tags.delete('casual');
    tags.delete('work');
    tags.delete('outdoor');
    if (/\b(?:fishnet|garter|stay-up|sheer)\b/i.test(text)) {
      tags.add('intimate');
    }
    if (/\b(?:opaque|wool|ribbed|winter)\b/i.test(text)) {
      tags.add('cold');
    }
  }

  if (category === 'formalwear') {
    tags.add('formalwear');
    tags.add('formal');
    tags.add('evening');
    tags.delete('casual');
    tags.delete('work');
    tags.delete('athletic');
  }

  if (category === 'dressy-accessory') {
    tags.add('formalwear');
    tags.add('formal');
    tags.add('evening');
    tags.delete('casual');
    tags.delete('work');
  }

  if (category === 'sleepwear') {
    tags.add('sleepwear');
    tags.add('intimate');
    tags.delete('work');
    tags.delete('outdoor');
  }

  if (category === 'underwear') {
    tags.add('underwear');
    tags.add('intimate');
    tags.delete('work');
    tags.delete('outdoor');
  }

  if (category === 'socks') {
    if (/\b(?:dress|argyle)\b/i.test(text)) tags.add('formal');
    if (/\b(?:athletic|compression|soccer)\b/i.test(text)) tags.add('athletic');
    if (/\b(?:wool|merino|hiking)\b/i.test(text)) tags.add('outdoor');
    if (/\b(?:wool|winter|thick)\b/i.test(text)) tags.add('cold');
    if (tags.size === 1 && tags.has('casual')) {
      /* keep casual socks */
    }
  }

  if (category === 'headwear') {
    if (/\b(?:formal|fascinator|church|cloche|boater)\b/i.test(text)) {
      tags.add('formal');
      tags.add('evening');
    }
    if (/\b(?:sun|bucket|visor|straw)\b/i.test(text)) tags.add('warm');
    if (/\b(?:balaclava|knit|beanie|earmuff)\b/i.test(text)) tags.add('cold');
  }

  if (category === 'traditional') {
    tags.add('traditional');
    tags.add('formal');
    tags.delete('casual');
  }

  if (tags.size === 0) {
    tags.add('casual');
  }

  return [...tags];
}

export function inferClothingGender(text) {
  const value = text.toLowerCase();
  let womenScore = 0;
  let menScore = 0;

  if (WOMEN_GARMENT.test(value)) womenScore += 3;
  if (WOMEN_LEAN.test(value)) womenScore += 2;
  if (MEN_GARMENT.test(value)) menScore += 3;
  if (MEN_LEAN.test(value)) menScore += 2;

  if (/\b(?:ball gown|prom dress|bridesmaid|maternity dress)\b/i.test(value)) {
    womenScore += 4;
  }
  if (/\b(?:tuxedo|cummerbund|dress shirt and tie)\b/i.test(value)) {
    menScore += 2;
  }

  if (/\b(?:women's|ladies'|twinset|skirt suit|fascinator|stockings|pantyhose)\b/i.test(value)) {
    womenScore += 2;
  }

  if (womenScore >= menScore + 2) return 'women';
  if (menScore >= womenScore + 2) return 'men';
  return 'neutral';
}

export function inferClothingContexts(text) {
  const value = text.toLowerCase();
  const tags = new Set();

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

  return [...tags];
}

export function tagClothingEntry(entry) {
  const text = `${entry.label} ${entry.script}`;
  const inferred = entry.contexts?.length ? entry.contexts : inferClothingContexts(text);

  return {
    ...entry,
    gender:
      entry.gender ??
      (entry.category === 'hosiery' ||
      entry.category === 'formalwear' ||
      entry.category === 'dressy-accessory'
        ? 'women'
        : inferClothingGender(text)),
    contexts: mergeCategoryContexts(entry.category, inferred, text),
  };
}
