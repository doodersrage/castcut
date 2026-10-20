export type ParsedSettingHint = {
  raw: string;
  location: string | null;
  remainder: string;
  hasExplicitLocation: boolean;
};

const EXPLICIT_LOCATION =
  /\b(?:location|setting|place|scene|background|environment)\s*:\s*([^,;\n]+)/i;

const PREPOSITIONAL_LOCATION =
  /\b(?:in|at|on|inside|within|near|beside|under|overlooking|outside|through|along|against|from|into|onto|amid|among|beneath|beyond|across)\s+([^,;\n]+)/gi;

const SETTING_NOUN =
  /\b(?:rooftop|alley|street|beach|forest|jungle|desert|mountain|valley|canyon|cliff|coast|shore|harbor|dock|pier|warehouse|studio|bedroom|kitchen|hall|corridor|temple|church|cathedral|mosque|shrine|castle|palace|ruin|market|bazaar|station|platform|tunnel|bridge|garden|park|courtyard|plaza|square|diner|cafe|bar|pub|club|gym|dojo|library|museum|gallery|observatory|lighthouse|monastery|village|city|downtown|subway|metro|airport|hangar|bunker|factory|mill|farm|barn|field|meadow|swamp|bayou|river|lake|ocean|sea|cave|grotto|volcano|glacier|tundra|steppe|savanna|rainforest|greenhouse|conservatory|penthouse|loft|basement|attic|balcony|porch|veranda|terrace|stairwell|elevator|skyline|countryside|highway|roadside|trail|path|clearing|grove|orchard|vineyard|cemetery|arena|stadium|theater|stage|backlot|soundstage|laboratory|office|clinic|hospital|school|classroom|campus|hotel|lobby|suite|room|wasteland|junkyard|ship|boat|yacht|submarine|train|space station|moon base|colony|fort|barracks|prison|dungeon|crypt|aquarium|circus|tent|campsite|glade|fjord|lagoon|reef|atoll|marsh|wetland|bog|moor|heath|prairie|plateau|mesa|dune|oasis|riad|pagoda|hut|cabin|lodge|chalet|motel|inn|hostel|waterfront|boardwalk|promenade|canal|quarry|mine|refinery|yard|roof|tower|spire|dome|vault|nave|cloister|manor|estate|mansion|villa|cottage|bungalow|brownstone|tenement|shophouse|night market|food hall|arcade|mall|atrium|concourse|terminal|depot|cockpit|engine room|quarterdeck|spa|sauna|bathhouse|onsen|ryokan|archive|workshop|forge|apothecary|server room|planetarium|cistern|aqueduct|ruins|shipwreck|ice cave|salt flat|hot spring|geyser|caldera|lava field|ice shelf|crevasse|ridge|summit|pass|waterfall|rapids|mangrove|estuary|salt marsh|mudflat|tidal pool|slot canyon|badlands|karst|cenote|billabong|longhouse|yurt|igloo|bothy|ksar|medina|kasbah|dzong|stupa|torii|hanok|machiya)\b/i;

const GEOGRAPHIC_NAME =
  /\b(?:tokyo|kyoto|osaka|seoul|beijing|shanghai|hong kong|taipei|bangkok|singapore|mumbai|delhi|dubai|istanbul|cairo|london|paris|berlin|rome|milan|barcelona|madrid|lisbon|amsterdam|vienna|prague|warsaw|moscow|helsinki|stockholm|oslo|copenhagen|dublin|edinburgh|reykjavik|new york|los angeles|chicago|san francisco|seattle|miami|boston|austin|denver|nashville|new orleans|las vegas|phoenix|atlanta|toronto|vancouver|montreal|mexico city|buenos aires|rio de janeiro|sydney|melbourne|auckland|cape town|nairobi|marrakech|athens|budapest|santorini|bali|hawaii|iceland|patagonia|amazon|sahara|serengeti|antarctica|arctic|svalbard|scotland|ireland|provence|tuscany|amalfi|cappadocia|petra|wadi rum|machu picchu|galapagos|grand canyon|yosemite|yellowstone|banff|alps|himalaya|everest|fuji|kilimanjaro|norway|sweden|finland|denmark|germany|france|spain|portugal|italy|greece|turkey|egypt|morocco|kenya|ethiopia|vietnam|thailand|cambodia|laos|philippines|indonesia|malaysia|india|nepal|bhutan|sri lanka|pakistan|iran|israel|jordan|saudi arabia|uae|qatar|australia|new zealand|canada|usa|uk|england|wales|cornwall|yorkshire|lake district|pacific northwest|new england|deep south|bayou|everglades|mojave|sonoran|rockies|sierras|appalachia|midwest|southwest|caribbean|scandinavia|balkans|anatolia|andes|congo|namib|okavango|victoria falls|nile delta|ganges|mekong delta|danube|rhine valley|scottish highlands|faroe islands|lofoten|siberia|kamchatka|mongolia|tibet|hanoi|ho chi minh|manila|jakarta|kuala lumpur|colombo|kathmandu|thimphu|dhaka|karachi|tehran|beirut|amman|jerusalem|tel aviv|doha|riyadh|muscat|almaty|ulaanbaatar|vladivostok|quebec|havana|lima|bogota|santiago|cusco|lake titicaca|salar de uyuni|iguazu|pantanal|greenland|azores|madeira|canary islands|sicily|sardinia|corsica|brittany|normandy|bavaria|black forest|dolomites|zermatt|chamonix|interlaken|florence|venice|naples|pompeii|porto|dubrovnik|split|krakow|tallinn|riga|vilnius|kyiv|lviv|tbilisi|yerevan|baku|samarkand|goa|kerala|rajasthan|jaipur|varanasi|agra|munnar|hampi|sigiriya|maldives|zanzibar|ngorongoro|masai mara|kruger|sossusvlei|fes|chefchaouen|luxor|aswan|abu dhabi|medina|mecca|antalya|mykonos|rhodes|meteora|delphi|oia|fira)\b/i;

const AGE_ONLY =
  /^(?:\d{1,2}\s*(?:years?\s*old|yo|y\.o\.)|teen(?:age)?|elderly|middle-aged|young|old|aged|youthful|senior|child|kid|toddler|infant|in her twenties|in his twenties)$/i;

const SUBJECT_SCENE_CUE =
  /\b(?:woman|women|man|men|person|people|couple|duo|girl|boy|model|athlete|cyclist|runner|dressed|wearing|holding|competing|racing|portrait|subject|figure|character)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function looksLikeLocation(text: string): boolean {
  const value = text.trim();
  if (value.length < 3) {
    return false;
  }

  if (EXPLICIT_LOCATION.test(value)) {
    return true;
  }

  if (SETTING_NOUN.test(value) || GEOGRAPHIC_NAME.test(value)) {
    return true;
  }

  return value.split(/\s+/).length >= 3 && value.length >= 14;
}

function shouldTreatRawHintAsLocation(raw: string): boolean {
  if (AGE_ONLY.test(raw)) {
    return false;
  }

  if (SUBJECT_SCENE_CUE.test(raw)) {
    return false;
  }

  if (SETTING_NOUN.test(raw) || GEOGRAPHIC_NAME.test(raw)) {
    return true;
  }

  return looksLikeLocation(raw) && raw.split(/\s+/).length <= 6;
}

function stripExplicitPrefix(text: string): string | null {
  const match = text.match(EXPLICIT_LOCATION);
  return match?.[1]?.trim() ?? null;
}

function extractPrepositional(text: string): string | null {
  const matches = [...text.matchAll(PREPOSITIONAL_LOCATION)];
  if (matches.length === 0) {
    return null;
  }

  const last = matches[matches.length - 1]?.[1]?.trim();
  return last && looksLikeLocation(last) ? last : null;
}

function extractTrailingSegment(text: string): string | null {
  const segments = text
    .split(/[,;]/)
    .map(segment => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const last = segments[segments.length - 1]!;
  return looksLikeLocation(last) ? last : null;
}

export function extractLocationHint(text?: string): string | null {
  return parseSettingHint(text).location;
}

export function parseSettingHint(text?: string): ParsedSettingHint {
  const raw = text?.trim() ?? '';
  if (!raw) {
    return {
      raw,
      location: null,
      remainder: '',
      hasExplicitLocation: false,
    };
  }

  const explicit = stripExplicitPrefix(raw);
  if (explicit) {
    const remainder = raw
      .replace(EXPLICIT_LOCATION, '')
      .replace(/[,;]\s*$/, '')
      .trim();

    return {
      raw,
      location: explicit,
      remainder,
      hasExplicitLocation: true,
    };
  }

  const prepositional = extractPrepositional(raw);
  if (prepositional) {
    const remainder = raw
      .replace(
        new RegExp(
          `(?:\\b(?:in|at|on|inside|within|near|beside|under|overlooking|outside|through|along|against|from|into|onto|amid|among|beneath|beyond|across)\\s+)${escapeRegExp(prepositional)}`,
          'i'
        ),
        ''
      )
      .replace(/[,;]\s*[,;]/, ',')
      .replace(/^[,;\s]+|[,;\s]+$/g, '')
      .trim();

    return {
      raw,
      location: prepositional,
      remainder: remainder || raw,
      hasExplicitLocation: true,
    };
  }

  const trailing = extractTrailingSegment(raw);
  if (trailing) {
    const remainder = raw
      .slice(0, raw.lastIndexOf(trailing))
      .replace(/[,;\s]+$/, '')
      .trim();

    return {
      raw,
      location: trailing,
      remainder: remainder || raw,
      hasExplicitLocation: true,
    };
  }

  if (shouldTreatRawHintAsLocation(raw)) {
    return {
      raw,
      location: raw,
      remainder: '',
      hasExplicitLocation: true,
    };
  }

  return {
    raw,
    location: null,
    remainder: raw,
    hasExplicitLocation: false,
  };
}

export function buildMandatoryLocationBlock(location: string | null): string {
  if (!location?.trim()) {
    return '';
  }

  return [
    `MANDATORY SETTING (must match exactly): ${location.trim()}`,
    'Place the scene in this setting. Do not substitute a different location, city, or environment.',
  ].join('\n');
}
