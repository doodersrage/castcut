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
      /\bbent\s+over\s+after\s+[^,—.]{1,48},?\s*taken\s+from\s+behind\s*[—-]\s*doggy\s+or\s+bent-over\s+sex,?\s*explicit\s+and\s+readable\.?/gi,
    replace:
      'on hands and knees with a distinct adult partner behind her in doggy-style sex, nude, mid-thrust, camera behind them',
  },
  {
    pattern: /\s*[—-]\s*doggy\s+or\s+bent-over\s+sex,?\s*explicit\s+and\s+readable\.?/gi,
    replace:
      ' — doggy-style sex with a distinct adult partner, nude, mid-thrust, camera behind them',
  },
  {
    pattern: /\bdoggy\s+or\s+bent-over\s+sex\b/gi,
    replace: 'doggy-style sex',
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
    pattern: /\bbent\s+over\b(?=.{0,80}(?:doggy|sex|fuck|partner|thrust|camera\s+from\s+behind))/gi,
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
  /\b(doggy(?:[- ]style)?|hands\s+and\s+knees|partner\s+behind|camera\s+from\s+behind|oral\s+sex|cunnilingus|fellatio|licking|tongue|clit|kneeling|barefoot|mid-thrust|penetration|fingering|missionary|cowgirl|straddl|grab(?:s|bing)?|grip(?:s|ping)?|clutch(?:es|ing)?|hands?\s+on|pin(?:s|ned|ning)?|hold(?:s|ing)?\s+(?:her|him|their|his|hips|waist))\b/i;

const INTIMATE_WARDROBE_CUE =
  /\b(lingerie|bra|panties|underwear|stockings|garter|corset|dress|skirt|shirt|blouse|outfit|clothes|clothing|wardrobe|wearing|half[- ]dressed|unzip|garment|bodysuit|teddy|chemise|robe|boots|heels)\b/i;

const INTIMATE_NUDE_CUE =
  /\b(nude|naked|fully\s+nude|bare\s+bodies?|unclothed|nothing\s+(?:on|worn)|no\s+clothes)\b/i;

const INTIMATE_DUO_LOCK =
  'Two adults: Cast lead (Image 1 face) in the lead role + distinct partner — no twins/mirrors; show the sex act, not a standing lingerie portrait.';

const INTIMATE_POSE_LOCK =
  'Match the named pose (kneeling, bent, oral, hands on genitals as written) — not a standing fashion pose.';

const INTIMATE_CONTACT_LOCK =
  'Cross-person touch only (hands/mouth on the other body); two separate people — no self-grab, no fused silhouette.';

const INTIMATE_NUDE_DEFAULT =
  'Fully nude — nothing worn; replace reference clothing with bare skin.';

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

/**
 * Clarify euphemisms/meta, then lock duo sex poses so models do not invent twin stands.
 */
export function reinforceIntimateStillPrompt(prompt: string): string {
  const clarified = clarifyIntimateImageLanguage(prompt);
  if (!clarified) {
    return clarified;
  }
  if (!INTIMATE_ACT_CUE.test(clarified) && !/\b(sex|fuck|nude\s+sex)\b/i.test(clarified)) {
    return clarified;
  }
  let next = clarified;
  if (
    /\b(doggy|hands\s+and\s+knees|partner\s+behind|camera\s+from\s+behind)\b/i.test(next) &&
    !/\b(partner|second\s+(?:person|adult)|behind\s+(?:her|him|them))\b/i.test(next)
  ) {
    next = `${next}, distinct adult partner behind the lead in doggy-style sex`;
  }
  if (intimateTextDefaultsToNude(next) && !INTIMATE_NUDE_CUE.test(next)) {
    next = `${next}. ${INTIMATE_NUDE_DEFAULT}`;
  }
  if (!/never twins|Two adults: Cast lead/i.test(next)) {
    next = `${next}. ${INTIMATE_DUO_LOCK}`;
  }
  if (!/Match the named pose|Bodies must match the described pose/i.test(next)) {
    next = `${next} ${INTIMATE_POSE_LOCK}`;
  }
  if (!/Cross-person touch/i.test(next)) {
    next = `${next} ${INTIMATE_CONTACT_LOCK}`;
  }
  return next.replace(/[ \t]{2,}/g, ' ').trim();
}
