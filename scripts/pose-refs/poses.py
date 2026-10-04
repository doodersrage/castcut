"""Per-pose search queries, the vision check's pose words, and the posture classes a reference may
read as. Pose ids, labels, headcount and the hand-drawn figures come from the app (bridge.mts);
this file only says how to find each pose in a photo library.

  cats     Wikimedia Commons categories (searched with deepcat:, subcategories included) — the
           curated source: members are mostly photos of exactly that pose
  q        search queries, best first (the first one or two also go to Openverse, which allows
           ~200 anonymous searches a day; all of them go to Commons)
  ask      finishes "Is the person …?" / "Are the two people …?" for the vision check
  min_drawn limb-angle floor against the app figure (default MIN_DRAWN_SCORE in harvest.py)
  postures posture groups (posture-classifier.mts → pose-posture.ts: upright, bent, seated, low,
           lying, inverted) a reference may read as; None = skip (in-air and athletic poses the
           posture read can't name). Default: the group of the app's hand-drawn figure, when that
           read is confident.
"""

POSES: dict[str, dict] = {
    # Postures
    "stand": {"cats": ["Standing women", "Full-length portrait photographs"], "q": ["woman standing full length portrait", "standing woman full body", "man standing full length"], "ask": "standing upright on both feet"},
    "walk": {"cats": ["Walking women", "Walking men"], "q": ["woman walking street", "walking woman full body", "man walking sidewalk"], "ask": "walking mid-stride", "postures": ["upright"]},
    "run": {"cats": ["Running people", "Jogging"], "q": ["woman running jogging", "jogger running", "runner jogging park"], "ask": "running or jogging", "postures": ["upright"]},
    "sit": {"cats": ["Sitting women", "People sitting on benches"], "q": ["woman sitting on chair", "woman seated bench", "man sitting on bench"], "ask": "sitting on a chair, bench or seat", "postures": ["seated", "low"]},
    "crouch": {"cats": ["Squatting people", "Crouching people"], "q": ["woman crouching", "crouching man squat", "squatting woman"], "ask": "crouching or squatting low on their feet"},
    "kneel": {"cats": ["Kneeling people"], "q": ["woman kneeling", "kneeling man", "person kneeling on one knee"], "ask": "kneeling"},
    "reach": {"cats": ["People reaching for objects"], "q": ["woman reaching up shelf", "reaching up high", "man reaching up"], "ask": "reaching up with one or both arms"},
    "lean": {"cats": ["Leaning people"], "q": ["woman leaning", "man leaning against", "leaning on railing woman"], "ask": "leaning on something"},
    "lie": {"cats": ["Lying women", "People lying on grass"], "q": ["woman lying on grass", "man lying down on grass", "lying on beach towel"], "ask": "lying down", "postures": ["lying"]},
    "jump": {"cats": ["Jumping people"], "q": ["woman jumping in the air", "man jumping mid air", "jumping for joy"], "ask": "jumping with both feet off the ground"},
    # Everyday
    "phone": {"cats": ["People talking on mobile phones", "Women talking on mobile phones"], "q": ["woman talking on mobile phone", "man on cell phone street", "phone call standing"], "ask": "standing and holding a phone up to the ear or face"},
    "drink": {"cats": ["People holding cups", "Women holding cups"], "q": ["woman holding coffee cup standing", "woman holding glass of wine", "man holding coffee cup"], "ask": "standing and holding a drink in one hand"},
    "read": {"cats": ["People reading while standing"], "q": ["woman reading book standing", "man reading newspaper standing", "reading a book outdoors"], "ask": "standing and reading a book, paper or menu held in front"},
    "carry": {"cats": ["People carrying plastic shopping bags", "People carrying shopping bags"], "q": ["woman carrying shopping bags", "man carrying bag walking", "woman carrying handbag"], "ask": "carrying a bag", "postures": ["upright"]},
    "wave": {"cats": ["Waving", "People waving"], "q": ["woman waving hand", "man waving hello", "waving goodbye"], "ask": "waving with one hand raised"},
    "point": {"cats": ["People pointing right", "People pointing left"], "q": ["woman pointing", "man pointing finger", "pointing at something"], "ask": "pointing with one arm stretched out"},
    "pockets": {"cats": ["Both hands in pockets", "Hands in pockets"], "q": ["hands in pockets man", "woman hands in pockets", "standing hands in pockets"], "ask": "standing with hands in the pockets"},
    "cross_arms": {"cats": ["Crossed arms (right over left)", "Crossed arms (left over right)"], "q": ["woman arms crossed", "man arms folded", "standing with arms crossed"], "ask": "standing with arms crossed over the chest"},
    "hands_hips": {"cats": ["Both hands on hips", "Female people with both hands on hips"], "q": ["woman hands on hips", "man hands on hips", "standing akimbo"], "ask": "standing with both hands on the hips"},
    "hair_touch": {"cats": ["Hands in hair"], "q": ["woman touching her hair", "woman hand in hair", "fixing her hair"], "ask": "touching their hair with one raised hand"},
    "shrug": {"cats": ["Shrugging"], "q": ["man shrugging", "woman shrugging shoulders", "shrug gesture"], "ask": "shrugging with palms turned up"},
    "look_back": {"cats": ["Looking over shoulder", "Women looking over shoulder"], "q": ["woman looking back over shoulder", "looking over her shoulder", "man looking back over shoulder"], "ask": "turned away and looking back over one shoulder", "postures": ["upright"]},
    "stretch": {"cats": ["Male people stretching", "Stretching"], "q": ["woman stretching arms overhead", "stretching arms up", "man stretching arms above head"], "ask": "stretching both arms up overhead"},
    "lean_wall": {"cats": ["People leaning against walls", "Women leaning against walls"], "q": ["woman leaning against wall", "man leaning on wall", "leaning against brick wall"], "ask": "leaning against a wall"},
    "rail": {"cats": ["People leaning against railings", "Women leaning against railings"], "q": ["woman leaning on railing", "man leaning on railing", "leaning on balcony railing"], "ask": "leaning forward on a railing with the forearms on it"},
    "foot_up": {"q": ["foot on bench tying shoe", "one foot up on step", "foot on bench stretching"], "ask": "standing with one foot raised up on a step, bench or ledge", "postures": None},
    "bend_pick": {"q": ["woman bending down to pick up", "bending over picking up", "man bending to pick up"], "ask": "bending forward at the hips to pick something up", "postures": None},
    "stairs": {"cats": ["People climbing stairs", "Females climbing stairs"], "q": ["woman walking up stairs", "man climbing stairs", "walking down steps woman"], "ask": "walking on stairs", "postures": ["upright"]},
    "climb": {"cats": ["Rock climbing", "Bouldering"], "q": ["rock climbing woman", "bouldering climber", "climbing wall climber"], "ask": "climbing, reaching up for a hold", "postures": None},
    "sit_floor": {"cats": ["Cross-legged sitting", "Women sitting cross-legged", "Men sitting cross-legged"], "q": ["sitting cross-legged", "woman sitting cross legged on floor", "man sitting cross-legged"], "ask": "sitting cross-legged on the floor or ground", "postures": ["low", "seated"]},
    "lounge_elbows": {"q": ["lying propped on elbows beach", "woman reclining on elbows", "relaxing on elbows grass"], "ask": "lying back propped up on the elbows", "postures": ["lying", "seated", "low"]},
    "lie_front": {"q": ["woman lying on stomach", "lying on her front reading", "man lying on stomach"], "ask": "lying on the stomach", "postures": ["lying"]},
    "lie_side": {"q": ["woman lying on her side", "lying on side head on hand", "man lying on his side"], "ask": "lying on one side"},
    "perch_edge": {"cats": ["People sitting on walls", "Women sitting on walls"], "q": ["sitting on wall legs dangling", "woman sitting on ledge", "sitting on edge of pier"], "ask": "sitting on a high edge or wall with the legs hanging down"},
    "hands_behind_head": {"cats": ["Hands behind head", "Women with both hands behind head"], "q": ["hands behind head woman", "man hands behind head", "standing hands behind head"], "ask": "with both hands behind the head, elbows out"},
    "arms_up": {"cats": ["Raised arms (posture)"], "q": ["woman arms raised", "arms up in the air celebrating", "man arms raised victory"], "ask": "standing with both arms raised up above the head"},
    "selfie": {"cats": ["People taking selfies", "Women taking smartphone selfies"], "q": ["woman taking selfie", "man taking a selfie", "selfie smartphone arm outstretched"], "ask": "taking a selfie with a phone held out"},
    "photograph": {"cats": ["Photographers at work"], "q": ["woman photographer with camera", "man taking photo with camera", "photographer shooting standing"], "ask": "holding a camera up to the eye to take a photo"},
    "cook": {"cats": ["People cooking"], "q": ["woman cooking at stove", "man cooking in kitchen", "chef cooking at stove"], "ask": "cooking at a stove or counter", "postures": ["upright"]},
    "laptop": {"cats": ["People using laptops"], "q": ["woman working on laptop", "man using laptop sitting", "sitting with laptop"], "ask": "sitting and using a laptop"},
    "eat": {"cats": ["People eating"], "q": ["woman eating sandwich", "man eating ice cream", "eating street food standing"], "ask": "eating, bringing food up to the mouth"},
    # Two people
    "hug": {"cats": ["People hugging", "Side hugs"], "q": ["couple hugging", "two friends hugging", "embrace couple standing"], "ask": "hugging each other"},
    "dance": {"cats": ["Dancing couples"], "q": ["couple dancing", "ballroom dance couple", "tango dancers couple"], "ask": "dancing together as a couple", "postures": None},
    "fight": {"cats": ["Sparring"], "q": ["sparring boxing two", "martial arts sparring", "kickboxing sparring partners"], "ask": "sparring or fighting each other", "postures": None},
    "hold_hands": {"cats": ["People holding hands", "Holding hands"], "q": ["couple holding hands walking", "couple walking hand in hand", "holding hands walking beach"], "ask": "holding hands"},
    "piggyback": {"cats": ["Piggyback", "Piggy-back riding"], "q": ["piggyback ride couple", "piggyback ride", "carrying on back piggyback"], "ask": "doing a piggyback ride, one carrying the other on the back", "postures": None},
    "high_five": {"cats": ["High fives"], "q": ["high five", "two people high five", "giving high five"], "ask": "giving each other a high five"},
    "toast": {"cats": ["People toasting", "Toasting"], "q": ["couple toasting glasses", "two people toast champagne", "cheers clinking glasses couple"], "ask": "toasting, clinking glasses together"},
    "head_shoulder": {"q": ["head on shoulder couple sitting", "couple sitting bench head on shoulder", "resting head on his shoulder"], "ask": "sitting side by side with one resting their head on the other's shoulder"},
    "selfie_duo": {"cats": ["Group selfies"], "q": ["couple taking selfie", "two friends taking selfie", "selfie together couple"], "ask": "taking a selfie together"},
    # Sport
    "sport_sprint": {"cats": ["Sprinting", "Sprinters"], "q": ["sprinter track race", "sprint athletics", "woman sprinting track"], "ask": "sprinting"},
    "sport_yoga_warrior": {"cats": ["Virabhadrasana II", "Virabhadrasana"], "q": ["warrior pose yoga", "virabhadrasana", "yoga warrior two"], "ask": "doing the yoga warrior pose with legs wide and arms straight out", "min_drawn": 0.6, "postures": None},
    "sport_yoga_dog": {"cats": ["Adho Mukha Svanasana"], "q": ["downward dog yoga", "adho mukha svanasana", "downward facing dog pose"], "ask": "in the yoga downward dog pose, hips high", "postures": ["bent", "inverted", "low"]},
    "sport_cycle": {"cats": ["Road cycling"], "q": ["cyclist road bike riding", "woman cycling road bike", "cycling race rider"], "ask": "riding a bicycle", "postures": None},
    "sport_swing": {"cats": ["Swing (golf)"], "q": ["golfer swing follow through", "golf swing", "woman golfer swing"], "ask": "swinging a golf club"},
    "sport_serve": {"cats": ["Service (tennis)", "Tennis serves"], "q": ["tennis serve", "tennis player serving", "woman tennis serve"], "ask": "serving in tennis, racket raised overhead", "postures": None},
    "sport_forehand": {"cats": ["Forehand (tennis)"], "q": ["tennis forehand", "tennis player forehand", "forehand stroke tennis woman"], "ask": "hitting a tennis forehand", "postures": None},
    "sport_jump_shot": {"cats": ["Jump shot"], "q": ["basketball jump shot", "basketball player shooting", "jump shot basketball woman"], "ask": "shooting a basketball", "postures": None},
    "sport_kick": {"q": ["soccer player kicking ball", "football kick player", "woman kicking soccer ball"], "ask": "kicking a ball", "postures": None},
    "sport_throw": {"cats": ["Javelin throwers"], "q": ["javelin throw", "throwing ball overhand", "quarterback throwing"], "ask": "throwing something overhand", "postures": None},
    "sport_lunge": {"cats": ["Lunge (exercise)", "Walking lunges"], "q": ["lunge exercise", "fencing lunge", "woman doing lunges"], "ask": "in a deep lunge", "postures": None},
    "sport_handstand": {"cats": ["Handstands", "Handstands on floors"], "q": ["handstand", "woman doing handstand", "handstand beach"], "ask": "doing a handstand, upside down on the hands", "postures": ["inverted"]},
    "sport_pitch": {"cats": ["Baseball pitchers"], "q": ["baseball pitcher pitching", "softball pitcher", "pitcher windup"], "ask": "pitching a baseball or softball", "postures": None},
    "sport_stick": {"cats": ["Field hockey players"], "q": ["field hockey player", "ice hockey player stick", "lacrosse player"], "ask": "playing hockey, holding the stick low", "postures": None},
    "sport_block": {"cats": ["Beach volleyball blockers"], "q": ["volleyball block", "volleyball blocking net", "volleyball players block"], "ask": "blocking at a volleyball net with both arms up", "postures": None},
    "sport_hurdle": {"cats": ["Hurdling", "Hurdlers"], "q": ["hurdles race athlete", "hurdler clearing hurdle", "woman hurdles"], "ask": "jumping over a hurdle", "postures": None},
    "sport_slide": {"cats": ["Slide (baseball)", "Sliding (baseball)"], "q": ["baseball slide base", "sliding into base", "softball slide"], "ask": "sliding along the ground into a base", "postures": None},
    "sport_dunk": {"cats": ["Slam dunk"], "q": ["basketball dunk", "slam dunk player", "dunking basketball"], "ask": "dunking a basketball", "postures": None},
    "sport_ski": {"cats": ["Alpine skiers"], "q": ["skier skiing downhill", "alpine skiing woman", "skiing slope skier"], "ask": "skiing", "postures": None},
    "sport_putt": {"cats": ["Putting (golf)"], "q": ["golfer putting", "golf putt green", "putting stroke golfer"], "ask": "putting a golf ball", "postures": None},
    "sport_overhead": {"q": ["tennis overhead smash", "badminton smash", "badminton player smash"], "ask": "hitting an overhead smash, racket above the head", "postures": None},
    "sport_swim": {"cats": ["Freestyle swimming"], "q": ["swimmer freestyle", "swimming freestyle stroke", "woman swimming pool"], "ask": "swimming", "postures": ["lying"]},
    "sport_spike": {"cats": ["Attack (volleyball)"], "q": ["volleyball spike", "volleyball player spiking", "beach volleyball spike"], "ask": "spiking a volleyball in the air", "postures": None},
    "sport_box": {"cats": ["Boxing training"], "q": ["boxer punching", "boxing training punch", "woman boxing punch"], "ask": "boxing, throwing a punch or with fists up", "postures": None},
    "sport_surf": {"cats": ["Surfers"], "q": ["surfer riding wave", "surfing woman wave", "surfer on surfboard"], "ask": "surfing, standing on a surfboard", "postures": None},
    "sport_squat": {"cats": ["Squat (exercise)", "Weighted squats"], "q": ["barbell back squat", "squat weightlifting", "woman barbell squat"], "ask": "doing a barbell squat", "postures": None},
    "sport_deadlift": {"cats": ["Deadlift", "Sumo deadlift"], "q": ["deadlift barbell", "woman deadlift", "powerlifting deadlift"], "ask": "lifting a barbell from the floor in a deadlift", "postures": None},
    "sport_pushup": {"cats": ["Push-ups"], "q": ["push-up exercise", "woman doing push ups", "push ups fitness"], "ask": "doing a push-up", "postures": ["lying", "low", "bent"]},
    "sport_plank": {"cats": ["Plank exercise", "Planks"], "q": ["plank exercise", "woman doing plank", "forearm plank"], "ask": "holding a plank", "postures": ["lying", "low", "bent"]},
    "sport_pullup": {"cats": ["Pull-ups", "Chin-ups"], "q": ["pull-up bar exercise", "pull ups workout", "chin up bar"], "ask": "doing a pull-up, hanging from a bar", "postures": None},
    "sport_skate": {"cats": ["Skateboarders", "Female skateboarders"], "q": ["skateboarder riding", "skateboarding woman", "skater skateboard street"], "ask": "riding a skateboard", "postures": None},
}

# Photos looked at on the contact sheets and dropped by hand (photo key → why). The harvester
# logs them as `curated-out` and moves on to the next candidate.
EXCLUDE: dict[str, str] = {
    "flickr:54591446841": "sport_plank: climbing an obstacle, not a plank",
    "commons:file:kavya_-_karnasana.jpg": "sport_plank: a side yoga pose, not a plank",
    "flickr:54212249447": "sport_putt: kneeling on the green, not putting",
    "commons:file:arthur_sleasman,_md._state,_'23_loc_npcc.08558.jpg": "sport_stick: a baseball catcher",
    "commons:file:fawad_ahmad_afghan_national_powerlifting.jpg": "sport_deadlift: standing upright",
    "commons:file:atleta_júlio_ferraz_no_campeonato_brasileiro_2017.jpg": "sport_deadlift: standing upright",
}
