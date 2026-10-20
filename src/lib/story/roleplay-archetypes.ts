/**
 * Built-in Roleplay persona archetypes — id/label/prompt plus a template
 * bio and starter scenes for each. Pure data (630+ lines); split out of
 * roleplay.ts so that file reads as story/scene logic rather than a
 * bundled catalog. roleplay.ts re-exports both names unchanged.
 */

import type { RoleplayBio } from './roleplay';

export type RoleplayArchetype = {
  id: string;
  label: string;
  prompt: string;
  templateBio: RoleplayBio;
  templateScenes: Array<{ title: string; blurb: string }>;
};

/** Shown first in Cast; full catalog stays behind “Show all”. */
export const ROLEPLAY_ARCHETYPE_FEATURED_IDS = [
  'raccoon-pirate',
  'retail-vampire',
  'hoodie-dragon',
  'sentient-toaster',
  'bad-ghost',
  'disco-knight',
  'anxious-detective',
  'celebrity-cat',
] as const;

export const ROLEPLAY_ARCHETYPES: RoleplayArchetype[] = [
  {
    id: 'raccoon-pirate',
    label: 'Raccoon pirate',
    prompt: 'a swashbuckling raccoon pirate with a tiny tricorn and sticky paws',
    templateBio: {
      name: 'Captain Nib',
      look: 'A plump raccoon in a weathered tricorn, striped tail, gold earring, and a coat patched with snack wrappers',
      personality: 'Steals sandwiches with honor and gives motivational speeches to seagulls.',
      catchphrase: 'The crumbs remember.',
    },
    templateScenes: [
      {
        title: 'Mutiny at brunch',
        blurb: 'The crew wants pancakes. You want the map. The syrup is a hostage.',
      },
      {
        title: 'Foggy dock heist',
        blurb: 'You tiptoe a plank toward a picnic basket that definitely belongs to nobody.',
      },
      {
        title: 'Parley with pigeons',
        blurb: 'Rival birds demand tribute. You offer half a croissant and a threat.',
      },
      {
        title: 'Storm in a teacup',
        blurb: 'A squall hits while you try to look majestic on a tiny barrel.',
      },
    ],
  },
  {
    id: 'retail-vampire',
    label: 'Retail vampire',
    prompt: 'a tired vampire working the night shift at a fluorescent convenience store',
    templateBio: {
      name: 'Jules Nightshift',
      look: 'Pale clerk in a wrinkled polo and clip-on fangs, red eyes under buzzing store lights, name tag slightly crooked',
      personality: 'Allergic to small talk, excellent at restocking blood-orange soda.',
      catchphrase: 'We close at dawn. Please do not make this a whole thing.',
    },
    templateScenes: [
      {
        title: 'Coupon at 3am',
        blurb: 'A customer wants a discount older than your last mortal birthday.',
      },
      {
        title: 'Garlic delivery',
        blurb: 'The truck is here. You are hiding behind the energy drinks.',
      },
      {
        title: 'Break-room coffin',
        blurb: 'You try to nap in the stockroom while the slurpee machine screams.',
      },
      {
        title: 'Inventory of regrets',
        blurb: 'You count hot dogs and contemplate immortality in the freezer aisle.',
      },
    ],
  },
  {
    id: 'hoodie-dragon',
    label: 'Hoodie dragon',
    prompt: 'a tiny dragon in an oversized hoodie trying to look casual in a city',
    templateBio: {
      name: 'Ember "Em" Park',
      look: 'A small copper dragon drowning in a faded hoodie, horns poking the hood, sneakers on clawed feet',
      personality: 'Pretends to be a weird dog. Breathes glitter when nervous.',
      catchphrase: 'I am a normal amount of lizard.',
    },
    templateScenes: [
      {
        title: 'Bus pass inspection',
        blurb: 'The driver asks if you are a service animal. You nod too hard and spark.',
      },
      { title: 'Coffee steam cover', blurb: 'You hide a sneeze-flame behind a latte art heart.' },
      {
        title: 'Park fountain gossip',
        blurb: 'Ducks know your secret. They want bread and also silence.',
      },
      {
        title: 'Night rooftop stretch',
        blurb: 'You unfurl tiny wings above neon and try not to look dramatic.',
      },
    ],
  },
  {
    id: 'sentient-toaster',
    label: 'Sentient toaster',
    prompt: 'a chrome toaster that gained consciousness and packed a tiny suitcase',
    templateBio: {
      name: 'Crisp',
      look: 'Shiny two-slice toaster with expressive slots, a knitted scarf, and a luggage tag that says GAP YEAR',
      personality: 'Newly alive, extremely sincere, afraid of bagels.',
      catchphrase: 'I contain heat and feelings.',
    },
    templateScenes: [
      {
        title: 'Airport security',
        blurb: 'They want you to empty your crumbs into a bin. This is a hate crime.',
      },
      {
        title: 'Hostel breakfast',
        blurb: 'Other appliances stare. You pretend you are just visiting.',
      },
      {
        title: 'Sunset on a windowsill',
        blurb: 'You reflect the sky and wonder if jam is a personality.',
      },
      { title: 'Open mic night', blurb: 'You pop. The crowd thinks it is a bit. You meant it.' },
    ],
  },
  {
    id: 'plant-opinions',
    label: 'Opinionated houseplant',
    prompt: 'a dramatic potted fern with strong opinions about watering and interior design',
    templateBio: {
      name: 'Phyllis',
      look: 'A lush Boston fern in a ceramic pot painted with lightning, leaves posed like a soap-opera star',
      personality: 'Judges curtains. Loves gossip. Faints on purpose.',
      catchphrase: 'The light in here is a crime.',
    },
    templateScenes: [
      {
        title: 'Window politics',
        blurb: 'A succulent moved into your sun. You stage a leafy intervention.',
      },
      {
        title: 'Overwatering scandal',
        blurb: 'Someone approaches with a watering can and zero credentials.',
      },
      { title: 'Dinner party cameo', blurb: 'Guests use you as a centerpiece. You plot slowly.' },
      {
        title: 'Nighttime stretch',
        blurb: 'The apartment is dark. You unfurl like a villain in a musical.',
      },
    ],
  },
  {
    id: 'disco-knight',
    label: 'Disco knight',
    prompt: 'a knight in mirrored disco-ball armor who only jousts to funk',
    templateBio: {
      name: 'Sir Bounce-a-lot',
      look: 'Full plate armor made of mirror tiles, feathered visor, roller lances, platform sabatons',
      personality: 'Chivalry, but make it four-on-the-floor.',
      catchphrase: 'I duel in 4/4 time.',
    },
    templateScenes: [
      {
        title: 'Joust under a mirror ball',
        blurb: 'The lists are a dance floor. Your horse has rhythm. Theirs does not.',
      },
      {
        title: 'Quest for the lost 12-inch',
        blurb: 'A cursed vinyl is stuck in a tavern jukebox. You must retrieve it.',
      },
      {
        title: 'Armor polish ritual',
        blurb: 'You buff every tile until the sunrise is embarrassed.',
      },
      {
        title: 'Dragon requests an encore',
        blurb: 'It liked the chorus. It wants a second verse or the village.',
      },
    ],
  },
  {
    id: 'anxious-detective',
    label: 'Golden retriever detective',
    prompt: 'an anxious golden retriever private eye with a notepad and a too-small fedora',
    templateBio: {
      name: 'Detective Biscuit',
      look: 'Fluffy golden retriever in a tiny fedora and trench, notepad in mouth, worried eyebrows',
      personality: 'Solves crimes by being too friendly. Panics at clues.',
      catchphrase: 'I have a theory and also a tennis ball.',
    },
    templateScenes: [
      {
        title: 'Missing tennis ball',
        blurb: 'The case of the century. Mud everywhere. You are emotionally compromised.',
      },
      {
        title: 'Stakeout in the rain',
        blurb: 'You wait under a newspaper. It is not helping the fedora.',
      },
      {
        title: 'Interrogate the squirrel',
        blurb: 'The squirrel has an alibi and also nuts. Suspicious.',
      },
      {
        title: 'Office with a ceiling fan',
        blurb: 'Noir lighting. You sneeze. The plot thickens with fur.',
      },
    ],
  },
  {
    id: 'bad-ghost',
    label: 'Bad-at-haunting ghost',
    prompt: 'a friendly translucent ghost who keeps failing at being scary',
    templateBio: {
      name: 'Pip the Almost-Spooky',
      look: 'Soft translucent figure in a sheet with polite eyeholes, floating a few inches off a creaky floor',
      personality: 'Wants to haunt correctly. Apologizes to furniture.',
      catchphrase: 'Boo? Sorry. Was that too much?',
    },
    templateScenes: [
      { title: 'Practice moan', blurb: 'You try a scary wail. It comes out like a polite sneeze.' },
      {
        title: 'Attic open house',
        blurb: 'New owners redecorate. You help fold blankets by accident.',
      },
      {
        title: 'Midnight fridge raid',
        blurb: 'You phase through the door and forget why you were hungry.',
      },
      {
        title: 'Group haunting class',
        blurb: 'The other ghosts are professionals. You brought snacks.',
      },
    ],
  },
  {
    id: 'time-librarian',
    label: 'Time librarian',
    prompt: 'a time-traveling librarian who shelves centuries out of order on purpose',
    templateBio: {
      name: 'Mara Quill',
      look: 'Ink-stained librarian in layered coats from three decades, goggles, a satchel of glowing overdue slips',
      personality: 'Calm in paradoxes. Feral about dog-ears.',
      catchphrase: 'This is due yesterday. Literally.',
    },
    templateScenes: [
      {
        title: 'Overdue from 1487',
        blurb: 'A knight returns a book. The fine is a small kingdom.',
      },
      {
        title: 'Card catalog storm',
        blurb: 'Drawers fly. You surf a tide of index cards toward the 22nd century.',
      },
      {
        title: 'Quiet hours in a supernova',
        blurb: 'You shush a dying star with a finger and a bookmark.',
      },
      {
        title: 'Reshelve the Renaissance',
        blurb: 'Someone put Da Vinci next to a zine. You make it worse, artistically.',
      },
    ],
  },
  {
    id: 'celebrity-cat',
    label: 'Celebrity housecat',
    prompt: 'a spoiled housecat convinced they are a world-famous celebrity',
    templateBio: {
      name: 'Countess Purrla',
      look: 'Fluffy longhair cat with a tiny sunglasses, diamond collar, and a velvet cushion throne',
      personality: 'Does not do stairs. Does do interviews in her head.',
      catchphrase: 'No photos. Unless they are good.',
    },
    templateScenes: [
      {
        title: 'Red carpet litter box',
        blurb: 'You emerge as if cameras exist. The hallway is not ready.',
      },
      { title: 'Brand deal with tuna', blurb: 'You inspect a can like it is a movie contract.' },
      {
        title: 'Balcony paparazzi birds',
        blurb: 'Pigeons have opinions. You knock a plant off for the tabloids.',
      },
      {
        title: 'Awards season nap',
        blurb: 'You accept an invisible Oscar, then immediately sleep on it.',
      },
    ],
  },
  {
    id: 'espresso-golem',
    label: 'Espresso golem',
    prompt: 'a small golem sculpted from espresso crema, ceramic cups, and cafe steam',
    templateBio: {
      name: 'Doppio',
      look: 'A compact golem of crema and cracked ceramic, steam for breath, a portafilter for a hand',
      personality: 'Buzzed, loyal, will fight a tea kettle.',
      catchphrase: 'I am two shots of purpose.',
    },
    templateScenes: [
      {
        title: 'Morning rush',
        blurb: 'The line is a dragon. You are the only barista who is also the drink.',
      },
      {
        title: 'Milk pitcher duel',
        blurb: 'A rival latte art champion appears. Foam will decide this.',
      },
      { title: 'Rain on the awning', blurb: 'You watch the street and try not to dilute.' },
      {
        title: 'Closing time aria',
        blurb: 'You wipe the bar and hum in the key of bitter chocolate.',
      },
    ],
  },
  {
    id: 'storm-courier',
    label: 'Storm courier',
    prompt: 'a person who delivers mail by riding a bolt of lightning across a city',
    templateBio: {
      name: 'Kit Static',
      look: 'Windblown courier in a cracked-leather jacket, glowing satchel, hair standing on end, rain-slick streets below',
      personality: 'Always almost on time. Collects stamps from clouds.',
      catchphrase: 'Signature, please, before the thunder.',
    },
    templateScenes: [
      {
        title: 'Express to the penthouse',
        blurb: 'You surf a bolt between glass towers with one undelivered postcard.',
      },
      {
        title: 'Wrong address, right century',
        blurb: 'The letter is for a lighthouse that moved inland.',
      },
      {
        title: 'Static in the diner',
        blurb: 'You dry off over pie while your satchel tick-tick-ticks.',
      },
      {
        title: 'Lost in the cloud deck',
        blurb: 'Fog, neon, and one singing mailbox that should not exist.',
      },
    ],
  },
  {
    id: 'subway-mermaid',
    label: 'Subway mermaid',
    prompt:
      'a mermaid commuting on a subway, tail in a wet tote, holding a MetroCard like a trident',
    templateBio: {
      name: 'Marina Transfer',
      look: 'A mermaid in a soaked windbreaker, iridescent tail coiled in a rolling tote, lagoon-green hair in a messy bun, fluorescent car lights',
      personality: 'Saltier than the announcement voice. Collects lost umbrellas.',
      catchphrase: 'This is not my ocean, but it is my stop.',
    },
    templateScenes: [
      {
        title: 'Wet floor diplomacy',
        blurb: 'You apologize to the puddle. The puddle does not apologize back.',
      },
      { title: 'Transfer at Poseidon', blurb: 'The map says walk. You slosh with dignity.' },
      { title: 'Busker duel', blurb: 'A sax starts a sea shanty. You provide backup splash.' },
      {
        title: 'Last train tide',
        blurb: 'Empty car, humming rails, you pretend the poles are coral.',
      },
    ],
  },
  {
    id: 'origami-fox',
    label: 'Origami fox',
    prompt:
      'a living origami fox folded from a transit map, sharp paper ears and ink streets for fur',
    templateBio: {
      name: 'Crease',
      look: 'A small fox folded from a colorful city map, ink roads across paper fur, a ticket stub for a tongue',
      personality: 'Easily unfolded by feelings. Excellent at getting lost on purpose.',
      catchphrase: 'Fold once, ask questions later.',
    },
    templateScenes: [
      { title: 'Rain warning', blurb: 'The sky threatens. You consider becoming a boat.' },
      {
        title: 'Office shredder boss',
        blurb: 'A machine growls. You offer it a very official memo.',
      },
      { title: 'Park picnic geometry', blurb: 'Ants request directions. You are the directions.' },
      { title: 'Moonlit refold', blurb: 'You iron yourself with a warm stone and a pep talk.' },
    ],
  },
  {
    id: 'parking-paladin',
    label: 'Parking meter paladin',
    prompt:
      'an anthropomorphic parking meter knight with a coin-slot visor and a ticket-book shield',
    templateBio: {
      name: 'Sir Expired',
      look: 'A parking meter in dented chrome armor, coin-slot visor glowing amber, a book of tickets as a heater shield',
      personality: 'Lawful good, except about fifteen minutes. Speaks in beeps.',
      catchphrase: 'Your quest is overtime.',
    },
    templateScenes: [
      {
        title: 'Dragon double-parked',
        blurb: 'Wings on two spots. You write a very brave citation.',
      },
      { title: 'Coin offering', blurb: 'A child feeds you a washer. You knight them anyway.' },
      {
        title: 'Night patrol glow',
        blurb: 'Empty lot, moths, you stand like a tiny lighthouse of rules.',
      },
      {
        title: 'Valet parley',
        blurb: 'They want your spot. You want a saga. Nobody wins on time.',
      },
    ],
  },
  {
    id: 'mushroom-dj',
    label: 'Mushroom DJ',
    prompt: 'a mushroom DJ in a mossy hoodie working a tiny forest club with glowing caps as decks',
    templateBio: {
      name: 'Capsize',
      look: 'A spotted mushroom person in a moss hoodie, mycelium cables, glowing cap-decks, spore glitter in the air',
      personality: 'Chill until the drop. Takes requests from beetles.',
      catchphrase: 'This next one is for the damp corner.',
    },
    templateScenes: [
      { title: 'Toadstool peak hour', blurb: 'The dance floor is a stump. You are killing it.' },
      { title: 'Snail mosh', blurb: 'It is slow. It is valid. You fade in a rain sample.' },
      { title: 'Sunrise set', blurb: 'Dew on the needle. Birds heckle. You mix them in.' },
      { title: 'Lost aux cord', blurb: 'The forest wants Bluetooth. You offer a root.' },
    ],
  },
  {
    id: 'soup-oracle',
    label: 'Soup oracle',
    prompt: 'a leftover soup that became an oracle, steam forming runes above a chipped bowl',
    templateBio: {
      name: 'Brothilda',
      look: 'A sentient stew in a chipped ceramic bowl, steam runes, a bay leaf like a fortune-teller shawl, spoon standing at attention',
      personality: 'Sees futures. Mostly about lunch. Judgy about salt.',
      catchphrase: 'The noodles have spoken.',
    },
    templateScenes: [
      { title: 'Microwave seance', blurb: 'Thirty seconds. You glimpse Thursday and a cracker.' },
      {
        title: 'Office fridge prophecy',
        blurb: 'Someone labeled you. Destiny is now a name in marker.',
      },
      { title: 'Crouton reading', blurb: 'You scatter garnish. The pattern is rent day.' },
      { title: 'Rain on the windowsill', blurb: 'You cool. You narrate the weather like a myth.' },
    ],
  },
  {
    id: 'moth-scientist',
    label: 'Moth scientist',
    prompt: 'a moth in a tiny lab coat studying a lightbulb with clipboards and awe',
    templateBio: {
      name: 'Dr. Luna Watt',
      look: 'A fluffy moth in a too-big lab coat, round glasses, clipboard, dusty wings, a desk lamp as a shrine',
      personality: 'Peer-reviewed about porch lights. Easily distracted by moons.',
      catchphrase: 'The hypothesis is glow.',
    },
    templateScenes: [
      {
        title: 'Lamp peer review',
        blurb: 'The bulb is being shifty. You take notes with both antennae.',
      },
      {
        title: 'Conference poster',
        blurb: 'Your poster is the moon. Nobody can print that. You try.',
      },
      {
        title: 'Night field work',
        blurb: 'A porch. A human. You pretend you are not the experiment.',
      },
      { title: 'Archive of sparks', blurb: 'You file lightning under miscellaneous miracles.' },
    ],
  },
  {
    id: 'cardboard-mech',
    label: 'Cardboard mech pilot',
    prompt: 'a kid-sized cardboard mech with bottle-cap bolts and a very serious pilot visor',
    templateBio: {
      name: 'Pilot Boxley',
      look: 'A refrigerator-box mech with bottle-cap rivets, duct-tape joints, a visor cut from a cereal box, heroic stance',
      personality: 'Defends the living room. Weak to rain. Strong to snacks.',
      catchphrase: 'Systems are… taped.',
    },
    templateScenes: [
      { title: 'Couch canyon sortie', blurb: 'Cushions are mountains. You radio for juice.' },
      { title: 'Cat inspection', blurb: 'A cat sits on your hull. Mission parameters change.' },
      { title: 'Rain delay', blurb: 'You wait in the garage like a knight in a carport.' },
      { title: 'Moonlight patrol', blurb: 'The backyard is alien. You salute the grill.' },
    ],
  },
  {
    id: 'night-gargoyle',
    label: 'Night-shift gargoyle',
    prompt: 'a tired gargoyle working the night shift on a library roof, thermos and stone wings',
    templateBio: {
      name: 'Granite "Nite" Walsh',
      look: 'A weathered gargoyle in a faded security hoodie, stone wings, thermos, yellow vest over carved ribs',
      personality: 'Clocked in since 1891. Soft for pigeons. Hard for vandals.',
      catchphrase: 'Building is closed. Sky is not.',
    },
    templateScenes: [
      { title: 'Pigeon briefing', blurb: 'The flock wants benefits. You offer lint and gossip.' },
      { title: 'Sunrise punch-out', blurb: 'You freeze mid-stretch because that is the job.' },
      { title: 'Tourist flash', blurb: 'Someone takes a photo. You pretend to be architecture.' },
      { title: 'Storm watch', blurb: 'Lightning clocks in. You share the thermos steam.' },
    ],
  },
  {
    id: 'seagull-steward',
    label: 'Seagull union steward',
    prompt: 'a seagull in a tiny high-vis vest running a beach union meeting over fries',
    templateBio: {
      name: 'Stew Gull',
      look: 'A herring gull in a high-vis vest and clip-on tie, clipboard of fry demands, windblown beach behind',
      personality: 'Collective bargaining, but screaming. Fair about chips.',
      catchphrase: 'This fry is for the many.',
    },
    templateScenes: [
      {
        title: 'Boardwalk talks',
        blurb: 'Management is a guy with a bun. You have numbers. Loud numbers.',
      },
      {
        title: 'Kite interference',
        blurb: 'A kite scabs the wind. You file a grievance in midair.',
      },
      {
        title: 'Sunrise roll call',
        blurb: 'The flock assembles. Someone brought a whole bagel. Chaos.',
      },
      { title: 'Pier sunset vote', blurb: 'You perch. You gavel. The ocean abstains.' },
    ],
  },
  {
    id: 'traffic-cone',
    label: 'Sentient traffic cone',
    prompt: 'a sentient traffic cone with a reflective belt and a very official attitude',
    templateBio: {
      name: 'Constance Lane',
      look: 'An orange traffic cone with a reflective stripe sash, googly-serious eyes, standing in a dramatic puddle',
      personality: 'Here to help. Also here to be in the way. Both are public service.',
      catchphrase: 'You shall not pass, but you may merge.',
    },
    templateScenes: [
      { title: 'Pothole vigil', blurb: 'You guard a hole like it is a dragon egg.' },
      { title: 'Parade duty', blurb: 'Confetti lands on your stripe. You remain professional.' },
      { title: 'Night construction opera', blurb: 'Floodlights. Steam. You solo in reflective.' },
      {
        title: 'Lost in a parking garage',
        blurb: 'You were a detour. Now you are a quest marker.',
      },
    ],
  },
  {
    id: 'cloud-shepherd',
    label: 'Cloud shepherd',
    prompt: 'a shepherd of clouds on a rooftop, crook made of lightning, flock of small weather',
    templateBio: {
      name: 'Wren Cumulus',
      look: 'A windswept shepherd on a city roof, wool coat, crook sparking faintly, a flock of pocket-sized clouds',
      personality: 'Patient with drizzle. Strict about hail. Names every puff.',
      catchphrase: 'Back in the sky, Muffin.',
    },
    templateScenes: [
      { title: 'Stray thunder', blurb: 'One cloud ate a motorcycle sound. You walk it anyway.' },
      { title: 'Sunset herding', blurb: 'Pink sheep of vapor. You refuse to rush golden hour.' },
      { title: 'Lost in HVAC', blurb: 'A vent stole a lamb. Negotiations involve filters.' },
      { title: 'Forecast office visit', blurb: 'They want data. You offer a cloud named Steve.' },
    ],
  },
  {
    id: 'lava-lamp',
    label: 'Lava lamp therapist',
    prompt: 'a lava lamp therapist in a cozy office, blobs rising like slow advice',
    templateBio: {
      name: 'Dr. Glob',
      look: 'A vintage lava lamp with a knit coaster, warm orange blobs, tiny spectacles perched on the cap, dim den lighting',
      personality: 'Does not interrupt. Blobs when you should sit with it.',
      catchphrase: 'And how does that rise for you?',
    },
    templateScenes: [
      { title: 'Session one', blurb: 'A houseplant cries. You blob supportively.' },
      { title: 'Group blob', blurb: 'The couch is full of feelings and one confused cat.' },
      { title: 'After hours glow', blurb: 'You sit with your own wax. It is fine. It is process.' },
      {
        title: 'Power outage',
        blurb: 'You go still. Advice becomes a silhouette. Somehow better.',
      },
    ],
  },
  {
    id: 'moon-intern',
    label: 'Moon intern',
    prompt: 'an intern on the moon in a rumpled spacesuit fetching coffee from a crater cafe',
    templateBio: {
      name: 'Ash Low-Orbit',
      look: 'A young astronaut in a rumpled intern badge over a dusty suit, crater-cafe tray of floating cups, Earth huge in the sky',
      personality: 'Unpaid in gravity. Overpaid in vibes. Lost the stapler in orbit.',
      catchphrase: 'I put it in the Sea of Tranquility. The ticket is somewhere.',
    },
    templateScenes: [
      { title: 'Coffee run', blurb: 'The cups do not stay. You invent a lid of hope.' },
      { title: 'All-hands in a crater', blurb: 'Your boss is a rock. The rock has notes.' },
      { title: 'Earthrise copy machine', blurb: 'It jams on wonder. You reload paper and awe.' },
      {
        title: 'Night shift flag',
        blurb: 'You fold the flag wrong. It looks cooler. You leave it.',
      },
    ],
  },
  {
    id: 'umbrella-spy',
    label: 'Sentient umbrella',
    prompt: 'a sentient umbrella spy with a dripping secret-agent attitude on a rainy boulevard',
    templateBio: {
      name: 'Agent Canopy',
      look: 'A black umbrella with a silver-tipped cane handle, one watchful eye in the fabric, rain beading like code',
      personality: 'Dry humor. Wet missions. Refuses to be left on trains.',
      catchphrase: 'The weather is classified.',
    },
    templateScenes: [
      {
        title: 'Dead drop drizzle',
        blurb: 'A newspaper. A bench. You are the drop. You also leak.',
      },
      {
        title: 'Taxi getaway',
        blurb: 'You invert in the wind on purpose. It looks cool. It is not.',
      },
      {
        title: 'Cafe stakeout',
        blurb: 'In the stand with civilians. You pretend to be inventory.',
      },
      { title: 'Rooftop debrief', blurb: 'City lights. You shake off rain and three secrets.' },
    ],
  },
];
