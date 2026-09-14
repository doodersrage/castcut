import { composeActionLocation, composeSceneLocation } from './location-composer';
import { ALL_EXTRA_SCENE_LOCATIONS } from '../location-catalog-batches';
import { parseSettingHint } from '../hint-location';
import { parsePeopleConstraint } from '../distinct-people';
import { inferAthleticSport } from '../athletic-sport-profiles';
import {
  buildSportPoseIncompatibilities,
  getSportDuoCompetitionLine,
  pickSceneLocationForSportHints,
  pickSportActionPose,
  pickSportActionSetting,
} from '../athletic-sport-actions';
import { promptContainsAvoidedTokensFromList } from '../avoidance-options';
import { parseCharacterHints, pickCharacterIdentitySeed } from '../character-hints';
import { pickCharacterSubject } from '../variation-seed';

const LOCATIONS = [
  'abandoned observatory on a windy cliff',
  'rain-slick cyberpunk alley with neon reflections',
  'sunlit greenhouse full of overgrown tropical plants',
  'marble train station at midnight',
  'desert roadside diner with cracked vinyl booths',
  'floating market under paper lanterns',
  'gothic library with spiral staircases and dust motes',
  'industrial warehouse converted into an art studio',
  'misty pine forest after rainfall',
  'rooftop garden overlooking a sprawling city',
  'underwater research tunnel with blue-green light',
  'snow-covered mountain lodge porch',
  'retro arcade with buzzing cabinets and carpet patterns',
  'cliffside monastery above cloud cover',
  'flooded cathedral nave with light through stained glass',
  'busy night market in a narrow street',
  'salt flats mirroring the sky at dawn',
  'Victorian greenhouse conservatory',
  'abandoned amusement park carousel',
  'canal-side café in a European old town',
  'bamboo forest path at pale dawn',
  'volcanic black sand beach with driftwood',
  'art deco hotel lobby after hours',
  'submarine control room with instrument glow',
  'Mongolian steppe under a vast open sky',
  'Venetian bridge shrouded in morning fog',
  'bioluminescent cave pool with stone reflections',
  'brutalist apartment stairwell with raw concrete',
  'Thai temple courtyard with mossy statuary',
  'derelict drive-in theater screen at dusk',
  'high desert badlands with eroded rock spires',
  'rainforest canopy walkway above mist',
  'Icelandic geothermal steam field',
  'Moroccan riad courtyard with a tiled fountain',
  'Arctic research outpost in driving snow',
  'Hong Kong neon stairwell at night',
  'prairie homestead windmill at sunset',
  'cave mouth behind a waterfall veil',
  'orbital station observation deck above Earth',
  'Louisiana bayou with cypress knees and still water',
  'Edo-period wooden street after rain',
  'crystal ice cave with blue light refraction',
  'abandoned subway platform with flickering lights',
  'lavender field on a Provence hillside',
  'sandstone slot canyon with a single sunbeam',
  'floating dock on a mirror-still alpine lake',
  'Saharan ksar fortress courtyard at noon',
  'Scottish highland bothy in horizontal rain',
  'tropical reef shallows with clear turquoise water',
  'mid-century motel pool at twilight',
  'cherry blossom tunnel over an empty path',
  'copper mine tunnel with ore glint on the walls',
  'Persian palace hall with mirrored mosaics',
  'redwood grove with cathedral light shafts',
  'Cappadocia cave dwelling carved from tuff stone',
  'Singapore shophouse five-foot way in monsoon rain',
  'Patagonian fjord cliff in low cloud',
  'Byzantine cistern with columns and rippling water',
  'Australian outback billabong at golden hour',
  'Hanok village lane with unlit paper lanterns',
  'marble quarry pit with suspended cable lines',
  'Aztec pyramid summit above jungle canopy',
  'Finnish sauna lake dock in blue hour',
  'neon-lit pachinko parlor after closing',
  'terraced rice paddies reflecting cloud banks',
  'Caribbean hurricane wreck pier at dawn',
  'Roman aqueduct arch framing distant hills',
  'Berlin bunker gallery with rough concrete walls',
  'Himalayan prayer-flag ridge in thin air',
  'Mississippi steamboat deck in river fog',
  'Maltese limestone cliff village alley',
  'Siberian taiga clearing with frost smoke',
  'Andalusian white village steps at siesta hour',
  'Manhattan fire escape in summer heat haze',
  'Namibian dead-tree pan under a starry sky',
  'Kyoto moss temple garden after rain',
  'Bolivian salt hotel interior with hex tiles',
  'Mezquita forest of columns in Cordoba',
  'New Orleans shotgun house porch with ferns',
  'Uyuni mirror flats at cloudless sunrise',
  'Greek island whitewashed steps to the sea',
  'Canadian boreal lake cabin dock in autumn',
  'Ethiopian rock-hewn church courtyard',
  'Shanghai art deco lane with laundry lines',
  'Atacama observatory pad under the Milky Way',
  'Irish coastal ruin on a sheep-cropped headland',
  'Mexican cenote opening with vine curtains',
  'Swiss alpine meadow hut with distant cowbells',
  'Havana classic-car garage with peeling paint',
  'Danish windmill interior with gear shadows',
  'Okinawan limestone grotto with turquoise water',
  'Brooklyn brownstone stoop in late October',
  'Peruvian cloud forest canopy research platform',
  'Tuscan cypress lane leading to a distant villa',
  'Warsaw metro mezzanine in sodium light',
  'Santorini caldera steps with blue domes',
  'Mumbai colonial veranda with monsoon sheets',
  'Alaskan fishing skiff deck in silver drizzle',
  'Czech glassblowing workshop with molten glow',
  'Quebec ice hotel suite with carved walls',
  'Serengeti kopje rock outcrop at first light',
  'Seoul hanok alley with steam from a vent',
  'Bali rice terrace overlook in morning mist',
  'Detroit art-deco train station concourse, empty',
  'Galapagos lava tunnel with iguana trails',
  'Lisbon miradouro above tile roofs',
  'Sydney sandstone cliff walk above crashing surf',
  'Bhutan dzong fortress courtyard in prayer-flag wind',
  'Stockholm archipelago granite skerry at midsummer',
  'Yellowstone hot spring boardwalk with mineral steam',
  'Hanoi train-track alley between close houses',
  'Antarctic research tent flap open to white expanse',
  'Napa valley barrel room with oak and shadow',
  'Marrakech riad roof terrace under star cloth',
  'Tbilisi balconied street in warm evening air',
  'Utah hoodoo amphitheater at blood-red sunset',
  'Reykjavik harbor hut with painted corrugated steel',
  'Vermont covered bridge interior with slatted light',
  'Jordan Wadi Rum red sand camp at blue hour',
  'Norwegian stave church timber interior',
  'Madagascar baobab alley at golden dust',
  'Montana ghost-town saloon with swinging doors',
  'Estonian bog boardwalk through sphagnum mist',
  'Bavarian alm hut porch above cloud inversion',
  'Oaxaca mezcalería agave pit at firelight',
  'Faroe Islands grass-roof village lane in drizzle',
  'Pennsylvania Amish barn loft with hay shafts',
  'Mongolian ger interior with central stove glow',
  'Borneo longhouse veranda over the river',
  'New Mexico adobe church bell wall at dusk',
  'Rio favela mural stair in afternoon shade',
  'Faroe sea cliff edge with puffin nests below',
  'Scottish whisky cooperage with stacked casks',
  'Philippine rice granary hut on stilts',
  'Krakow cloth hall arcade before opening',
  'Kenyan savanna acacia silhouette at dusk',
  'Chilean Patagonia estancia sheep-shearing shed',
  'Hawaii lava tube entrance with fern fringe',
  'Prague astronomical clock tower stair',
  'Cologne cathedral nave side chapel',
  'Montana open-pit mine overlook at dawn',
  'Iowa cornfield lane at harvest moonrise',
  'Botswana okavango delta mokoro channel',
  'Guatemalan highland market square before dawn',
  'Luxor temple colonnade at first quiet hour',
  'Cape Town cable car station above the city bowl',
  'Sri Lankan tea hill station veranda',
  'Scottish ferry deck crossing a grey firth',
  'Rwandan mountain tea plantation rows',
  'Manila Spanish colonial fort rampart',
  'Oaxaca zocalo arcade in late afternoon shade',
  'Svalbard coal-mining settlement in polar night',
  'Maori carved meeting house marae at dusk',
  'Saigon motorbike garage with tool walls',
  'Zanzibar spice merchant storage loft',
  'Croatian limestone karst field with sinkholes',
  'Penang shophouse clan jetty at low tide',
  'Svalbard seed vault approach tunnel',
  'Tasmanian temperate rainforest fern gully',
  'Namib desert gravel plain under heat shimmer',
  'Georgian wine qvevri cellar with earthen floor',
  'Istanbul cistern-style bathhouse with dome light',
  'Lagos lagoon stilt walkway at low tide',
  'Mumbai dhobi ghat stone wash pens',
  'Cairo Khan el-Khalili covered lane',
  'Addis Ababa hillside corrugated homes stair',
  'Accra Jamestown fishing harbor pier',
  'Dakar African Renaissance monument plaza base',
  'Kigali hilltop memorial amphitheater steps',
  'Lusaka dry-season dust road veranda',
  'Windhoek colonial railway station platform',
  'Maputo iron house veranda rust',
  'Antananarivo rice terrace hillside path',
  'Reunion cirque caldera viewpoint rail',
  'Mauritius sugar estate chimney ruin',
  'Seychelles granite boulder cove shade',
  'Comoros volcanic black beach palm fringe',
  'Djibouti salt lake mirage shore',
  'Asmara art deco cinema foyer',
  'Harare jacaranda-lined avenue bench',
  'Gaborone mall parking rooftop at dusk',
  'Douala Wouri river ferry ramp',
  'Yaoundé hilltop cathedral esplanade',
  'Bamako Niger river corniche steps',
  'Ouagadougou laterite compound courtyard',
  'Niamey mosque minaret shadow lane',
  "N'Djamena Chari riverbank clay oven row",
  'Bangui Oubangui river ferry slip',
  'Kinshasa rapids overlook spray rail',
  'Brazzaville Congo river twin city pier',
  'Libreville seafront oil palm promenade',
  'Malabo Bioko island volcanic beach path',
  'Monrovia red laterite coast road bend',
  'Freetown peninsula cotton tree square edge',
  'Conakry island market tin roof aisle',
  'Bissau colonial fort cannon ramp',
  'Praia volcanic cliff settlement stair',
  'São Tomé cocoa drying rack plantation',
  'Luanda bay fortress rampart walk',
  'Mbabane Ezulwini valley mist bridge',
  'Maseru sandstone plateau pony trail',
  'Gaborone dam wall service road',
  'Victoria Falls spray forest gorge bridge',
  'Okavango delta mokoro poling channel',
  'Etosha pan mirage waterhole edge',
  'Sossusvlei dead camelthorn pan dune foot',
  'Fish River Canyon lookout rail',
  'Table Mountain cloud tablecloth edge',
  'Drakensberg basalt amphitheater stream',
  'Kruger granite kopje shade tree base',
  'Zanzibar Stone Town carved door alcove',
  'Lamu dhow harbor morning tide',
  'Diani beach coral rock pool shelf',
  'Lalibela rock church trench passage',
  'Axum obelisk field at dust haze',
  'Gondar castle compound empty courtyard',
  'Simien escarpment gelada cliff ledge',
  'Danakil sulfur salt formation boardwalk',
  'Socotra dragon blood tree grove',
  'Petra Siq canyon narrow bend',
  'Wadi Rum Lawrence spring rock shade',
  'Dead Sea salt crust shelf edge',
  'Jerash Roman oval plaza colonnade',
  'Byblos harbor Crusader wall base',
  "Ba'albek stone block platform",
  'Palmyra colonnade desert wind',
  'Cappadocia underground city vent shaft',
  'Pamukkale travertine terrace pool rim',
  'Ephesus library facade steps',
  'Meteora monastery cable basket landing',
  'Delphi oracle terrace mountain view',
  'Santorini Oia windmill path bend',
  'Mykonos whitewash alley shadow strip',
  'Crete Samaria gorge stream crossing',
  'Rhodes medieval moat walk',
  'Corfu olive press stone floor',
  'Sardinia nuraghe stone corridor',
  'Sicily Aeolian island black beach',
  'Malta Blue Grotto boat cave mouth',
  'Cyprus Troodos pine chapel yard',
  'Split Diocletian palace substructure hall',
  'Dubrovnik city wall bastion corner',
  'Plitvice waterfall wooden footbridge',
  'Mostar old bridge cobble approach',
  'Sarajevo bazaar copper workshop lane',
  'Belgrade fortress Danube confluence wall',
  'Budapest thermal bath dome pool',
  'Bratislava castle rampart river view',
  'Ljubljana triple bridge embankment',
  'Zagreb upper town cannon lane',
  'Tirana pyramid interior concrete ramp',
  'Skopje stone bridge Vardar mist',
  'Pristina NEWBORN monument square',
  'Podgorica Moraca river confluence park',
  'Kotor fjord switchback road pullout',
  'Transfagarasan road tunnel mouth',
  'Bran castle forest approach path',
  'Sighisoara clock tower stair',
  'Viscri fortified church yard',
  'Maramures wooden church gate',
  'Chernobyl exclusion zone ferris wheel base',
  'Pripyat swimming pool diving board',
  'Baikonur launch pad service tower foot',
  'Kamchatka valley of geysers boardwalk',
  'Lake Baikal ice pressure ridge shore',
  'Altai kurgan burial mound steppe',
  'Yakutsk permafrost research tunnel mouth',
  'Vladivostok Golden Horn bay pier',
  'Sakhalin fog lighthouse reef walk',
  'Kuril island volcanic beach steam',
  'Jeju haenyeo diving rock shelf',
  'Busan Gamcheon culture village stair',
  'Gyeongju burial mound park path',
  'DMZ observation binocular rail',
  'Taipei Jiufen lantern alley mist',
  'Taroko gorge marble cliff tunnel mouth',
  'Sun Moon Lake pier morning stillness',
  'Penghu basalt column coast shelf',
  'Kinmen tunnel entrance camouflage net',
  'Macau Ruins of St Paul stair',
  'Hong Kong Victoria Peak tram terminus',
  'Guangzhou shamian colonial colonnade',
  'Guilin karst river bamboo raft dock',
  'Zhangjiajie glass bridge overlook',
  'Huangshan granite peak stair cloud sea',
  'Lijiang old town canal stone bridge',
  'Shangri-La Tibetan prayer wheel court',
  'Lhasa potala palace approach stair',
  'Everest base camp prayer flag line',
  "Bhutan tiger's nest cliff approach bend",
  'Kathmandu durbar square temple plinth',
  'Pokhara lake Phewa boat dock mist',
  'Chitwan riverbank rhino wallow edge',
  'Varanasi ghat stone step river mist',
  'Jaipur amber fort mirror hall',
  'Agra mausoleum garden reflecting pool',
  'Jodhpur blue city rooftop parapet',
  'Kerala backwater houseboat deck',
  'Goa laterite church yard monsoon',
  'Hampi boulder ruin river coracle shore',
  'Mumbai gateway arch sea spray',
  'Colombo galle face green promenade',
  'Maldives overwater bungalow plank walk',
  'Boracay white beach palm shadow line',
  'Palawan underground river mouth',
  'Banaue rice terrace mud wall path',
  'Ifugao wood carving village porch',
  'Angkor wat outer gallery colonnade',
  'Ta Prohm silk-cotton root temple wall',
  'Phnom Penh royal palace silver floor',
  'Luang Prabang alms route morning shade',
  'Vang Vieng karst river tube landing',
  'Bagan temple plain hot air shadow',
  'Inle Lake leg-rower channel garden',
  'Mandalay teak bridge sunset haze',
  'Yangon shwedagon pagoda mirror tile',
  'Chiang Mai moat corner gate shade',
  'Ayutthaya brick prang field grass',
  'Phuket cliff viewpoint monsoon cloud',
  'Komodo island dragon trail dust',
  'Raja Ampat reef drop-off pier',
  'Uluru base walk cave overhang',
  'Kakadu rock art shelter ochre wall',
  'Great Barrier Reef pontoon snorkel deck',
  'Twelve Apostles limestone stack lookout',
  'Blue Mountains three sisters fog rail',
  'Fraser Island lake McKenzie dune edge',
  'Milford Sound waterfall cliff face',
  'Rotorua geothermal mud pool boardwalk',
  'Waitomo glowworm cave boat silence',
  'Aoraki mount cook hooker valley bridge',
  'Abel Tasman golden sand estuary',
  'Fiordland kepler track moss bridge',
  'Christchurch cardboard cathedral interior',
  'Wellington cable car hilltop wind',
  'Auckland sky tower shadow harbor',
  'Chatham Islands basalt coast stack',
  'Easter Island moai quarry slope',
  'Atacama ALMA antenna array pad',
  'Easter Island Anakena palm beach',
  'Torres del Paine granite horn base',
  'Iguazu falls mist catwalk bend',
  'Salar de Uyuni train cemetery rust',
  'Machu Picchu terrace wall mist',
  'Colca canyon condor cross overlook',
  'Amazon canopy walkway rope bridge',
  'Pantanal wetland hyacinth channel',
  'Lençóis Maranhenses dune lagoon mirror',
  'Fernando de Noronha cliff dive rock',
  'Rio sugarloaf cable car summit deck',
  'Salvador pelourinho cobble incline',
  'Cartagena walled city cannon ramp',
  'Medellín metro cable car station',
  'Quito equator monument plaza',
  'Galapagos tortoise reserve trail dust',
  'Cusco inca stone wall alley',
  'Lake Titicaca reed island edge',
  'Patagonia Perito Moreno glacier face',
  'Tierra del Fuego end-of-world sign post',
  'Antarctica emperor penguin ice shelf edge camp',
  'South Georgia whaling station rust bay',
  'Falkland islands peat stream crossing',
  'Greenland ice sheet meltwater channel',
  'Iceland plane wreck black sand surround',
  'Faroe grass roof churchyard gate',
  'Lofoten cod drying rack rack line',
  'North Cape globe monument wind',
  'Svalbard global seed vault frost tunnel',
  'Lapland aurora teepee fire circle edge',
  'Kola peninsula abandoned mining town street',
  'Kamchatka brown bear river ford overlook',
  'Lake Onega Kizhi pogost wooden fence',
  'Solovetsky monastery stone wall gate',
  'Trans-Siberian platform birch stop',
  'Aral Sea ship graveyard rust hull',
  'Caspian oil platform service helipad',
  'Caucasus mountain pass prayer stone pile',
  'Gobustan mud volcano bubble field',
  'Yerevan cascade complex stone steps',
  'Tbilisi sulfur bath dome roof steam',
  'Baku flame towers plaza night',
  'Iranian qanat underground access stair',
  'Persepolis bull capital column base',
  'Isfahan mosque tile iwan shade',
  'Shiraz pink mosque stained glass floor',
  'Yazd windcatcher alley upward draft',
  'Kashan fin garden pavilion pool',
  'Cappadocia fairy chimney cave mouth',
  'Goreme open-air museum rock church',
  'Mount Ararat foothill monastery view',
  'Van lake akdamar church island pier',
  'Sumela monastery cliff face terrace',
  'Pamukkale cotton castle travertine lip',
  'Ephesus terrace house mosaic room',
  'Troy archaeological trench wall',
  'Gallipoli ANZAC cove cliff path',
  'Cappadocia hot air balloon launch field',
];

function normalizeLocationKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

const ALL_LOCATIONS: string[] = (() => {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const location of [...LOCATIONS, ...ALL_EXTRA_SCENE_LOCATIONS]) {
    const key = normalizeLocationKey(location);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(location);
  }

  return merged;
})();

const SUBJECTS = [
  'a street musician tuning a worn guitar',
  'a courier with a reflective jacket and scuffed boots',
  'a chef plating food under heat lamps',
  'a diver checking equipment beside a dock',
  'a painter mixing colors on a stained palette',
  'a botanist examining a strange flower',
  'a mechanic leaning over an open engine',
  'a dancer stretching before rehearsal',
  'a sailor coiling rope on a weathered deck',
  'an archivist carrying a stack of old maps',
  'a photographer adjusting a tripod in low light',
  'a fisherman mending nets on a wooden pier',
  'a baker pulling trays from a brick oven',
  'a teacher writing equations on a chalkboard',
  'a nurse reviewing a chart under fluorescent light',
  'a carpenter measuring a beam with a pencil behind one ear',
  'a florist arranging stems in a zinc bucket',
  'a taxi driver waiting at a rain-streaked curb',
  'a skateboarder resting one foot on a battered board',
  'a hiker tightening pack straps at a trail marker',
  'a beekeeper lifting a honey frame from a hive',
  'a blacksmith striking glowing metal on an anvil',
  'a potter centering clay on a spinning wheel',
  'a tailor pinning muslin on a dress form',
  'a violinist rosining a bow before tuning',
  'a barista steaming milk with practiced wrist motion',
  'a librarian shelving a stack of returned books',
  'a firefighter checking a helmet and oxygen gauge',
  'a sculptor chiseling fine detail into pale stone',
  'an astronomer aligning a telescope toward a clear patch of sky',
  'a stonemason fitting a block with a wooden mallet',
  'a shepherd leaning on a crook above a grassy slope',
  'a clockmaker assembling tiny brass gears under a lamp',
  'a glassblower gathering molten glass on a pipe',
  'a rancher resting gloved hands on a fence post',
  'a midwife washing hands at a porcelain basin',
  'a puppeteer adjusting marionette strings overhead',
  'a cartographer unrolling a creased chart on a table',
  'a jeweler setting a stone under a magnifying loupe',
  'a watch repairer tweezing a spring into place',
  'a bookbinder pressing fresh glue along a spine',
  'a falconer adjusting a leather jess on a perched bird',
  'a sommelier decanting wine into a wide glass',
  'a tattoo artist wiping ink from a fresh line work',
  'a park ranger marking a trail sign with a hammer',
  'a midwinter ice cutter scoring a frozen canal surface',
  'a street vendor flipping skewers over coals',
  'a ceramicist trimming a bowl with a wire loop',
  'a paramedic restocking a kit in an open ambulance bay',
  'a mime applying white base makeup at a mirror',
  'a knitter working by the light of a single bulb',
  'a stone carver brushing dust from a relief panel',
  'a harpist tuning pegs before a quiet performance',
  'a dockworker securing a crate with rope and hooks',
  'a muralist stepping back to judge a fresh wall section',
  'a tea master whisking matcha in a ceramic bowl',
  'a locksmith filing a key at a cluttered bench',
  'a mountain guide checking carabiners on a harness',
  'a weaver passing a shuttle through taut warp threads',
  'a cobbler hammering a heel on a wooden last',
  'a field biologist tagging a specimen jar',
  'a lighthouse keeper polishing the lamp glass',
  'a rodeo rider tightening glove straps near the chutes',
  'a sushi chef slicing fish with a long steel blade',
  'a stained-glass artisan leading a solder seam',
  'a busker assembling a one-man band rig',
  'a stone gardener raking patterns into gravel',
  'a hot-air balloon pilot checking burner valves',
  'a war correspondent typing notes beside a satchel',
  'a perfumer blotting a test strip on a wrist',
  'a crane operator eating lunch in a cab high above the ground',
  'a ice-cream cart vendor ringing a bell on an empty plaza',
  'a puppet maker carving a wooden head at a workbench',
  'a river guide testing current depth with a pole',
  'a choir director raising a baton before an empty hall',
  'a stone letter cutter chasing serif edges in slate',
  'a kite maker tying bridle lines on a bright frame',
  'a night watchman making rounds with a lantern',
  'a seed collector sorting envelopes in a greenhouse shade',
  'a sand sculptor smoothing a tower with a trowel',
  'a gondolier tying a boat to a mossy post',
  'a chess player studying a board alone at a park table',
  'a soap maker cutting a loaf into bars on parchment',
  'a mountain rescuer coiling rope beside a cliff edge',
  'a harpoon thrower practicing form on an empty quay',
  'a papermaker lifting a wet sheet from a vat',
  'a stone well digger hauling up a bucket on a rope',
  'a lantern maker applying rice paper to bamboo ribs',
  'a spice merchant grinding pods in a mortar',
  'a bridge painter suspended in a harness over water',
  'a mushroom forager kneeling beside a log with a knife',
  'a calligrapher dipping a brush into fresh ink',
  'a stone lighthouse mechanic greasing a rotating gear',
  'a kite surfer checking lines on an empty beach',
  'a book restorer flattening a warped page under glass',
  'a snow sculptor shaping a block with a chainsaw',
  'a night fisherman casting from a rocky point',
  'a harp maker shaving a soundboard with a plane',
  'a stone terrace farmer tying grape vines to wire',
  'a clock tower caretaker winding a heavy weight chain',
  'a desert ranger reading tracks in fine sand',
  'a violin maker applying varnish with a soft cloth',
  'a rooftop beekeeper smoking a hive at dusk',
  'a stone quarry worker marking a cut line with chalk',
  'a lantern-lit storyteller arranging props on a small stage',
  'a river ferry captain steering with one hand on the wheel',
  'a mosaic artist setting tesserae into wet cement',
  'a mountain monk sweeping steps at dawn',
  'a glass harp player running wet fingers along rimmed bowls',
  'a stone bridge keeper dropping a measuring chain into water',
  'a night market fortune teller shuffling worn cards',
  'a field archaeologist brushing soil from pottery shards',
  'a rope maker twisting fibers on a long walk',
  'a cloud watcher recording notes on a windy ridge',
  'a stone miller adjusting the grind between two wheels',
  'a harbor pilot boarding a ladder from a launch',
  'a kite fisher reeling line on an empty pier',
  'a candle maker dipping wicks into melted wax',
  'a stone terrace worker stacking dry-wall rocks',
  'a night train conductor checking tickets under a platform lamp',
  'a sand painter pouring colored grains through a funnel',
  "a stone carver's apprentice sweeping marble dust",
  'a rooftop gardener pruning herbs in wooden boxes',
  'a river stone skipper searching for a flat piece',
  'a harp tuner plucking strings and listening closely',
  'a stone well wisher dropping a coin into dark water',
  'a night baker scoring loaves before the first oven load',
  'a field meteorologist releasing a weather balloon',
  'a stone steps sweeper brushing leaves from worn treads',
  'a lantern repairer replacing a cracked glass pane',
  'a mountain pass trader unpacking bundles on a mule',
  'a glass net float collector sorting spheres on a dock',
  'a stone circle docent pointing at lichen patterns',
  'a night swimmer toweling off beside an empty pool',
  'a field recorder holding a microphone toward distant birds',
  'a stone bench carver testing smoothness with a palm',
  'a river stone balancer stacking rocks in still water',
  'a kite festival judge squinting at a distant speck',
  'a stone wall mason tapping the final capstone level',
];

const CHARACTER_POSES = [
  'standing with relaxed contrapposto',
  'seated on a simple wooden chair',
  'leaning against a plain wall',
  'kneeling on worn floorboards',
  'captured mid-step on empty pavement',
  'arms crossed with level shoulders',
  'looking over one shoulder',
  'hands resting in lap',
  'standing before a workbench',
  'perched on a low crate',
  'seated on stone steps with elbows on knees',
  'standing in a doorway with one hand on the frame',
  'crouched examining something on the ground',
  'leaning on a railing overlooking the scene',
  'seated on a windowsill with knees drawn up',
  'standing with weight on one hip, hand in pocket',
  'reclining on worn upholstery with one arm draped',
  'standing at a counter with both palms flat',
  'kneeling on one knee with upright posture',
  'seated cross-legged on a woven mat',
  'standing with back to camera, head turned',
  'perched on a bollard or post',
  'leaning into a corner with shoulders against walls',
  'standing in shallow water with rolled trousers',
  'seated on a crate with chin resting on fist',
];

const CHARACTER_ACTION_POSES = [
  'sprinting across wet pavement with forward lean',
  'leaping over a low barrier, knees tucked mid-air',
  'ducking under a hanging beam at full speed',
  'spinning with arms extended and fabric whipping outward',
  'climbing a rusted ladder, one boot finding the next rung',
  'sliding to a stop on gravel, dust kicking up behind',
  'drawing a bow at full draw, shoulders twisted with tension',
  'vaulting a railing in one continuous motion',
  'diving sideways with arms shielding the face',
  'charging uphill with clenched fists and driving stride',
  'landing hard from a jump, knees bent to absorb impact',
  'reaching desperately for a ledge, fingers stretched',
  'parkour wall-run with one foot pushing off brick',
  'surfacing from water with droplets flying off hair',
  'skidding on wet tile with arms windmilling for balance',
  'hurling a spear or javelin with full body rotation',
  'cartwheeling through shallow surf with spray trailing',
  'mounting a horse in one fluid swing',
  'breaking through a paper door with shoulder forward',
  'rappelling down a rope with boots pushing off stone',
  'kicking through a shallow wave at shin depth',
  'somersaulting over a hay bale with tucked form',
  'sprinting up stadium steps two at a time',
  'wrestling a heavy sack onto a shoulder mid-stride',
  'balancing on a moving train coupling between cars',
  'throwing a punch with hip and shoulder fully committed',
  'backflipping off a dock into open water',
  'crawling under barbed wire with elbows scraping earth',
  'snowboarding carve with powder spraying from the edge',
  'swinging on a rope over a gap between buildings',
];

const ACTION_POSE_INCOMPATIBILITIES = buildSportPoseIncompatibilities();

function pickCharacterActionPose(hints?: string): string {
  const sport = inferAthleticSport(hints);
  if (sport) {
    return pickSportActionPose(sport, hints);
  }

  const normalized = hints?.trim() ?? '';
  const eligible = CHARACTER_ACTION_POSES.filter(pose => {
    for (const rule of ACTION_POSE_INCOMPATIBILITIES) {
      if (rule.subject.test(normalized) && rule.incompatiblePose.test(pose)) {
        return false;
      }
    }
    return true;
  });

  return pick(eligible.length > 0 ? eligible : CHARACTER_ACTION_POSES);
}

const CHARACTER_ACTION_SETTINGS = [
  'a wind-swept rooftop with loose papers and fabric in the air',
  'a rain-soaked alley with puddle splashes and neon reflections',
  'a dusty warehouse with sunbeams and floating particles',
  'a forest trail with kicked leaves and broken branches',
  'a crumbling stairwell with falling plaster dust',
  'a rocky shoreline with spray and wet stone',
  'a narrow bridge in high wind with cables vibrating',
  'an industrial catwalk above spinning machinery',
  'a flooded corridor with water surging around boots',
  'a cliff edge with grass bending in gusts',
  'a metro escalator descending in blurred motion',
  'a sand dune ridge with sliding footprints behind',
  'a hayloft with dust motes and an open roof beam',
  'a zipline approach over a jungle canopy gap',
  'an ice floe edge with splintering crystals underfoot',
  'a smoke-filled doorway with figure emerging',
  'a mountain switchback road mid-motorcycle lean',
  'a parkour line across urban rooftops at dawn',
  'an empty bullring sand arena before gates open',
  'whitewater rapids on a narrow kayak line',
  'a dojo floor with a board snapping mid-strike',
  'shallow surf with a galloping horse throwing spray',
  'a slackline stretched over a canyon gap',
  'a ski slope mogul field mid-turn with snow spray',
  'a construction crane cab swaying at height',
  'an abandoned roller coaster climb at the apex',
  'a storm pier with waves crashing over the rail',
  'a silk road canyon with a sand plume trailing boots',
  'a glacier crevasse leap between blue ice walls',
  'an aircraft hangar with propeller wash rippling fabric',
  'library stacks with a tipping ladder between aisles',
  'a clock tower interior with swinging pendulum weight',
  'a vineyard row sprint at harvest with cut stems flying',
  'a coal mine cart track with a headlamp beam cutting dust',
  'a storm drain tunnel with knee-deep rushing water',
  'wide temple stairs descending in monsoon rain',
  'a cargo plane ramp exit with wind tearing at clothing',
  'a ferris wheel car rocking at the apex in gusts',
  'a dam spillway mist zone with roaring white water',
  'an abandoned factory chute slide with sparks trailing',
  'coral reef shallows with bubbles streaming upward',
  'a bamboo grove path with stalks bending in gusts',
  'a sandstorm edge with grit stinging exposed skin',
  'a rope bridge swaying over a gorge river',
  'a frozen lake crack spreading under a sliding boot',
  'a burning-field firebreak sprint with embers in the air',
  'a subway track bed with a train light approaching',
  'a waterfall base with mist and slick black rock',
  'a collapsed scaffolding climb with rebar and dust',
  'a rooftop gap jump between mismatched building heights',
];

const CHARACTER_ACTION_MOTION = [
  'freeze-frame peak action with readable momentum',
  'motion blur on extremities while the face stays sharp',
  'fabric, hair, and debris reacting to the movement',
  'weight clearly shifted—never a neutral standing pose',
  'environment interaction: splashes, dust, sparks, or wind',
];

const CHARACTER_SETTINGS = [
  'a plain studio backdrop',
  'an empty sunlit room',
  'a quiet alley with no passersby',
  'a sparse workshop with tools but no staff',
  'a minimalist interior with clean lines',
  'a foggy open landscape with no figures in sight',
  'a rooftop at dusk with an empty skyline',
  'a soft-lit bedroom corner',
  'an abandoned corridor with peeling paint',
  'a small courtyard empty of other people',
  'a film backlot street after wrap, props stacked',
  'a darkroom with red safelight glow',
  "a tailor's workshop with bolts of fabric",
  'an antique apothecary lined with glass jars',
  'a pottery studio dusted with dry clay',
  'a radio booth with foam panels and microphones',
  'an empty circus dressing tent between shows',
  'a lighthouse lamp room with brass and glass',
  'a stone wine cellar with arched ceilings',
  'a server room with cable runs and blinking LEDs',
  'a Japanese tatami room with shoji-filtered light',
  'a steam room with mist on tile',
  'a ballroom mirror wall before an event',
  'a closed butcher shop with hooks and marble',
  'a planetarium dome with a star projection',
  'an observatory dome slit open to city lights',
  'a taxidermy studio with glass eyes catching light',
  'ship captain quarters with wood paneling and charts',
  'a greenhouse orchid bench at humid noon',
  'a boxing gym with a heavy bag still swinging',
  'a ballet studio with barre and scuffed floor',
  'a recording studio vocal booth with headphones',
  'a forensic lab with an evidence table under lamps',
  'a vault door half-open in a bank basement',
  'a climbing gym wall with colored holds',
  'a forge with cooling embers and hanging tools',
  'a millinery shop with hat forms on shelves',
  'a stained-glass workshop with colored shards',
  "a puppet maker's attic with strings and joints",
  'a watchmaker bench with loupe and tiny gears',
  'a florist cold room with buckets and stems',
  "a bookbinder's press room with leather stacks",
  'a veterinary clinic exam room after hours',
  'a courtroom gallery with empty wooden benches',
  'a chapel pew row with colored light through glass',
  'a submarine bunk with folded blankets and gauges',
  'a train sleeper compartment with passing landscape blur',
  'a florist greenhouse propagation bench',
  "a jeweler's loupe bench with velvet trays",
  'a mortuary preparation room, clinical and empty',
  'a film projection booth with dust in the beam',
  'a chess club basement with boards under lamps',
  'a tattoo parlor chair with ink caps laid out',
  'a barber chair in a tiled two-chair shop',
  'a seamstress mannequin room with pinned muslin',
  'a chemistry lecture hall demo bench',
  'a typewriter repair desk with ribbon spools',
  'a map room with drawers pulled open',
  "a violin maker's varnish room",
  'a camera obscura tent with ground-glass focus',
  "a beekeeper's honey house with wax combs",
  "a falconer's mews with empty perches",
  'a print shop with letterpress drawers open',
  'a lacquerware drying room with hanging bowls',
  'a kimono rental alcove with folded silk',
  'a diving shop with wetsuits on racks',
  'a saddlery with leather hides and stamps',
  'a clock repair bench with disassembled movements',
  'a mushroom grow room with mist and substrate bags',
  'a planetarium control console in red light',
  "a wig maker's head forms on a shelf",
  'a stained oak pub snug with empty benches',
  'a ceramic kiln room with warm brick glow',
  'a harp restoration workshop with gut strings',
  'a model train layout room with tiny landscapes',
  "a perfumer's organ of scent bottles",
  'a swordsmith polishing stone and folded steel',
  'a greenhouse propagation mist bench',
  'a dark cathedral side aisle with votive candles',
  'a mezzanine library loft with rolling ladder',
  'a greenhouse succulent bench under shade cloth',
  'a film color grading suite with monitor glow',
  'a shoemaker last rack and awl bench',
  'a glass negative drying rack in an archive',
  'a planetarium star projector maintenance pit',
  'a ropewalk floor with laid-out fiber strands',
  "a chandler's wax dipping frame",
  "a cooper's barrel hoop and stave bench",
  "a lacemaker's pillow with bobbins",
  "a heraldry painter's easel with unfinished shield",
  "a gilder's leaf book and burnishing stone",
  'a marionette storage case with hinged lids',
  'a planetarium gift shop after closing, empty aisles',
];

const SOLO_LOCATION_SUFFIX = ', empty of other people and figures';

const COMPOSED_LOCATION_WEIGHT = 52;
const PICK_RETRY_LIMIT = 20;

function isLocationExcluded(location: string, exclude: readonly string[] | undefined): boolean {
  if (!exclude?.length) {
    return false;
  }

  const key = normalizeLocationKey(location);
  return exclude.some(item => normalizeLocationKey(item) === key);
}

/** Handcrafted location or procedurally composed scene (~52% composed). */
export function pickSceneLocation(
  exclude: readonly string[] = [],
  avoidedTokens?: readonly string[]
): string {
  const preferComposed = randomInt(100) < COMPOSED_LOCATION_WEIGHT;

  if (preferComposed) {
    for (let attempt = 0; attempt < PICK_RETRY_LIMIT; attempt += 1) {
      const composed = composeSceneLocation();
      if (
        !isLocationExcluded(composed, exclude) &&
        !promptContainsAvoidedTokensFromList(composed, avoidedTokens ?? [])
      ) {
        return composed;
      }
    }

    return composeSceneLocation();
  }

  for (let attempt = 0; attempt < PICK_RETRY_LIMIT; attempt += 1) {
    const candidate = pick(ALL_LOCATIONS);
    if (
      !isLocationExcluded(candidate, exclude) &&
      !promptContainsAvoidedTokensFromList(candidate, avoidedTokens ?? [])
    ) {
      return candidate;
    }
  }

  return composeSceneLocation();
}

function pickCharacterSetting(exclude: readonly string[] = [], hints?: string): string {
  const roll = randomInt(100);

  if (roll < 12) {
    return pick(CHARACTER_SETTINGS);
  }

  return `${pickSceneLocationForSportHints(hints, () => pickSceneLocation(exclude))}${SOLO_LOCATION_SUFFIX}`;
}

function pickCharacterActionSetting(hints?: string, exclude: readonly string[] = []): string {
  const sport = inferAthleticSport(hints);
  if (sport) {
    return pickSportActionSetting(sport, hints);
  }

  const roll = randomInt(100);

  if (roll < 18) {
    return pick(CHARACTER_ACTION_SETTINGS);
  }

  if (roll < 48) {
    return `${composeActionLocation()}, empty except the moving subject`;
  }

  return `${pickSceneLocationForSportHints(hints, () => pickSceneLocation(exclude))}, empty except the moving subject`;
}

const MOODS = [
  'quiet and contemplative',
  'charged with restless energy',
  'dreamlike and slightly surreal',
  'gritty and lived-in',
  'tense, as if a moment before something happens',
  'celebratory and bright',
  'melancholic but beautiful',
  'electric and unpredictable',
  'serene and suspended in time',
  'sacred and hushed',
  'wry and quietly humorous',
  'lonely but dignified',
  'optimistic after a long wait',
  'uncanny and off-kilter',
  'romantic without sentimentality',
  'stoic and weather-beaten',
  'playful with an undercurrent of danger',
  'reverent and slow',
  'restless with creative focus',
  'tender and unguarded',
  'defiant in soft light',
  'nostalgic for a half-remembered summer',
  'clinical and precise',
  'mythic, as if from an old folktale',
  'absurd yet completely sincere',
  'patient, mid-task, unhurried',
  'volatile, emotions barely contained',
  'cozy despite the scale of the place',
  'alienated in a familiar city',
  'hopeful at the edge of change',
];

const LIGHTING = [
  'golden-hour backlight with warm rim glow',
  'cool blue moonlight and deep shadow pools',
  'neon color spill mixing magenta and cyan',
  'soft overcast light with muted contrast',
  'candlelight flicker with warm amber pools',
  'harsh midday sun casting crisp shadows',
  'storm-light with bruised purple clouds',
  'early-morning fog diffusing pale sunlight',
  'projector light cutting through haze',
  'underwater caustics rippling across surfaces',
  'sodium-vapor streetlight casting orange pools',
  'dappled forest light through moving leaves',
  'single window beam in an otherwise dark room',
  'lightning flash freezing rain mid-fall',
  'polar twilight with long lavender shadows',
  'firelight from an off-frame brazier',
  'overcast skylight flattening color gently',
  'backlit dust motes in a sun shaft',
  'green-tinted fluorescent wash in a utilitarian space',
  'warm tungsten practicals against cold ambient fill',
  'reflected water shimmer on a ceiling',
  'stage spotlight isolating the subject from darkness',
  'pre-dawn indigo with a thin gold horizon line',
  'lantern glow pooling on wet cobblestones',
  'high-contrast noir sidelight from a blind',
  'soft bounce light from snow-covered ground',
  'heat shimmer distorting distant background detail',
  'bioluminescent blue-green accent in deep shadow',
  'church-window color patches on stone floor',
  'overhead industrial fixtures with hard falloff',
];

const WEATHER = [
  'after a recent rain',
  'during a light snowfall',
  'in humid summer heat',
  'with wind lifting dust and fabric',
  'under rolling thunderclouds',
  'in dense coastal fog',
  'during a dry desert breeze',
  'with cherry blossoms drifting through the air',
  'in still air before a storm breaks',
  'with fine mist clinging to skin and stone',
  'during a heat haze that softens the horizon',
  'with sleet ticking against metal surfaces',
  'in crisp autumn air with leaf smoke nearby',
  'under a clear sky after a cold front',
  'with sand drifting in low gusts',
  'during a monsoon downpour with steam rising',
  'in freezing fog that feathers every edge with rime',
  'with pollen or seed fluff floating in sunlight',
  'during a dust-laden haboob edge at distance',
  'with sea spray misting the foreground',
  'in muggy twilight after a long hot day',
  'under mammatus clouds after a passing front',
  'with icicles melting one drop at a time',
  'during a gentle mountain drizzle',
  'with ash or ember flecks drifting on the wind',
  'in bone-dry air that crackles with static',
  'with rainbow light breaking through broken clouds',
  "during a whiteout with visibility reduced to arm's length",
  'with heat lightning flickering on the horizon',
  'in calm weather with mirror-still reflections',
];

/** Optional ambient beats mixed into random scene seeds for extra variety. */
const SCENE_MOMENTS = [
  'a stray cat crossing the foreground',
  'steam rising from a grate or kettle',
  'paper or leaves tumbling through the frame',
  'distant church bells or ship horns implied in the stillness',
  'a half-finished meal or tool left mid-task',
  'birds lifting off from a ledge in the background',
  'a flickering sign or lantern drawing the eye',
  'fresh tire tracks or footprints in dust or mud',
  'laundry or fabric snapping on a line',
  'a bicycle or cart parked at the edge of frame',
  'pollen, dust, or ash drifting through a sun shaft',
  'a radio or music bleeding faintly from somewhere unseen',
  'fresh chalk marks or graffiti catching side light',
  'a dog sleeping in a patch of warmth',
  'water dripping from a pipe or eave at steady intervals',
  'a stack of crates or books waiting to be moved',
  'moths circling a bare bulb after dark',
  'a kite or balloon tangled in branches far off',
  'fresh cut flowers in a jar on a nearby surface',
  'a mirror or window doubling the scene in reflection',
  'a train or tram rumble implied through vibration in objects',
  'ice cracking softly on a puddle or bucket',
  'a half-open door suggesting someone just left',
  'sparks or embers fading from a recent fire',
  'a flock of pigeons scattering from a cornice',
  'fresh paint or plaster still drying on a wall',
  'a clock or meter showing an exact late hour',
  'rope or chain swaying slightly with unseen weight',
  "a child's toy abandoned on a step or bench",
  "a vendor's awning flapping in a steady breeze",
  'neon reflected in a puddle like a second city',
  'a radio tower or wind turbine turning slowly in the distance',
  'fresh bread or fruit laid out to cool',
  'a ladder or scaffold suggesting work in progress',
  'a mirror-still puddle holding the sky upside down',
  'a lantern chain swinging after someone passed',
  'a moth-eaten curtain moving in a draft',
  'a half-written note pinned under a stone',
  'a fishing float bobbing in the corner of the scene',
  'a stack of newspapers yellowing in the sun',
];

const BACKDROP_TYPES = [
  'interior architecture',
  'natural landscape',
  'urban streetscape',
  'industrial ruin',
  'coastal environment',
  'fantasy environment',
  'sci-fi environment',
  'historical setting',
];

const BACKGROUND_FEATURES = [
  'layered depth from foreground debris to distant horizon',
  'weathered textures on stone, wood, and metal surfaces',
  'atmospheric haze softening the far background',
  'strong leading lines drawing the eye inward',
  'pockets of warm practical light against cool ambient fill',
  'reflections on wet or polished surfaces',
  'vegetation encroaching on built structures',
  'signs of age, repair, and human use without visible people',
];

function randomInt(max: number): number {
  if (max <= 0) {
    return 0;
  }
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0]! % max;
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)]!;
}

function pickFiltered<T>(
  items: readonly T[],
  avoidedTokens?: readonly string[],
  toText: (item: T) => string = String
): T {
  if (!avoidedTokens?.length) {
    return pick(items);
  }
  const filtered = items.filter(
    item => !promptContainsAvoidedTokensFromList(toText(item), avoidedTokens)
  );
  return pick(filtered.length > 0 ? filtered : items);
}

function pickCharacterEnvironmentSetting(
  location: string | null,
  portraitStyle: 'portrait' | 'full-body' | 'action',
  recentLocations: readonly string[] = [],
  hints?: string
): string {
  if (location) {
    return portraitStyle === 'action'
      ? `${location}, empty except the moving subject`
      : `${location}${SOLO_LOCATION_SUFFIX}`;
  }

  return portraitStyle === 'action'
    ? pickCharacterActionSetting(hints, recentLocations)
    : pickCharacterSetting(recentLocations, hints);
}

export type RandomSeedBundle = {
  seed: string;
  location: string;
};

export function buildRandomSceneSeed(options: {
  genre?: string;
  includePeople?: boolean;
  recentLocations?: string[];
  avoidedTokens?: string[];
}): RandomSeedBundle {
  const genreHint = parseSettingHint(options.genre);
  const location =
    genreHint.location || pickSceneLocation(options.recentLocations, options.avoidedTokens);
  const parts = [location];

  if (randomInt(100) < 42) {
    parts.push(pickFiltered(SCENE_MOMENTS, options.avoidedTokens));
  }

  parts.push(
    pickFiltered(WEATHER, options.avoidedTokens),
    pickFiltered(LIGHTING, options.avoidedTokens),
    pickFiltered(MOODS, options.avoidedTokens)
  );

  if (options.includePeople !== false) {
    parts.unshift(pickFiltered(SUBJECTS, options.avoidedTokens));
  }

  if (options.genre?.trim()) {
    const genreLabel = genreHint.hasExplicitLocation
      ? genreHint.remainder || genreHint.location || options.genre.trim()
      : options.genre.trim();
    if (genreLabel) {
      parts.unshift(genreLabel);
    }
  }

  return { seed: parts.join(', '), location };
}

export function buildRandomBackgroundSeed(options: {
  settingType?: string;
  timeOfDay?: string;
  mood?: string;
  recentLocations?: string[];
  avoidedTokens?: string[];
}): RandomSeedBundle {
  const settingHint = parseSettingHint(options.settingType);
  const location =
    settingHint.location || pickSceneLocation(options.recentLocations, options.avoidedTokens);
  const backdrop = settingHint.hasExplicitLocation
    ? settingHint.remainder || pickFiltered(BACKDROP_TYPES, options.avoidedTokens)
    : options.settingType?.trim() || pickFiltered(BACKDROP_TYPES, options.avoidedTokens);

  const parts = [
    backdrop,
    location,
    options.timeOfDay?.trim() || pickFiltered(LIGHTING, options.avoidedTokens),
    options.mood?.trim() || pickFiltered(MOODS, options.avoidedTokens),
    pickFiltered(WEATHER, options.avoidedTokens),
    pickFiltered(BACKGROUND_FEATURES, options.avoidedTokens),
    'empty of people, figures, silhouettes, and crowds',
  ];

  return { seed: parts.join(', '), location };
}

export function buildRandomCharacterSeed(
  hints?: string,
  portraitStyle: 'portrait' | 'full-body' | 'action' = 'portrait',
  recentLocations: string[] = [],
  avoidedTokens?: string[]
): RandomSeedBundle {
  const settingHint = parseSettingHint(hints);
  const explicitLocation = settingHint.location;
  const people = parsePeopleConstraint(hints ?? '');
  const duoSeed = (people.count ?? 0) >= 2;
  const parts = duoSeed
    ? [
        'two subjects only, balanced duo framing, no crowd or extras',
        ...(people.gender === 'women' ? ['two women'] : people.gender === 'men' ? ['two men'] : []),
      ]
    : ['solo subject only, no other people anywhere'];

  let location = explicitLocation ?? '';

  if (portraitStyle === 'action') {
    const actionSetting = pickCharacterActionSetting(hints, recentLocations);
    parts.push(
      actionSetting,
      pickCharacterActionPose(hints),
      pickFiltered(CHARACTER_ACTION_MOTION, avoidedTokens),
      pickFiltered(LIGHTING, avoidedTokens),
      pickFiltered(MOODS, avoidedTokens)
    );
    if (!explicitLocation) {
      location = actionSetting.replace(/,\s*empty except the moving subject$/i, '').trim();
    }
    const intentSport = inferAthleticSport(hints);
    if (duoSeed && intentSport) {
      const competitionLine = getSportDuoCompetitionLine(intentSport, hints ?? '');
      if (competitionLine) {
        parts.push(competitionLine);
      }
    }
  } else {
    const environmentSetting = pickCharacterEnvironmentSetting(
      explicitLocation,
      portraitStyle,
      recentLocations,
      hints
    );
    parts.push(
      environmentSetting,
      pickFiltered(CHARACTER_POSES, avoidedTokens),
      pickFiltered(LIGHTING, avoidedTokens),
      pickFiltered(MOODS, avoidedTokens)
    );
    if (!explicitLocation) {
      location = environmentSetting.replace(SOLO_LOCATION_SUFFIX, '').trim();
    }
  }

  if (!hints?.trim()) {
    parts.push(
      portraitStyle === 'action'
        ? `${pickCharacterSubject()}, decisive mid-action instant with engaged muscles and expressive face`
        : pickCharacterSubject()
    );
  } else {
    // Scene keywords without face detail still need a concrete person.
    const identity = pickCharacterIdentitySeed(parseCharacterHints(hints));
    if (identity) {
      parts.push(identity);
    } else {
      parts.push(
        portraitStyle === 'action'
          ? 'decisive mid-action instant with engaged muscles and expressive face'
          : 'distinct face, clothing, posture, and expression'
      );
    }
  }

  return { seed: parts.join(', '), location };
}

const SEED_TOPIC_ANGLES = [
  'reinterpreted as cozy slice-of-life',
  'as high-fantasy myth',
  'in a retro sci-fi future',
  'during a stormy night',
  'as minimalist studio concept art',
  'with surreal dream logic',
  'as gritty documentary realism',
  'in golden-hour warmth',
];

export function normalizeTopicPhrase(phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed) {
    return trimmed;
  }

  const dashParts = trimmed.split(/\s+[—–-]\s+/);
  if (dashParts.length === 2) {
    const left = dashParts[0]!.trim();
    const right = dashParts[1]!.trim();
    if (left.toLowerCase() === right.toLowerCase()) {
      return left;
    }
  }

  const inMatch = trimmed.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch) {
    const left = inMatch[1]!.trim();
    const right = inMatch[2]!.trim();
    if (left.toLowerCase() === right.toLowerCase()) {
      return left;
    }
  }

  return trimmed;
}

export function buildRandomTopicPhrase(
  seed?: string,
  recentLocations: string[] = [],
  avoidedTokens?: string[]
): RandomSeedBundle {
  const settingHint = parseSettingHint(seed);
  const location = settingHint.location || pickSceneLocation(recentLocations, avoidedTokens);
  const subject = pickFiltered(SUBJECTS, avoidedTokens);
  const mood = pickFiltered(MOODS, avoidedTokens);
  const lighting = pickFiltered(LIGHTING, avoidedTokens);

  if (seed?.trim()) {
    const theme = settingHint.remainder || seed.trim();
    const resolvedLocation = settingHint.location || location;
    const themeKey = theme.toLowerCase();
    const locationKey = resolvedLocation.toLowerCase();
    const sameThemeAndLocation = themeKey === locationKey;
    const templates = [
      !sameThemeAndLocation ? `${theme} — ${resolvedLocation}` : null,
      `${theme}, ${pickFiltered(MOODS, avoidedTokens)}`,
      `${theme} under ${pickFiltered(LIGHTING, avoidedTokens)}`,
      `${pickFiltered(SUBJECTS, avoidedTokens)} in a ${theme} setting`,
      `${theme} ${pickFiltered(SEED_TOPIC_ANGLES, avoidedTokens)}`,
      `${theme} meets ${pickFiltered(BACKDROP_TYPES, avoidedTokens)} at ${resolvedLocation}`,
      settingHint.location && !sameThemeAndLocation ? `${theme} in ${settingHint.location}` : null,
    ].filter((entry): entry is string => Boolean(entry));
    const phrase = normalizeTopicPhrase(pickFiltered(templates, avoidedTokens));

    return { seed: phrase, location: settingHint.location || location };
  }

  const phrase = normalizeTopicPhrase(
    pickFiltered(
      [
        `${subject} in ${location}`,
        `${location}, ${mood}`,
        `${pickFiltered(BACKDROP_TYPES, avoidedTokens)}: ${location}, ${lighting}`,
        `${subject}, ${pickFiltered(WEATHER, avoidedTokens)}, ${mood}`,
        `${location} — ${subject}, ${lighting}`,
      ],
      avoidedTokens
    )
  );

  return { seed: phrase, location };
}

export function buildTemplateTopicList(options: {
  seedTopic?: string;
  count: number;
  recentLocations?: string[];
  avoidedTokens?: string[];
}): string[] {
  const seen = new Set<string>();
  const avoidLocations = new Set((options.recentLocations ?? []).map(normalizeLocationKey));
  const batchLocations = [...(options.recentLocations ?? [])];
  const topics: string[] = [];
  let attempts = 0;

  while (topics.length < options.count && attempts < options.count * 16) {
    attempts += 1;
    const { seed: phrase, location } = buildRandomTopicPhrase(
      options.seedTopic,
      batchLocations,
      options.avoidedTokens
    );
    const phraseKey = phrase.toLowerCase();
    const locationKey = normalizeLocationKey(location);

    if (seen.has(phraseKey)) {
      continue;
    }

    if (
      options.avoidedTokens?.length &&
      promptContainsAvoidedTokensFromList(phrase, options.avoidedTokens)
    ) {
      continue;
    }

    if (avoidLocations.has(locationKey) && attempts < options.count * 12) {
      continue;
    }

    seen.add(phraseKey);
    avoidLocations.add(locationKey);
    batchLocations.push(location);
    topics.push(phrase);
  }

  return topics;
}

export function getSceneLocationPoolSize(): number {
  return ALL_LOCATIONS.length;
}

export function getRandomSceneIngredientPoolSizes(): {
  subjects: number;
  weather: number;
  lighting: number;
  moods: number;
  moments: number;
  locations: number;
} {
  return {
    subjects: SUBJECTS.length,
    weather: WEATHER.length,
    lighting: LIGHTING.length,
    moods: MOODS.length,
    moments: SCENE_MOMENTS.length,
    locations: ALL_LOCATIONS.length,
  };
}
