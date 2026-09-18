/**
 * Rewrite literary intimate euphemisms into direct anatomical language
 * image models parse reliably (Qwen/Flux often miss "slick core", "manhood", etc.).
 *
 * Patterns are sexual-context only — weather like "rain-slick asphalt" is left alone.
 */

type ClarifyRule = {
  pattern: RegExp;
  replace: string | ((match: string, ...groups: string[]) => string);
};

const PRONOUN = '(her|his|their)';
const OBJ = '(her|him|them)';

/** Adjectives LLMs stack before core / folds / entrance euphemisms (one or more). */
const CORE_ADJ =
  '(?:slick|wet|hot|warm|molten|dripping|soaked|swollen|tight|aching|needy|eager|quivering|trembling|silken|soft|juicy|creamy|slicked|drenched|slippery|clenching|pulsing|throbbing|slicked-?up|glistening|dewy|slicked\\s+wet|slick\\s+wet|warm\\s+wet|hot\\s+wet)';
const CORE_ADJ_RUN = `(?:${CORE_ADJ}\\s+)+`;

/** Female / receptive genital euphemism nouns. */
const FEMALE_CORE =
  '(?:core|folds?|channel|entrance|flower|honey\\s*pot|love\\s*canal|womanhood|cunny|cunt|snatch|quim|slit|center|depths?|heat|opening|passage|tunnel|sheath|hollow|nethers?|privates?|womanly\\s+parts?|most\\s+intimate\\s+place)';

/** Male genital euphemism nouns (possessive). */
const MALE_MEMBER =
  '(?:manhood|member|length|girth|shaft|hardness|erection|arousal|cockstand|rod|tool|package|pride|lance|spear|pole|column|arousal|bulge|hardness)';

/** Clit euphemisms. */
const CLIT_NOUN = '(?:clit(?:oris)?|pearl|nub|button|bean|bud|sweet\\s*spot)';

/** Breast euphemisms. */
const BREAST_NOUN =
  '(?:mounds?|orbs?|globes?|teats?|udders?|melons?|funbags?|tits?|bosoms?|bust|cleavage|soft\\s+flesh|pillowy\\s+chest)';

/** Ass euphemisms (possessive — avoid bare "behind" / face "cheeks"). */
const ASS_NOUN = '(?:rear|backside|rump|ass\\s+cheeks|hindquarters)';

/** Cum / fluid euphemisms (possessive — avoid bare "cream" food). */
const CUM_NOUN = '(?:seed|spend|release|essence|load|finish|spendings?|climax)';

function vaginaFor(pronoun: string): string {
  return pronoun.toLowerCase() === 'his' ? `${pronoun} ass` : `${pronoun} vagina`;
}

function penetrateFor(pronoun: string, lead = 'penetrating'): string {
  return pronoun.toLowerCase() === 'his' ? `${lead} ${pronoun} ass` : `${lead} ${pronoun} vagina`;
}

/**
 * Longer / more specific patterns first.
 */
const INTIMATE_CLARIFY_RULES: ClarifyRule[] = [
  // ——— Penetration / fingering into core ———
  {
    pattern: new RegExp(
      String.raw`\bfingers?\s+(?:into|inside|in|through)\s+${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${FEMALE_CORE}\b`,
      'gi'
    ),
    replace: (_m, p: string) =>
      p.toLowerCase() === 'his'
        ? `fingers penetrating ${p} ass`
        : `fingers penetrating ${p} vagina`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:tongue|mouth)\s+(?:into|inside|in|on|over)\s+${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${FEMALE_CORE}\b`,
      'gi'
    ),
    replace: (_m, p: string) => `tongue on ${vaginaFor(p)}`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:cock|penis|dick|shaft|member|manhood|rod|pole)\s+(?:into|inside|in|through)\s+${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${FEMALE_CORE}\b`,
      'gi'
    ),
    replace: (_m, p: string) =>
      p.toLowerCase() === 'his' ? `cock penetrating ${p} ass` : `cock penetrating ${p} vagina`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:buried|sank|sinking|plunged|plunging|thrust(?:s|ing)?|pushed|pushing|slid|sliding|drove|driving|rammed|ramming|sunk|hilted|sheathed)\s+(?:(?:deep|fully|fully\s+deep)\s+)?(?:(?:into|inside|in)\s+)?${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${FEMALE_CORE}\b`,
      'gi'
    ),
    replace: (_m, p: string) => penetrateFor(p),
  },
  {
    pattern: new RegExp(
      String.raw`\breached\s+${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${FEMALE_CORE}\b`,
      'gi'
    ),
    replace: (_m, p: string) => penetrateFor(p),
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:filled|filling|stuffed|stuffing|stretched|stretching)\s+${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${FEMALE_CORE}\b`,
      'gi'
    ),
    replace: (_m, p: string) =>
      p.toLowerCase() === 'his' ? `filling ${p} ass` : `filling ${p} vagina`,
  },

  // ——— Hands / clit ———
  {
    pattern: /\bthumb\s+circles?\s+(her|his|their)\s+clit\b/gi,
    replace: (_m, p: string) => `thumb rubbing ${p} clit`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:hand|fingers?)\s+(?:between|in)\s+${PRONOUN}\s+legs\b`,
      'gi'
    ),
    replace: (_m, p: string) => `hand between ${p} legs, fingering`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:working|rubbing|stroking|teasing|circling|flicking)\s+${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${CLIT_NOUN}\b`,
      'gi'
    ),
    replace: (_m, p: string) => `rubbing ${p} clit`,
  },
  // "Gilded frame of her bare legs" is literary leg shape — not a picture/mirror frame.
  {
    pattern: /\bgilded\s+frame\s+of\s+(her|his|their)\s+bare\s+legs\b/gi,
    replace: (_m, p: string) => `candlelight along ${p} bare legs`,
  },
  {
    pattern: /\b(?:ornate|golden|gilded)\s+frame\s+of\s+(her|his|their)\s+(?:bare\s+)?legs\b/gi,
    replace: (_m, p: string) => `the long lines of ${p} bare legs`,
  },

  // ——— Possessive anatomy ———
  {
    pattern: new RegExp(String.raw`\b${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${FEMALE_CORE}\b`, 'gi'),
    replace: (_m, p: string) => vaginaFor(p),
  },
  {
    pattern: new RegExp(String.raw`\b${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${CLIT_NOUN}\b`, 'gi'),
    replace: (_m, p: string) => `${p} clit`,
  },
  {
    pattern: new RegExp(
      String.raw`\b${PRONOUN}\s+(?:thick\s+|hard\s+|rigid\s+|throbbing\s+|aching\s+|swollen\s+|heavy\s+|stiff\s+)?${MALE_MEMBER}\b`,
      'gi'
    ),
    replace: (_m, p: string) => `${p} erect penis`,
  },
  {
    pattern: new RegExp(
      String.raw`\b${PRONOUN}\s+(?:full\s+|soft\s+|heavy\s+|bare\s+|naked\s+|exposed\s+)?${BREAST_NOUN}\b`,
      'gi'
    ),
    replace: (_m, p: string) => `${p} breasts`,
  },
  {
    pattern: new RegExp(
      String.raw`\b${PRONOUN}\s+(?:hard\s+|stiff\s+|peaked\s+|pebbled\s+|sensitive\s+)?(?:nipples?|buds?|tips?)\b`,
      'gi'
    ),
    replace: (_m, p: string) => `${p} nipples`,
  },
  {
    pattern: new RegExp(String.raw`\b${PRONOUN}\s+${ASS_NOUN}\b`, 'gi'),
    replace: (_m, p: string) => `${p} ass`,
  },
  {
    pattern: new RegExp(
      String.raw`\b${PRONOUN}\s+(?:tight\s+|puckered\s+|eager\s+)?(?:asshole|anus|ring|back\s*door|rosebud)\b`,
      'gi'
    ),
    replace: (_m, p: string) => `${p} asshole`,
  },
  {
    pattern: new RegExp(
      String.raw`\b${PRONOUN}\s+(?:heavy\s+|tight\s+|full\s+)?(?:balls?|sac|stones?|nuts?)\b`,
      'gi'
    ),
    replace: (_m, p: string) => `${p} balls`,
  },
  {
    pattern: new RegExp(String.raw`\b${PRONOUN}\s+${CUM_NOUN}\b`, 'gi'),
    replace: (_m, p: string) => `${p} cum`,
  },

  // ——— Determiner / bare core (the wet core, slick core) ———
  {
    pattern: new RegExp(
      String.raw`\b(?:the|that|this|a|an)\s+(?:${CORE_ADJ_RUN})?${FEMALE_CORE}\b`,
      'gi'
    ),
    replace: 'the vagina',
  },
  {
    pattern: new RegExp(String.raw`\b${CORE_ADJ_RUN}core\b`, 'gi'),
    replace: 'wet vagina',
  },
  {
    pattern: new RegExp(String.raw`\b${CORE_ADJ_RUN}folds?\b`, 'gi'),
    replace: 'wet vagina',
  },
  {
    pattern: new RegExp(String.raw`\b${CORE_ADJ_RUN}(?:channel|entrance|slit|quim|cunny)\b`, 'gi'),
    replace: 'wet vagina',
  },
  {
    pattern: /\b(?:love\s*canal|honey\s*pot|womanhood)\b/gi,
    replace: 'vagina',
  },
  {
    pattern: /\bmanhood\b/gi,
    replace: 'erect penis',
  },
  {
    pattern: /\b(?:throbbing|aching|rigid|hard|stiff)\s+member\b/gi,
    replace: 'erect penis',
  },

  // ——— Oral / sex acts ———
  {
    pattern: /\blaps?\s+at\s+(?:her|his|their)\s+(?:inner\s+)?thigh\b/gi,
    replace: 'licking her inner thigh during oral sex',
  },
  {
    pattern: /\b(?:tongue|mouth)\s+laps?\s+at\b/gi,
    replace: 'tongue licking',
  },
  {
    pattern: /\bfingers?\s+curl(?:s|ing)?\s+around\s+(her|his|their)\s+clit\b/gi,
    replace: (_m, p: string) => `fingers rubbing ${p} clit`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:tasting|devouring|feasting\s+on|lapping\s+(?:at|up)|laps?\s+at|mouthing)\s+${OBJ}\b`,
      'gi'
    ),
    replace: (_m, obj: string) => `performing oral sex on ${obj}`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:going\s+down\s+on|ate\s+out|eating\s+out|went\s+down\s+on)\s+${OBJ}\b`,
      'gi'
    ),
    replace: (_m, obj: string) => `oral sex on ${obj}`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:sucking|suckles?|suckling|blowing)\s+(?:on\s+)?${PRONOUN}\s+(?:cock|dick|penis|member|manhood|shaft)\b`,
      'gi'
    ),
    replace: (_m, p: string) => `sucking ${p} cock`,
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:sucking|suckles?|lick(?:ing|s|ed)?)\s+${PRONOUN}\s+(?:${CORE_ADJ_RUN})?${CLIT_NOUN}\b`,
      'gi'
    ),
    replace: (_m, p: string) => `licking ${p} clit`,
  },
  {
    pattern:
      /\b(?:sheathed|buried|sank|sinking)\s+(?:(?:his|her|their)\s+)?(?:cock|penis|member|manhood|shaft|length|dick)\s+(?:(?:deep\s+)?(?:inside|into|in)\s+)?(?:her|his|their)?\b/gi,
    replace: 'penetrating with his cock',
  },
  {
    pattern:
      /\b(?:joined|joining|coupled|coupling|became\s+one|becoming\s+one|sheathed\s+(?:himself|herself|themselves)|buried\s+(?:himself|herself|themselves)|rocked\s+together|moved\s+as\s+one)\b/gi,
    replace: 'penetrating in sex',
  },
  {
    pattern: /\bmaking\s+love\b/gi,
    replace: 'having sex',
  },
  {
    pattern: /\blovemaking\b/gi,
    replace: 'sex',
  },
  {
    pattern: /\bintimate\s+union\b/gi,
    replace: 'penetrative sex',
  },
  {
    pattern: /\bcarnal\s+(?:act|knowledge|union)\b/gi,
    replace: 'sex',
  },
  {
    pattern: /\b(?:the\s+)?(?:deed|act)\s+itself\b/gi,
    replace: 'sex',
  },
  {
    pattern: /\bspilling\s+(?:his|her|their)\s+seed\b/gi,
    replace: 'cumming',
  },
  {
    pattern: /\b(?:came|coming|spent)\s+(?:inside|in|on)\s+(her|him|them)\b/gi,
    replace: (_m, obj: string) => `cumming on ${obj}`,
  },
  {
    pattern: /\b(?:finished|finishing)\s+(?:inside|in|on)\s+(her|him|them)\b/gi,
    replace: (_m, obj: string) => `cumming inside ${obj}`,
  },
  {
    pattern: /\b(?:straddled|straddling|mounted|mounting|rode|riding)\s+(him|her|them)\b/gi,
    replace: (_m, obj: string) => `straddling ${obj} in sex`,
  },
  // Meta beat-template phrasing that confuses image models (legacy adult forks)
  {
    pattern:
      /\b(?:([A-Z][\w'-]+)\s+)?Office\s+bent\s+over\s+after\s+[^,—.]{1,48},?\s*taken\s+from\s+behind\s*[—-]\s*doggy\s+or\s+bent-over\s+sex,?\s*explicit\s+and\s+readable\.?/gi,
    replace:
      'leaning over an office desk with a distinct adult partner behind her in rear-entry sex, nude, mid-thrust, camera behind them',
  },
  {
    pattern:
      /\bbent\s+over\s+after\s+[^,—.]{1,48},?\s*taken\s+from\s+behind\s*[—-]\s*doggy\s+or\s+bent-over\s+sex,?\s*explicit\s+and\s+readable\.?/gi,
    replace:
      'on hands and knees with a distinct adult partner behind her in rear-entry sex, nude, mid-thrust, camera behind them',
  },
  {
    pattern: /\s*[—-]\s*doggy\s+or\s+bent-over\s+sex,?\s*explicit\s+and\s+readable\.?/gi,
    replace:
      ' — rear-entry sex with a distinct adult partner, nude, mid-thrust, camera behind them',
  },
  {
    pattern: /\bdoggy\s+or\s+bent-over\s+sex\b/gi,
    replace: 'rear-entry sex',
  },
  {
    pattern: /\bdoggy(?:[- ]style)?\s+sex\b/gi,
    replace: 'rear-entry sex',
  },
  // Any doggy/doggystyle token summons literal dogs (worse without SNOFS).
  {
    pattern: /\bdoggystyle(?:\s+position)?\b/gi,
    replace: 'rear-entry',
  },
  {
    pattern: /\bdoggy(?:[- ]style)?\b/gi,
    replace: 'from behind',
  },
  {
    pattern: /\bexplicit\s+and\s+readable\.?\b/gi,
    replace: 'clear nude bodies',
  },
  {
    pattern: /\ban?\s+explicit\s+pose\s+you\s+can\s+photograph\.?\b/gi,
    replace: 'nude sex pose',
  },
  {
    pattern: /\boral\s+sex\s+as\s+the\s+still\.?\b/gi,
    replace: 'oral sex in progress',
  },
  {
    pattern: /\b(?:skin\s+and\s+motion\s+clear|exhibition\s+heat,?\s*not\s+fade-to-black)\.?\b/gi,
    replace: 'nude bodies clear',
  },
  {
    pattern: /\bthe\s+still\s+is\s+about\b/gi,
    replace: 'showing',
  },
  {
    pattern: /\bas\s+the\s+last\s+still\.?\b/gi,
    replace: '',
  },
  {
    pattern: /\bstory\s+over\s+on\s+a\s+quiet\s+erotic\s+still\.?\b/gi,
    replace: 'quiet erotic portrait',
  },
  {
    pattern: /\bFinal\s+beat:\s*/gi,
    replace: '',
  },
  {
    pattern: /\bCredits\s+on\b/gi,
    replace: 'Camera on',
  },
  // "after <poetic prior title>" is continuity, not set dressing — drop before sex cues
  {
    pattern:
      /\bafter\s+[^,—.]{1,48},?\s*(?=(?:taken\s+from\s+behind|bent\s+over|on\s+hands\s+and\s+knees|partner\s+behind|doggy|camera\s+from\s+behind))/gi,
    replace: '',
  },
  {
    pattern: /\btaken\s+from\s+behind\b/gi,
    replace: 'camera from behind',
  },
  {
    pattern:
      /\bbent\s+over\b(?!\s+(?:an?\s+|the\s+)?(?:office\s+)?(?:desk|chair|table|counter))(?=.{0,80}(?:doggy|sex|fuck|partner|thrust|camera\s+from\s+behind))/gi,
    replace: 'on hands and knees',
  },
];

/**
 * Convert literary intimate euphemisms to direct words for image models.
 * Idempotent for already-direct language. Safe on SFW text (patterns are sexual).
 */
export function clarifyIntimateImageLanguage(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return trimmed;
  }

  let next = trimmed;
  for (const rule of INTIMATE_CLARIFY_RULES) {
    rule.pattern.lastIndex = 0;
    next =
      typeof rule.replace === 'function'
        ? next.replace(rule.pattern, rule.replace)
        : next.replace(rule.pattern, rule.replace);
  }

  return next
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

/** True when the prompt still contains common literary euphemisms we rewrite. */
export function promptHasIntimateEuphemisms(prompt: string): boolean {
  const sample = prompt.trim();
  if (!sample) {
    return false;
  }
  return INTIMATE_CLARIFY_RULES.some(rule => {
    rule.pattern.lastIndex = 0;
    return rule.pattern.test(sample);
  });
}

/** Legacy adult fork blurbs that models misread as decor / mirrors / twins. */
export function isLegacyAdultMetaBlurb(text: string | null | undefined): boolean {
  return /explicit and readable|doggy or bent-over|pose you can photograph|as the still|fade-to-black/i.test(
    text?.trim() || ''
  );
}

const INTIMATE_ACT_CUE =
  /\b(doggy(?:[- ]style)?|doggystyle|rear-entry|from\s+behind|hands\s+and\s+knees|partner\s+behind|camera\s+from\s+behind|thrust(?:s|ing)?|oral\s+sex|cunnilingus|fellatio|blowjob|sixty[- ]?nine|facesit|facesitting|licking|tongue|clit|kneeling|barefoot|mid-thrust|penetration|fingering|missionary|mating\s+press|cowgirl|straddl|spoon(?:ing)?|prone|lap\s+sit|standing\s+sex|grab(?:s|bing)?|grip(?:s|ping)?|clutch(?:es|ing)?|hands?\s+on|pin(?:s|ned|ning)?|hold(?:s|ing)?\s+(?:her|him|their|his|hips|waist))\b/i;

const INTIMATE_WARDROBE_CUE =
  /\b(lingerie|bra|panties|underwear|stockings|garter|corset|dress|skirt|shirt|blouse|outfit|clothes|clothing|wardrobe|wearing|half[- ]dressed|unzip|garment|bodysuit|teddy|chemise|robe|boots|heels|pajama|pyjama|pajamas|pyjamas|silk\s+bottoms|bottoms|pants|trousers|shorts|jeans|tee|t-shirt)\b/i;

const INTIMATE_NUDE_CUE =
  /\b(nude|naked|fully\s+nude|bare\s+bodies?|unclothed|nothing\s+(?:on|worn)|no\s+clothes)\b/i;

const INTIMATE_DUO_LOCK =
  'Two adults: Cast lead (Image 1 face) in the lead role + distinct partner — no twin people or duplicate faces (room mirrors/glass OK); show the sex act, not a standing lingerie portrait.';

const INTIMATE_POSE_LOCK =
  'Match the named pose (standing wall press, kneeling, bent, oral, hands on genitals, lift/chaise as written) — not a floor kneel when the beat is a wall press, and not a standing fashion pose.';

const INTIMATE_CONTACT_LOCK =
  'Cross-person touch only (hands/mouth on the other body); partner does the grabbing named in the beat — no self-grab, no role-reversed hands, no fused silhouette.';

const INTIMATE_NUDE_DEFAULT =
  'Fully nude — nothing worn; replace reference clothing with bare skin.';

/**
 * SNOFS / NSFW LoRA caption cues. Bare "sex" alone collapses every beat to one pose —
 * prefer trained "… position" phrases (see CivArchive SNOFS trigger list).
 */
export function snofsPositionCueForText(text: string | null | undefined): string | null {
  const sample = text?.trim() || '';
  if (!sample) {
    return null;
  }
  if (
    /rear-entry sex|missionary position|cowgirl position|reverse cowgirl position|spooning position|prone position/i.test(
      sample
    )
  ) {
    return null;
  }
  if (/\b(missionary|on\s+(?:her|his|their)\s+back|pinned\s+(?:down|beneath))\b/i.test(sample)) {
    return 'missionary position';
  }
  if (/\breverse\s+cowgirl\b/i.test(sample)) {
    return 'reverse cowgirl position';
  }
  if (/\b(cowgirl|straddl|riding)\b/i.test(sample)) {
    return 'cowgirl position';
  }
  if (/\b(prone|face[- ]down)\b/i.test(sample)) {
    return 'prone position';
  }
  if (/\bspoon/i.test(sample)) {
    return 'spooning position';
  }
  if (/\b(blowjob|fellatio)\b/i.test(sample)) {
    return 'blowjob';
  }
  if (/\b(cunnilingus|licking.{0,24}clit|tongue.{0,24}clit)\b/i.test(sample)) {
    return 'cunnilingus';
  }
  if (/\b(sixty[- ]?nine|69)\b/i.test(sample)) {
    return 'sixty-nine';
  }
  if (/\b(facesit|face[- ]sit|sits?\s+on\s+(?:his|her|their)\s+face)\b/i.test(sample)) {
    return 'facesitting';
  }
  if (/\b(mating\s+press|legs?\s+over\s+(?:his|her|their)\s+shoulders)\b/i.test(sample)) {
    return 'missionary position';
  }
  if (/\b(standing\s+sex|upright\s+sex|against\s+the\s+window)\b/i.test(sample)) {
    return 'sex';
  }
  if (/\b(lap\s+sit|on\s+(?:his|her|their)\s+lap)\b/i.test(sample)) {
    return 'sex';
  }
  // Never inject "doggystyle" — it paints literal dogs. Compact Behind/Chair recipes
  // already encode rear-entry; other poses use their own cues above.
  return null;
}

/** True when copy names garments / lingerie (packshot + clothed intimate stills stay valid). */
export function intimateTextMentionsWardrobe(text: string | null | undefined): boolean {
  return INTIMATE_WARDROBE_CUE.test(text?.trim() || '');
}

/** Sex/oral/etc. beat with no wardrobe words → default to nude (and skip Image 2 kits). */
export function intimateTextDefaultsToNude(text: string | null | undefined): boolean {
  const sample = text?.trim() || '';
  if (!sample) {
    return false;
  }
  if (!INTIMATE_ACT_CUE.test(sample) && !/\b(sex|fuck|nude\s+sex)\b/i.test(sample)) {
    return false;
  }
  if (intimateTextMentionsWardrobe(sample)) {
    return false;
  }
  return true;
}

/** Sex/fingering/oral/etc. cues — used when layout parsers miss literary wall/elevator phrasing. */
export function intimateTextImpliesAct(text: string | null | undefined): boolean {
  const sample = text?.trim() || '';
  if (!sample) {
    return false;
  }
  return (
    INTIMATE_ACT_CUE.test(sample) ||
    /\b(sex|fuck|nude\s+sex|vagina|penis|collarbone|throat|elevator)\b/i.test(sample)
  );
}

/**
 * "Tongue on collarbone" + wall press gets misread as a face-to-face tongue kiss,
 * and stacking a long recipe ON TOP of the literary blurb drowns Qwen Edit into
 * masks / third people / balcony windows. Replace the beat with one short recipe.
 */
function rewriteWallCollarboneContact(text: string): string {
  const wallish =
    /\b(against.{0,40}wall|press(?:es|ed|ing)?\s+(?:her|him|them)\s+back|elevator|mirrored?\s+elevator)\b/i.test(
      text
    );
  const collarboneMouth =
    /\b(tongue|lick(?:s|ing)?|laps?|lips|mouth)\b.{0,48}\b(collarbone|nape|neck)\b|\b(collarbone|nape)\b.{0,48}\b(tongue|lick(?:s|ing)?|laps?|lips|mouth)\b/i.test(
      text
    );
  if (!wallish || !collarboneMouth) {
    return text;
  }
  if (/Rear wall press/i.test(text) && /Exactly two adults/i.test(text)) {
    return text;
  }

  return [
    'FULL BODY standing shot (head to mid-calf) — do not crop at the waist.',
    'Rear wall press: glass elevator, city neon through rear glass, exactly two adults, clean anatomy, no glasses.',
    'Side view: lead pressed to glass on camera-left; partner chest-to-back behind her, head visible over her shoulder, mouth on her neck.',
    "Lead both hands on the glass. Partner's left hand on the front of her throat; partner's right hand on her front crotch between her legs — never on her butt.",
    'Simple reflections only.',
  ].join(' ');
}

/**
 * "Gilded frame of her legs" + suspended→chaise gets misread as a mirror-frame
 * portrait or a face-to-face couch straddle. Replace with a short carry-lower recipe.
 */
function rewriteChaiseLowerContact(text: string): string {
  const chaiseLower =
    /\b(chaise|daybed|fainting\s+couch)\b/i.test(text) &&
    /\b(suspend(?:ed|ing)|hangs?\s+suspended|lower(?:s|ing)\s+(?:her|him|them)|arms?\s+wrapped|around\s+his\s+neck)\b/i.test(
      text
    );
  if (!chaiseLower) {
    return text;
  }
  if (/Chaise lower:/i.test(text) && /Exactly two adults/i.test(text)) {
    return text;
  }

  return [
    'Chaise lower: ballroom alcove, long velvet chaise, candlelight.',
    'Exactly two adults — four legs total, no extra limbs, no flesh blob.',
    'He STANDS on the floor beside the chaise (feet planted — he is not sitting). She is mid-air as he lowers her onto the cushions; arms around his shoulders; cheek at his shoulder.',
    'Side profile, same facing toward the chaise. Mouths apart — no kiss.',
    'His hands support her thigh and hip only. Clean separate bodies.',
  ].join(' ');
}

/**
 * Piano-bench oral: "back bent" + piano makes Edit drape her over the lid and
 * invent a behind kneel + hand salad. Replace with a short beside-oral recipe.
 */
function rewritePianoBenchOralContact(text: string): string {
  const pianoBench =
    /\b(piano\s+bench|piano\s+stool|lacquered\s+piano|grand\s+piano|piano)\b/i.test(text) &&
    /\b(bench|kneel(?:s|ing)?|knees)\b/i.test(text);
  const oralBeside =
    /\b(tongue|lick(?:s|ing)?|laps?|oral|cunnilingus|clit)\b/i.test(text) &&
    /\b(kneel(?:s|ing)?|beside|thigh|clit)\b/i.test(text);
  if (!pianoBench || !oralBeside) {
    return text;
  }
  if (/^Piano oral:/i.test(text) && /Exactly two adults/i.test(text)) {
    if (
      /four hands only/i.test(text) &&
      /kneeling ON the piano bench/i.test(text) &&
      /kneels BESIDE/i.test(text) &&
      !/bent OVER the piano|rear-entry|partner behind/i.test(text)
    ) {
      return text;
    }
  }

  return [
    'Piano oral: night room with a black lacquered grand piano and padded piano bench, single crystal lamp glow — not a blank studio.',
    'Exactly TWO adults, exactly two faces, four hands only — no extra arms, no phantom hand on the bench, no flesh blob at the join.',
    'She kneels ON the piano bench (knees on the cushion), torso upright with a slight forward lean — NOT draped over the piano lid, NOT bent over the keys, NOT rear-entry.',
    'He kneels BESIDE her on the floor (or bench end), face toward her crotch — mouth licking her inner thigh / vulva during oral sex; one hand rubbing her clit; his other hand on her thigh — both hands attached to his arms.',
    'Her hands brace on the bench or his shoulder only — never a third hand sprouting from her torso. Barefoot, fully nude — nothing worn. Mouths closed except his tongue on her. Side three-quarter camera, clean separate bodies, readable anatomy.',
  ].join(' ');
}

/**
 * Hunched-over-chair blurbs that also say "arms around his neck" make Edit sit her
 * on the seat and twist 180°. Drop the neck-lock; plant hands on the chair like desk bent.
 */
function rewriteChairBentContact(text: string): string {
  const chairish = /\b(chair|ergonomic)\b/i.test(text);
  const hunched =
    /\b(hunch(?:ed|ing)?|bent\s+over|lean(?:s|ing)?\s+over|over\s+the\s+(?:chair|ergonomic)|arms?\s+locked\s+around)\b/i.test(
      text
    );
  const fromBehind =
    /\b(from\s+behind|thrust(?:s|ing)?|doggy|partner\s+behind|camera\s+(?:from\s+)?behind|rear-entry)\b/i.test(
      text
    );
  // Desk-only "leaning over an office desk" is the Behind office recipe — don't steal it.
  if (!chairish || !hunched || !fromBehind) {
    return text;
  }
  if (/^Chair bent:/i.test(text) && /Exactly two adults/i.test(text)) {
    if (
      /rear-entry sex/i.test(text) &&
      /hands on the chair/i.test(text) &&
      /four hands only/i.test(text) &&
      /feet flat on the floor|feet on the floor/i.test(text) &&
      /NOT sitting|not sitting/i.test(text) &&
      !/reach back around his neck|arms locked around his neck/i.test(text) &&
      !/\bdoggy/i.test(text)
    ) {
      return text;
    }
    // Stale Chair bent (neck-lock / sit bait / doggy bait): rebuild.
  }

  const wardrobe = intimateTextMentionsWardrobe(text)
    ? 'Damp silk pajama bottoms stay on her thighs (fabric visible) — not a striped skirt, not nude from the waist.'
    : 'Nude as needed — no extra garments.';
  const clitHand = /\bclit\b/i.test(text)
    ? 'His front hand reaches around to stroke her clit over the silk fabric — connected to his arm, not a floating third hand.'
    : 'His other hand stays on her hip.';

  return [
    'Chair bent: rear-entry sex. office interior with an ergonomic mesh chair — not a blank gray studio.',
    'Exactly TWO adults, exactly two faces, four hands only — no extra arms, no phantom fingers at the join, no flesh blob.',
    'She STANDS on the floor bent OVER the chair back (both feet flat) — NOT kneeling on the seat, NOT sitting, NOT straddling, NOT twisting to face the camera.',
    'Her hands plant on the chair seat or armrests for support; head may glance back over one shoulder only — do not wrap her arms around his neck.',
    'Partner STANDS behind with pelvis connected to his torso, mid-thrust rear-entry; one hand on her hip;',
    clitHand,
    wardrobe,
    'Side three-quarter camera, mouths closed, clean separate bodies, readable anatomy. Humans only — never a dog, puppy, canine, pet, or animal in frame.',
  ].join(' ');
}

/**
 * Desk / ledger / table surface bent (standing lean) — not carpet all-fours.
 * Archive rooms and "curled over a stack" count as surface bent.
 * Bare "office lights" alone does not count (cabinet/drawer beats stay distinct).
 */
export function intimateTextImpliesSurfaceBent(text: string | null | undefined): boolean {
  const sample = text?.trim() || '';
  if (!sample) {
    return false;
  }
  if (/\b(cabinet|filing\s+cabinet|open\s+drawer|drawer)\b/i.test(sample)) {
    return false;
  }
  return (
    /\b(office\s+desk|desk|ledger|ledgers|archive|table|counter|filing|workbench|bookshelf|console)\b/i.test(
      sample
    ) || /\bcurled?\s+over\s+(?:a\s+|the\s+)?(?:stack|pile|heap)\b/i.test(sample)
  );
}

/**
 * Filing-cabinet / open-drawer rear-entry — not desk bent, not carpet doggy.
 */
function rewriteCabinetDrawerContact(text: string): string {
  const cabinet =
    /\b(steel\s+cabinet|filing\s+cabinet|cabinet(?:'s)?\s+open\s+drawer|open\s+drawer|slumped\s+sideways.{0,40}drawer)\b/i.test(
      text
    );
  const fromBehind =
    /\b(from\s+behind|thrust(?:s|ing)?|partner\s+behind|rear-entry|hand\s+grips?\s+her\s+waist)\b/i.test(
      text
    );
  if (!cabinet || !fromBehind) {
    return text;
  }
  if (/^Cabinet drawer:/i.test(text) && /Exactly two adults/i.test(text)) {
    if (
      /four hands only/i.test(text) &&
      /open drawer/i.test(text) &&
      !/\bdesk\b/i.test(text) &&
      !/\bdoggy/i.test(text)
    ) {
      return text;
    }
  }

  const genitalHand = /\b(vagina|clit|finger|sinks?\s+(?:deep\s+)?into)\b/i.test(text)
    ? 'One hand grips her waist; the other sinks into her vagina between her thighs — both hands attached to his arms, not a floating third hand.'
    : 'Both hands on her waist/hips only — connected to his arms.';

  return [
    'Cabinet drawer: rear-entry sex. office storage area with a steel filing cabinet, one drawer pulled open — not a desk lean, not carpet all-fours.',
    'Exactly TWO adults, exactly two faces, four hands only — no extra arms, no phantom fingers, no flesh blob.',
    'She is slumped sideways into the open cabinet drawer (hips at the drawer edge, thighs parted), not standing bent over a desk.',
    'Partner stands behind with pelvis connected to his torso, mid-thrust rear-entry.',
    genitalHand,
    'Office lights cast long shadows over her bare calves and his back. Mouths closed, clean separate solid opaque bodies — never a translucent ghost person or Image 3 diagram. Humans only.',
  ].join(' ');
}

/**
 * Doggy / bent-over meta ("Amber Office bent over after…") leaves title crumbs and
 * Edit merges limbs at the join. Replace with one short readable recipe.
 * Never say doggy/doggystyle — that paints literal dogs.
 */
function rewriteDoggyBentContact(text: string): string {
  const wallish = /\b(against.{0,40}wall|wall\s+press|elevator|Rear wall press)\b/i.test(text);
  if (wallish) {
    return text;
  }
  // Piano-bench oral is beside licking — never collapse to behind bent-over-piano.
  if (
    /^Piano oral:/i.test(text) ||
    (/\bpiano\b/i.test(text) && /\b(oral|clit|tongue|lick)/i.test(text))
  ) {
    return text;
  }
  if (/^Cabinet drawer:/i.test(text) || /\b(cabinet|open\s+drawer)\b/i.test(text)) {
    return text;
  }
  // Prone / face-down is its own layout — don't collapse to standing desk Behind.
  if (
    /\b(prone|face[- ]down)\b/i.test(text) &&
    !/\b(hands\s+and\s+knees|bent\s+over|desk|chair|ledger|archive)\b/i.test(text)
  ) {
    return text;
  }
  // Standing chair hunch is a different beat — don't collapse to all-fours doggy.
  if (/^Chair bent:/i.test(text)) {
    return text;
  }
  if (
    /\b(chair|ergonomic)\b/i.test(text) &&
    /\b(hunch(?:ed|ing)?|bent\s+over|lean(?:s|ing)?\s+over|arms?\s+locked\s+around)\b/i.test(text)
  ) {
    return text;
  }
  const doggyish =
    /\b(doggy(?:[- ]style)?|doggystyle|rear-entry|hands\s+and\s+knees|partner\s+behind|camera\s+(?:from\s+)?behind|bent\s+over|leaning\s+over|curled?\s+over|from\s+behind|mid-thrust|fucks?\s+her\s+from\s+behind|fucks?\s+him\s+from\s+behind)\b/i.test(
      text
    ) || isLegacyAdultMetaBlurb(text);
  if (!doggyish) {
    return text;
  }
  if (/^Behind:/i.test(text) && /Exactly two adults/i.test(text)) {
    // Keep only fully upgraded recipes; older Behind: drafts fall through to rebuild.
    if (
      /rear-entry sex/i.test(text) &&
      /two faces/i.test(text) &&
      /four hands only|connected torso|pelvis clearly connected/i.test(text) &&
      !/\bdoggy/i.test(text)
    ) {
      return text;
    }
  }
  // Legacy cached "Doggy:" recipes — rewrite once without the animal bait word.
  if (/^Doggy:/i.test(text) && /Exactly two adults/i.test(text)) {
    text = text.replace(/^Doggy:/i, 'Behind:').replace(/\bdoggy(?:[- ]style)?\b/gi, 'rear-entry');
  }

  const surface = intimateTextImpliesSurfaceBent(text);
  const archive = /\b(archive|ledger)\b/i.test(text);
  const throat = /\bthroat\b/i.test(text);
  const genitalHand =
    /\b(vagina|clit|finger|sinks?\s+(?:deep\s+)?into|between\s+(?:her|his|their)\s+(?:legs|thighs))\b/i.test(
      text
    );
  const bedroom = /\b(bed(?:room)?|mattress|sheets)\b/i.test(text);

  if (surface) {
    const setting = archive
      ? 'dim archive room with a stack of ledgers / desk surface under flickering bulb light — lead curled or bent OVER the ledgers (torso on the stack or hips at the edge), not sex on the carpet floor'
      : 'modern office — lead bent OVER the desk (torso on the desktop or hips at the desk edge), not sex on the carpet floor';
    const contact =
      throat && genitalHand
        ? 'Partner stands fully behind her with pelvis clearly connected to his torso, mid-thrust rear-entry sex: one hand cups her throat from behind, the other sinks into her vagina / between her thighs — not both hands on her hips only, not a floating third hand.'
        : throat
          ? 'Partner stands fully behind her with pelvis clearly connected to his torso, mid-thrust rear-entry sex: one hand cups her throat from behind, the other on her hip — she does not hold her own throat.'
          : 'Partner stands fully behind her with pelvis clearly connected to his torso; gripping her hips only (not shoulders); nude mid-thrust rear-entry sex.';
    return [
      `Behind: rear-entry sex. ${setting}.`,
      'Exactly TWO adults, exactly two faces, four hands only — humans only; never a dog or pet; no third head; never a third black morphsuit.',
      contact,
      'Lead looks back over one shoulder; both mouths closed — no dual camera O-faces.',
      'Real human skin only — never a black morphsuit, schematic capsule, or Image 3 diagram in the photo.',
      '¾ rear three-quarter camera, clean separate bodies, readable anatomy.',
    ].join(' ');
  }

  const setting = bedroom ? 'bedroom, on a bed' : 'indoors, on a firm surface';
  return [
    `Behind: rear-entry sex. ${setting}.`,
    'Exactly TWO adults, exactly two faces, four hands only — humans only; never a dog or pet; no third head; never a third black morphsuit.',
    'Lead on hands and knees, hips raised; partner kneeling behind with pelvis connected to his torso, gripping her hips only (not shoulders), nude mid-thrust rear-entry sex.',
    'Mouths closed — no dual camera O-faces. Real human skin only — never a black morphsuit or pose-guide diagram in the photo.',
    '¾ rear three-quarter camera, clean separate bodies, readable anatomy.',
  ].join(' ');
}

/**
 * Clarify euphemisms/meta, then lock duo sex poses so models do not invent twin stands.
 */
export function reinforceIntimateStillPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return trimmed;
  }
  // Idempotent: compact recipes must not re-run clarify (e.g. "bent OVER the desk"
  // → "on hands and knees the desk") or get chair/doggy locks stacked twice.
  if (
    (/^Behind:/i.test(trimmed) ||
      /^Doggy:/i.test(trimmed) ||
      /^Chair bent:/i.test(trimmed) ||
      /^Piano oral:/i.test(trimmed) ||
      /^Cabinet drawer:/i.test(trimmed) ||
      /Rear wall press/i.test(trimmed) ||
      /^Chaise lower:/i.test(trimmed)) &&
    /Exactly two adults/i.test(trimmed)
  ) {
    if (/^Doggy:/i.test(trimmed)) {
      // Fall through so office/bedroom recipe rebuilds.
    } else if (
      /^Behind:/i.test(trimmed) &&
      (!/rear-entry sex/i.test(trimmed) ||
        !/two faces/i.test(trimmed) ||
        !/four hands only|connected torso|pelvis clearly connected/i.test(trimmed) ||
        /\bdoggy/i.test(trimmed))
    ) {
      // Stale Behind: — rebuild below.
    } else if (
      /^Chair bent:/i.test(trimmed) &&
      (!/rear-entry sex/i.test(trimmed) ||
        !/hands on the chair/i.test(trimmed) ||
        !/four hands only/i.test(trimmed) ||
        !/NOT sitting|not sitting/i.test(trimmed) ||
        /reach back around his neck|arms locked around his neck/i.test(trimmed) ||
        /\bdoggy/i.test(trimmed))
    ) {
      // Stale Chair bent: — rebuild below.
    } else if (
      /^Piano oral:/i.test(trimmed) &&
      (!/four hands only/i.test(trimmed) ||
        !/kneeling ON the piano bench/i.test(trimmed) ||
        !/kneels BESIDE/i.test(trimmed) ||
        /bent OVER the piano|rear-entry|partner behind/i.test(trimmed))
    ) {
      // Stale Piano oral: — rebuild below.
    } else if (
      /^Cabinet drawer:/i.test(trimmed) &&
      (!/four hands only/i.test(trimmed) ||
        !/open drawer/i.test(trimmed) ||
        /\bdesk\b/i.test(trimmed) ||
        /\bdoggy/i.test(trimmed))
    ) {
      // Stale Cabinet drawer: — rebuild below.
    } else if (
      /^Behind:/i.test(trimmed) ||
      /^Chair bent:/i.test(trimmed) ||
      /^Piano oral:/i.test(trimmed) ||
      /^Cabinet drawer:/i.test(trimmed)
    ) {
      return trimmed.replace(/[ \t]{2,}/g, ' ').trim();
    } else {
      // Wall / chaise compact recipes.
      return trimmed.replace(/[ \t]{2,}/g, ' ').trim();
    }
  }

  const clarified = clarifyIntimateImageLanguage(trimmed);
  if (!clarified) {
    return clarified;
  }
  if (!intimateTextImpliesAct(clarified)) {
    return clarified;
  }
  let next = rewriteWallCollarboneContact(clarified);
  next = rewriteChaiseLowerContact(next);
  next = rewritePianoBenchOralContact(next);
  next = rewriteCabinetDrawerContact(next);
  next = rewriteChairBentContact(next);
  next = rewriteDoggyBentContact(next);
  const wallRecipe = /Rear wall press/i.test(next);
  const chaiseRecipe = /Chaise lower:/i.test(next);
  const chairRecipe = /^Chair bent:/i.test(next);
  const pianoOralRecipe = /^Piano oral:/i.test(next);
  const cabinetRecipe = /^Cabinet drawer:/i.test(next);
  const behindRecipe = /^Behind:/i.test(next) || /^Doggy:/i.test(next);
  const compactRecipe =
    wallRecipe || chaiseRecipe || chairRecipe || pianoOralRecipe || cabinetRecipe || behindRecipe;

  if (!compactRecipe) {
    const snofsCue = snofsPositionCueForText(next);
    if (snofsCue) {
      next = `${snofsCue}. ${next}`;
    }
  }

  if (
    !compactRecipe &&
    /\b(doggy|hands\s+and\s+knees|partner\s+behind|camera\s+from\s+behind|rear-entry)\b/i.test(
      next
    ) &&
    !/\b(partner|second\s+(?:person|adult)|behind\s+(?:her|him|them)|chest-to-back)\b/i.test(next)
  ) {
    next = `${next}, distinct adult partner behind the lead in rear-entry sex`;
  }
  // Literary wall/elevator presses often miss "against the wall" parsers — spell the stance.
  // Skip when a compact recipe already shipped (avoid bloat / false matches on pose-lock copy).
  if (!compactRecipe) {
    if (
      /\b(lean(?:s|ing)?\s+against|press(?:es|ed|ing)?\s+(?:her|him|them)\s+back|elevator).{0,80}\b(wall|elevator)\b/i.test(
        next
      ) ||
      (/\bagainst(?:\s+the)?(?:\s+[\w'-]+){0,3}\s+wall\b/i.test(next) &&
        !/when the beat is a wall press|wall press standing|standing wall press/i.test(next))
    ) {
      if (
        !/\bSTANDING upright|feet flat on the floor|partner behind pressing|SAME FACING/i.test(next)
      ) {
        next = `${next} STANDING upright sex against the wall: both adults on their feet (knees off the floor), lead's back flat to the wall, partner behind pressing in SAME FACING — not a face-to-face kiss or frontal hug.`;
      }
      if (!/\bSAME FACING|same facing|never turn into a face-to-face/i.test(next)) {
        next = `${next} Same facing only — partner stays behind her; do not rotate into a face-to-face kiss.`;
      }
    }
    if (
      /\bcups?\s+(?:her|his|their)\s+throat\b/i.test(next) ||
      /hand cups her throat from behind/i.test(next)
    ) {
      if (!/\bshe does not hold her own throat|lead does not grab/i.test(next)) {
        next = `${next} Partner's hand cups the lead's throat; she does not hold her own throat or jaw.`;
      }
    }
    if (
      /\bcollarbone\b/i.test(next) &&
      /\b(mouth|lick|neck|lips)\b/i.test(next) &&
      !/no mouth-to-mouth|never a mouth-to-mouth/i.test(next)
    ) {
      next = `${next} Mouths stay apart — partner lips on the back of her neck/collarbone only, never a mouth-to-mouth or face-to-face kiss.`;
    }
    if (
      /\b(sinks?\s+into|fingers?\s+(?:in|into)|hand\s+(?:in|between)|fingering\s+her\s+vagina)\b.{0,40}\b(vagina|core|clit|thighs?)\b/i.test(
        next
      ) ||
      /\b(vagina|wet\s+core)\b/i.test(next)
    ) {
      if (
        !/\bbetween (?:her|the lead'?s?) thighs|fingering her vagina|on genitals|front vagina|rubbing her clit|thumb rubbing\b/i.test(
          next
        )
      ) {
        next = `${next} Partner's other hand is between the lead's thighs / on genitals — not only on the waist or mirror.`;
      }
    }
    if (/\b(mirror|glass\s+doors?|neon|elevator)\b/i.test(next)) {
      if (!/\bKeep the named room mirrors|glass elevator|elevator cab/i.test(next)) {
        next = `${next} Keep mirrored walls and glass elevator doors with city neon visible — do not replace them with a plain metal box.`;
      }
    }
  }
  if (intimateTextDefaultsToNude(next) && !INTIMATE_NUDE_CUE.test(next)) {
    next = `${next}. ${INTIMATE_NUDE_DEFAULT}`;
  }
  // Compact wall/chaise/chair/doggy recipes already carry headcount / pose / contact — don't re-stack locks.
  if (!compactRecipe) {
    if (
      !/never twins|Two adults: Cast lead|no twin people|Exactly TWO adults|Exactly two adults/i.test(
        next
      )
    ) {
      next = `${next}. ${INTIMATE_DUO_LOCK}`;
    }
    if (
      !/Match the named pose|Bodies must match the described pose|Rear wall press|Chaise lower:|^Behind:|^Doggy:|^Chair bent:|^Piano oral:|^Cabinet drawer:/i.test(
        next
      )
    ) {
      next = `${next} ${INTIMATE_POSE_LOCK}`;
    }
    if (!/Cross-person touch|two separate bodies|no floating third hand/i.test(next)) {
      next = `${next} ${INTIMATE_CONTACT_LOCK}`;
    }
  }
  return next.replace(/[ \t]{2,}/g, ' ').trim();
}
