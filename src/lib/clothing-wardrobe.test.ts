import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGenerateWardrobeAssignments,
  buildGenerateWardrobeUserDirective,
  hintsDescribeAthleticDuoCompetition,
  mergeGenerateWardrobeIntoPrompt,
  refreshSportWardrobeAssignmentForPrompt,
  shouldPickGenerateWardrobe,
} from "./generate-wardrobe";
import {
  collectWardrobeEntryIds,
  getClothingEntry,
  mergeWardrobeAssignmentsIntoPrompt,
  sanitizeCatalogScriptsInPrompt,
} from "./clothing-catalog";
import {
  buildClothingGuardrailLines,
  buildClothingPickFilters,
  hintsDescribeCyclingActivity,
  hintsLockPrimaryGarment,
  hintsSpecifyDress,
  hintsSpecifyFootwear,
  extractBriefGarmentPhrases,
  hintsSwimwearOnlyMode,
  hintsWorkWardrobeAllowed,
  inferAthleticSport,
  inferWorkProfession,
  hintsFantasyWardrobe,
  hintsImplyNoClothing,
  scoreClothingLabelAgainstHints,
} from "./clothing-tags";
import { summaryMatchesSportWardrobe } from "./athletic-sport-profiles";
import {
  appendCyclingHelmetToSummary,
  ensureAthleticBottomInPrompt,
  ensureCyclingHelmetInPrompt,
  inferCyclingDiscipline,
  resolveAthleticSportForWardrobe,
  stripForeignSportActionsFromPrompt,
  stripIncompatibleCyclingVenuesFromPrompt,
} from "./athletic-sport-actions";
import { fixPromptRules } from "./prompt-fix";
import { buildRandomCharacterSeed } from "./specialized/scene-pools";
import { pickDistinctIdentitySeeds } from "./variation-seed";
import { paintDistinctPeopleScene, stripStreetClothingFromAthleticPeoplePrompt } from "./distinct-people";
import { pickRandomCharacterOutfit } from "./clothing-catalog";
import { DEFAULT_GENERATION_SETTINGS } from "./generation-settings";

describe("hintsLockPrimaryGarment", () => {
  it("locks on explicit garment phrases", () => {
    assert.equal(hintsLockPrimaryGarment("woman in a red bikini"), true);
    assert.equal(hintsLockPrimaryGarment("wearing a floor-length evening gown"), true);
    assert.equal(hintsLockPrimaryGarment("beautiful woman in a dress"), true);
  });

  it("detects generic dress phrasing", () => {
    assert.equal(hintsSpecifyDress("beautiful woman in a dress"), true);
    assert.equal(hintsSpecifyDress("model wearing a red cocktail dress"), true);
    assert.equal(hintsSpecifyDress("neon alley, rain, black cat"), false);
  });

  it("locks on structured outfit clauses from the brief", () => {
    assert.equal(hintsLockPrimaryGarment("woman in a red top and jeans"), true);
    assert.equal(hintsLockPrimaryGarment("wearing a black hoodie and sneakers"), true);
  });

  it("does not lock on scene text without structured garments", () => {
    assert.equal(hintsLockPrimaryGarment("neon alley, rain, black cat"), false);
    assert.equal(hintsLockPrimaryGarment("vendor near the docks at dusk"), false);
  });
});

describe("brief garment matching", () => {
  it("extracts separates named in the brief", () => {
    const phrases = extractBriefGarmentPhrases("woman in a red top and jeans");
    assert.ok(phrases.some((phrase) => /top/i.test(phrase)));
    assert.ok(phrases.some((phrase) => /jeans/i.test(phrase)));
  });

  it("scores catalog labels against brief colors and garment types", () => {
    const hint = "woman in a red top and jeans";
    assert.ok(
      scoreClothingLabelAgainstHints("crimson mesh v-neck tee", hint) >
        scoreClothingLabelAgainstHints("mint flannel long-sleeve tee", hint),
    );
    assert.ok(scoreClothingLabelAgainstHints("indigo straight-leg jeans", hint) >= 8);
  });

  it("picks jeans and a top-like piece when the brief names them", () => {
    const outfit = pickRandomCharacterOutfit(
      buildClothingPickFilters({
        hints: "woman in a red top and jeans",
        gender: "women",
      }),
    );
    assert.equal(outfit.filters.lockPrimaryGarment, true);
    assert.match(outfit.summary, /\bjeans\b/i);
    assert.match(outfit.summary, /\b(?:top|tee|blouse|shirt|hoodie|sweater)\b/i);
    assert.doesNotMatch(outfit.summary, /\b(?:gown|tuxedo|bikini)\b/i);
  });
});

describe("activity and location wardrobe", () => {
  it("maps beach/pool/sauna scenes to swimwear contexts", () => {
    assert.ok(
      buildClothingPickFilters({ hints: "woman at a tropical beach" }).contexts.includes(
        "swimwear",
      ),
    );
    assert.ok(
      buildClothingPickFilters({ hints: "woman at the swimming pool" }).swimwearOnly,
    );
    assert.ok(
      buildClothingPickFilters({ hints: "woman at a sauna" }).contexts.includes("swimwear"),
    );
  });

  it("prefers swimwear over street jeans at the pool", () => {
    const filters = buildClothingPickFilters({
      hints: "woman in jeans at the swimming pool",
      gender: "women",
    });
    assert.equal(filters.lockPrimaryGarment, false);
    assert.equal(filters.swimwearOnly, true);
    const outfit = pickRandomCharacterOutfit(filters);
    assert.match(outfit.summary, /\b(?:bikini|swimsuit|swim|tankini|rash|board shorts|monokini)\b/i);
    assert.doesNotMatch(outfit.summary, /\bjeans\b/i);
  });

  it("keeps intentional clothed poolside outfits when requested", () => {
    const filters = buildClothingPickFilters({
      hints: "woman fully clothed poolside in jeans",
      gender: "women",
    });
    assert.equal(filters.lockPrimaryGarment, true);
  });

  it("treats gym venues as athletic activity", () => {
    const filters = buildClothingPickFilters({ hints: "woman at the gym" });
    assert.equal(filters.athleticActivity, true);
    assert.ok(filters.contexts.includes("athletic"));
    const outfit = pickRandomCharacterOutfit(filters);
    assert.doesNotMatch(outfit.summary, /\b(?:evening gown|tuxedo|bikini|wizard)\b/i);
  });

  it("infers running sport from track venues", () => {
    const filters = buildClothingPickFilters({
      hints: "runner on a track",
      gender: "women",
    });
    assert.equal(filters.athleticSport, "running");
    const outfit = pickRandomCharacterOutfit(filters);
    assert.match(
      outfit.summary,
      /\b(?:running|singlet|track pants|shorts|trainer|sneaker)\b/i,
    );
  });

  it("does not roll service uniforms for bare office settings", () => {
    const filters = buildClothingPickFilters({ hints: "woman at the office" });
    assert.equal(filters.workWardrobe, false);
    assert.equal(filters.contexts.includes("work"), false);
    const outfit = pickRandomCharacterOutfit(filters);
    assert.doesNotMatch(
      outfit.summary,
      /\b(?:chef|scrubs|firefighter|coveralls|lab coat|police duty|steel-toe|chore coat)\b/i,
    );
  });

  it("still rolls profession uniforms when the job is named", () => {
    const filters = buildClothingPickFilters({ hints: "portrait of a chef in a kitchen" });
    assert.equal(filters.workWardrobe, true);
    assert.equal(filters.workProfession, "chef");
  });
});

describe("work and swim context", () => {
  it("allows profession-only work wardrobe", () => {
    assert.equal(hintsWorkWardrobeAllowed("portrait of a chef"), true);
    assert.equal(inferWorkProfession("portrait of a chef in studio"), "chef");
  });

  it("detects swimwear-only beach context", () => {
    assert.equal(
      hintsSwimwearOnlyMode("tropical beach photoshoot", ["beach", "swimwear", "warm"]),
      true,
    );
  });
});

describe("hintsImplyNoClothing", () => {
  it("detects naked and nude intent", () => {
    assert.equal(hintsImplyNoClothing("naked woman in studio"), true);
    assert.equal(hintsImplyNoClothing("artistic nude portrait"), true);
    assert.equal(hintsImplyNoClothing("nude"), true);
  });

  it("does not treat fashion nude color as nudity intent", () => {
    assert.equal(hintsImplyNoClothing("nude sheer pantyhose"), false);
    assert.equal(hintsImplyNoClothing("nude heels and red dress"), false);
  });

  it("skips wardrobe rolls when naked is in hints", () => {
    assert.equal(
      shouldPickGenerateWardrobe("naked woman, soft window light", true),
      false,
    );
    const assignments = buildGenerateWardrobeAssignments(
      "naked woman, soft window light",
      { ...DEFAULT_GENERATION_SETTINGS, alwaysIncludeClothing: true },
      { assumePeople: true },
    );
    assert.equal(assignments, null);
  });

  it("does not auto-roll wardrobe when Always include wardrobe is unchecked", () => {
    assert.equal(
      shouldPickGenerateWardrobe("a woman on a rooftop at dusk", false),
      false,
    );
    assert.equal(
      shouldPickGenerateWardrobe("a woman in a red dress on a rooftop", false),
      false,
    );
    const assignments = buildGenerateWardrobeAssignments(
      "a woman on a rooftop at dusk",
      { ...DEFAULT_GENERATION_SETTINGS, alwaysIncludeClothing: false },
      { assumePeople: true },
    );
    assert.equal(assignments, null);
  });
});

describe("multi-person wardrobe assignments", () => {
  it("builds distinct outfits for duo input", () => {
    const assignments = buildGenerateWardrobeAssignments(
      "two women on a rooftop bar",
      { ...DEFAULT_GENERATION_SETTINGS, distinctPeople: true, seedLlmWithIngredients: true, alwaysIncludeClothing: true },
      { assumePeople: true, forcedCount: 2, forcedDistinctPeople: true },
    );

    assert.ok(assignments && assignments.length === 2);
    assert.notEqual(assignments[0]?.summary, assignments[1]?.summary);
    assert.match(buildGenerateWardrobeUserDirective(assignments) ?? "", /Per-person scene rules/);
  });

  it("uses matching race kits for athletic duo competition scenes", () => {
    const hint =
      "A fierce competition unfolds as two female gravel cyclists push themselves to the limit";
    assert.equal(hintsDescribeAthleticDuoCompetition(hint), true);

    const assignments = buildGenerateWardrobeAssignments(
      hint,
      { ...DEFAULT_GENERATION_SETTINGS, distinctPeople: true, seedLlmWithIngredients: true, alwaysIncludeClothing: true },
      { assumePeople: true, forcedCount: 2, forcedDistinctPeople: true },
    );

    assert.ok(assignments && assignments.length === 2);
    assert.equal(assignments[0]?.summary, assignments[1]?.summary);
    assert.match(assignments[0]?.summary ?? "", /helmet/i);
    assert.match(
      buildGenerateWardrobeUserDirective(assignments) ?? "",
      /same race kit cut/i,
    );
  });

  it("tracks bottom layer ids in outfit collection", () => {
    const ids = collectWardrobeEntryIds({
      wardrobeId: "top-1",
      bottomId: "bottom-1",
      footwearId: "shoe-1",
    });
    assert.deepEqual(ids, ["top-1", "bottom-1", "shoe-1"]);
  });

  it("assigns a dress when the brief says in a dress", () => {
    const assignments = buildGenerateWardrobeAssignments(
      "beautiful woman in a dress",
      { ...DEFAULT_GENERATION_SETTINGS, seedLlmWithIngredients: true, alwaysIncludeClothing: true },
      { assumePeople: true },
    );

    assert.ok(assignments && assignments.length === 1);
    assert.match(assignments[0]?.summary ?? "", /\bdress\b/i);
    assert.doesNotMatch(assignments[0]?.summary ?? "", /\bblouse\b/i);
    assert.equal(assignments[0]?.filters.lockPrimaryGarment, true);
    assert.match(
      buildGenerateWardrobeUserDirective(assignments) ?? "",
      /brief requires a dress/i,
    );
  });

  it("respects mini dress and tall heels in the brief", () => {
    const hint = "beautiful woman in mini dress and tall heels";
    assert.equal(hintsSpecifyDress(hint), true);
    assert.equal(hintsSpecifyFootwear(hint), true);
    assert.deepEqual(extractBriefGarmentPhrases(hint), ["mini dress", "tall heels"]);

    const assignments = buildGenerateWardrobeAssignments(
      hint,
      { ...DEFAULT_GENERATION_SETTINGS, seedLlmWithIngredients: true, alwaysIncludeClothing: true },
      { assumePeople: true },
    );

    assert.ok(assignments && assignments.length === 1);
    const summary = assignments[0]?.summary ?? "";
    const directive = buildGenerateWardrobeUserDirective(assignments) ?? "";

    assert.doesNotMatch(summary, /\bloafer\b/i);
    assert.doesNotMatch(summary, /\bslip dress\b/i);
    assert.doesNotMatch(summary, /\btie\b/i);
    assert.match(directive, /mini dress/i);
    assert.match(directive, /tall heels/i);

    if (/\bdress\b/i.test(summary)) {
      assert.match(summary, /\b(?:mini|cropped)\b/i);
    }
    if (/\b(?:shoe|heel|pump|sandal|boot|loafer)\b/i.test(summary)) {
      assert.match(summary, /\b(?:heel|pump|stiletto)\b/i);
    }
  });
});

describe("merge and sanitize", () => {
  it("injects wardrobe for person 3 sentences", () => {
    const prompt =
      "Person on the left wears a red coat. Person on the right smiles. Person 3 watches from the center.";
    const merged = mergeWardrobeAssignmentsIntoPrompt(prompt, [
      { label: "person on the left", summary: "navy peacoat, black boots" },
      { label: "person on the right", summary: "olive field jacket, tan chinos" },
      { label: "person 3", summary: "charcoal hoodie, gray joggers" },
    ]);

    assert.match(merged, /Person 3 watches from the center, wearing charcoal hoodie, gray joggers\./i);
  });

  it("replaces catalog scripts with labels when entry id is known", () => {
    const entry = getClothingEntry("top-frost-lace-chef-coat");
    assert.ok(entry);
    const sanitized = sanitizeCatalogScriptsInPrompt(
      `She wears ${entry!.script} under warm light.`,
      [entry!.id],
    );
    assert.match(sanitized, new RegExp(entry!.label, "i"));
    assert.doesNotMatch(sanitized, /natural fabric creases/);
  });
});

describe("sport-specific wardrobe", () => {
  it("detects cycling activity from cyclist cues", () => {
    const corpus =
      "fierce female cyclist dives sideways during a competitive race on a dirt track";
    assert.equal(inferAthleticSport(corpus), "cycling");
    assert.equal(hintsDescribeCyclingActivity(corpus), true);
  });

  it("picks cycling kit pieces instead of track pants or soccer cleats", () => {
    const filters = buildClothingPickFilters({
      hints:
        "fierce female cyclist competitive race dirt track cleats ahead",
      environmentSeed: "female cyclist competitive race",
    });
    assert.equal(filters.athleticSport, "cycling");

    const outfit = pickRandomCharacterOutfit(filters);
    const summary = outfit.summary.toLowerCase();
    assert.doesNotMatch(summary, /track pants/);
    assert.doesNotMatch(summary, /soccer cleats/);
    assert.match(
      summary,
      /\b(?:cycling jersey|cycling kit|cycling bib shorts|bib shorts|cycling shoes)\b/,
    );
  });

  it("picks basketball jersey sets for basketball scenes", () => {
    const filters = buildClothingPickFilters({
      hints: "point guard driving to the hoop during an nba game",
      environmentSeed: "basketball player indoor court",
    });
    assert.equal(filters.athleticSport, "basketball");

    const outfit = pickRandomCharacterOutfit(filters);
    const summary = outfit.summary.toLowerCase();
    assert.match(summary, /\bbasketball jersey set\b/);
    assert.doesNotMatch(summary, /cycling kit/);
    assert.doesNotMatch(summary, /soccer cleats/);
  });

  it("picks judogi for martial arts scenes", () => {
    const filters = buildClothingPickFilters({
      hints: "karate student bowing in the dojo before sparring",
      environmentSeed: "martial arts dojo",
    });
    assert.equal(filters.athleticSport, "martial_arts");

    const outfit = pickRandomCharacterOutfit(filters);
    const summary = outfit.summary.toLowerCase();
    assert.match(summary, /\b(?:judogi|karate gi|dobok)\b/);
    assert.doesNotMatch(summary, /cycling bib shorts/);
    assert.doesNotMatch(summary, /track pants/);
  });

  it("picks climbing shoes for bouldering scenes", () => {
    const filters = buildClothingPickFilters({
      hints: "climber dynoing on an overhang during a bouldering session",
      environmentSeed: "indoor climbing wall",
    });
    assert.equal(filters.athleticSport, "climbing");

    const outfit = pickRandomCharacterOutfit(filters);
    const summary = outfit.summary.toLowerCase();
    assert.match(summary, /\bclimbing shoes\b/);
    assert.doesNotMatch(summary, /soccer cleats/);
    assert.doesNotMatch(summary, /cycling shoes/);
  });

  it("picks cycling kit for on-bike competition scenes without the word cyclist", () => {
    const filters = buildClothingPickFilters({
      hints: "woman on bike fierce competition solo race wet pavement",
      environmentSeed: "woman on bike fierce competition solo race wet pavement",
      gender: "women",
    });
    assert.equal(filters.athleticSport, "cycling");

    const outfit = pickRandomCharacterOutfit(filters);
    const summary = outfit.summary.toLowerCase();
    assert.doesNotMatch(summary, /track pants/);
    assert.doesNotMatch(summary, /running shoes/);
    assert.match(
      summary,
      /\b(?:cycling jersey|cycling kit|cycling bib shorts|bib shorts|cycling shoes|cleats)\b/,
    );
  });

  it("refreshes wrong generic athletic assignment when prompt clearly describes cycling", () => {
    const wrongAssignment = {
      summary: "mustard fleece mesh jersey, sepia track pants, oatmeal running shoes",
      filters: buildClothingPickFilters({
        hints: "fierce competition sprint race wet pavement snow",
        gender: "women",
      }),
    };
    const prompt =
      "A woman cyclist in a fierce competition sprints across the wet pavement. She wears a mustard fleece mesh jersey and sepia track pants. Her oatmeal running shoes grip the wet surface as she leans forward on the bike.";

    const refreshed = refreshSportWardrobeAssignmentForPrompt(prompt, wrongAssignment as never);
    assert.equal(refreshed.filters.athleticSport, "cycling");
    assert.equal(summaryMatchesSportWardrobe("cycling", refreshed.summary), true);
  });

  it("prefers track and field over cycling when javelin throw is in the scene", () => {
    const corpus =
      "fierce competition scene intense woman cyclist hurling a javelin mid-motion body rotating";
    assert.equal(inferAthleticSport(corpus), "track_field");

    const filters = buildClothingPickFilters({
      hints: corpus,
      environmentSeed: corpus,
      gender: "women",
    });
    assert.equal(filters.athleticSport, "track_field");

    const outfit = pickRandomCharacterOutfit(filters);
    const summary = outfit.summary.toLowerCase();
    assert.doesNotMatch(summary, /cycling kit/);
    assert.doesNotMatch(summary, /cycling bib shorts/);
    assert.doesNotMatch(summary, /climbing shoes/);
    assert.match(summary, /\b(?:running singlet|singlet|running shorts|track pants|running shoes)\b/);
  });

  it("does not treat endurance physique preset copy as cycling activity", () => {
    assert.equal(
      inferAthleticSport("athletic individual lean endurance-toned physique hurling javelin"),
      "track_field",
    );
    assert.equal(
      inferAthleticSport("athletic individual lean cyclist-toned physique portrait"),
      null,
    );
  });

  it("includes sport-specific guardrails in directives", () => {
    const lines = buildClothingGuardrailLines({
      gender: "women",
      contexts: ["athletic"],
      athleticActivity: true,
      athleticSport: "cycling",
    });
    assert.ok(lines.some((line) => line.includes("bib shorts")));
    assert.ok(lines.some((line) => line.includes("No track pants")));
  });
});

describe("character action seeds", () => {
  it("builds duo cycling competition seeds from two-cyclist hints", () => {
    const { seed } = buildRandomCharacterSeed(
      "two female cyclists in a fierce competition",
      "action",
    );
    assert.match(seed, /two subjects only/i);
    assert.match(seed, /two women/i);
    assert.match(seed, /wheel-to-wheel competition/i);
    assert.doesNotMatch(seed, /solo subject only/i);
    assert.doesNotMatch(seed, /javelin/i);
  });

  it("keeps gravel cyclists off velodromes in action seeds", () => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { seed, location } = buildRandomCharacterSeed(
        "gravel cyclist on a long adventure ride",
        "action",
      );
      assert.doesNotMatch(seed, /velodrome|banking turn|indoor track/i);
      assert.doesNotMatch(location, /velodrome|banking turn|indoor track/i);
      assert.match(
        seed,
        /gravel|fire road|doubletrack|rail-trail|unpaved|dirt|loose/i,
      );
    }
  });

  it("strips velodrome language from gravel cyclist prompts", () => {
    const polluted =
      "A gravel cyclist charges through a velodrome banking turn under harsh floodlights, wearing a dusty kit.";
    const cleaned = stripIncompatibleCyclingVenuesFromPrompt(
      polluted,
      "gravel cyclist adventure ride",
    );
    assert.doesNotMatch(cleaned, /velodrome|banking turn/i);
    assert.match(cleaned, /gravel|fire road|loose/i);
  });

  it("detects gravel discipline before generic road cycling", () => {
    assert.equal(inferCyclingDiscipline("gravel cyclist"), "gravel");
    assert.equal(inferCyclingDiscipline("road cyclist criterium"), "road");
    assert.equal(inferCyclingDiscipline("velodrome sprint"), "track");
    assert.equal(inferCyclingDiscipline("mountain biker on singletrack"), "mountain");
    assert.equal(inferCyclingDiscipline("downhill rider"), "mountain");
    assert.equal(inferCyclingDiscipline("generic cyclist sprint"), "road");
  });

  it("keeps mountain bikers on trail terrain in action seeds", () => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { seed, location } = buildRandomCharacterSeed(
        "mountain biker charging a rocky singletrack descent",
        "action",
      );
      assert.doesNotMatch(seed, /velodrome|city circuit|cobblestone race/i);
      assert.doesNotMatch(location, /velodrome|city circuit|cobblestone race/i);
      assert.match(seed, /singletrack|trail|rocky|alpine|flow trail|pine-needle/i);
    }
  });

  it("keeps road cyclists on paved race terrain in action seeds", () => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { seed, location } = buildRandomCharacterSeed(
        "road cyclist in a criterium sprint",
        "action",
      );
      assert.doesNotMatch(seed, /singletrack|fire road|doubletrack|velodrome/i);
      assert.doesNotMatch(location, /singletrack|fire road|doubletrack|velodrome/i);
      assert.match(
        seed,
        /city circuit|cobblestone|open road|road bike|racing bicycle|wet pavement/i,
      );
    }
  });

  it("strips foreign actions from basketball prompts", () => {
    const prompt =
      "Two players battle on court as one hurls a javelin across the hardwood while wearing a navy jersey.";
    const cleaned = stripForeignSportActionsFromPrompt(prompt, "basketball");
    assert.doesNotMatch(cleaned, /javelin/i);
    assert.match(cleaned, /jump shot|basketball|hardwood|court/i);
  });

  it("strips foreign actions from soccer prompts", () => {
    const prompt =
      "A midfielder pedaling hard on handlebars through the penalty area in full kit.";
    const cleaned = stripForeignSportActionsFromPrompt(prompt, "soccer");
    assert.doesNotMatch(cleaned, /pedaling|handlebars/i);
    assert.match(cleaned, /ball|kit|soccer|pitch|follow-through/i);
  });

  it("strips cycling verbs from marathon running prompts", () => {
    const prompt =
      "A fit female marathon runner in a race bib and running singlet drives powerful thighs stroke pedals on a bridge footpath at dawn.";
    const cleaned = stripForeignSportActionsFromPrompt(prompt, "running");
    assert.doesNotMatch(cleaned, /pedals?|pedaling|handlebars|cyclist/i);
    assert.match(cleaned, /runner|stride|singlet|race bib/i);
  });

  it("adds running shorts when a runner prompt omits bottoms", () => {
    const prompt =
      "A fit female marathon runner in a race bib and frost wool running singlet strides across a bridge footpath at dawn.";
    const fixed = ensureAthleticBottomInPrompt(prompt, "running");
    assert.match(fixed, /running shorts|track pants|shorts/i);
  });

  it("fixPromptRules adds missing running bottoms", () => {
    const result = fixPromptRules({
      hints: "female marathon runner",
      prompt:
        "A woman marathon runner wearing a frost wool running singlet sprints through morning fog on a riverside path.",
    });
    assert.match(result.prompt, /running shorts|track pants|shorts/i);
    assert.ok(result.changes.some((change) => change.code === "sport.add_bottom_layer"));
  });

  it("keeps cycling intent when the model hallucinates a javelin throw", () => {
    const intent = "two female cyclists in a fierce competition";
    const polluted =
      "A fierce competition scene with an intense woman cyclist hurling a javelin mid-motion, wearing cropped ivory cycling kit, rose cycling shoes.";
    assert.equal(
      resolveAthleticSportForWardrobe(intent, polluted, "cycling"),
      "cycling",
    );
    const assignment = {
      summary: "cropped ivory cycling kit, rose cycling shoes",
      filters: buildClothingPickFilters({ hints: intent, gender: "women" }),
    };
    const merged = mergeGenerateWardrobeIntoPrompt(
      polluted,
      [assignment],
      undefined,
      intent,
    );
    assert.doesNotMatch(merged, /javelin/i);
    assert.match(merged, /cycling kit/i);
  });
});

describe("athletic duo identity", () => {
  it("uses clothing-free identity seeds for athletic scenes", () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const seeds = pickDistinctIdentitySeeds(2, "women", { athletic: true });
      assert.equal(seeds.length, 2);
      assert.notEqual(seeds[0], seeds[1]);
      for (const seed of seeds) {
        assert.doesNotMatch(
          seed,
          /linen dress|bright sari|robes|apron|sneakers|pregnant|school-age|elderly|older|retired|teenage|reading glasses/i,
        );
        assert.match(
          seed,
          /\b(?:twenties|thirties|forties|late twenties|early thirties|late thirties|young)\b/i,
        );
      }
    }
  });

  it("paints athletic duo fallback scenes without street clothes", () => {
    const painted = paintDistinctPeopleScene(
      "two female gravel cyclists in a fierce competition",
      { ...DEFAULT_GENERATION_SETTINGS, seedLlmWithIngredients: true, alwaysIncludeClothing: true },
    );
    assert.ok(painted);
    assert.doesNotMatch(painted!, /linen dress|bright sari|robes|apron/i);
    assert.match(painted!, /on the left/i);
    assert.match(painted!, /on the right/i);
  });

  it("strips street clothing from athletic duo prompts", () => {
    const polluted =
      "Gravel cyclist in a fierce competition. On the left, a pregnant woman in her late thirties, curly auburn hair, linen dress, and calm focus; on the right, a pale red-haired woman in her thirties, light freckles, and cropped copper hair, wearing tailored white cycling kit.";
    const cleaned = stripStreetClothingFromAthleticPeoplePrompt(polluted);
    assert.doesNotMatch(cleaned, /linen dress|pregnant/i);
    assert.match(cleaned, /cycling kit/i);
  });

  it("adds gravel cycling helmets to duo competition prompts", () => {
    const prompt =
      "Gravel cyclist in a fierce competition. On the left, a woman in her late thirties with curly auburn hair; on the right, a pale red-haired woman with light freckles, wearing tailored white cycling kit and chocolate cycling shoes.";
    const cleaned = ensureCyclingHelmetInPrompt(
      prompt,
      "two female gravel cyclists in a fierce competition",
    );
    assert.match(cleaned, /gravel cycling helmet/i);
    assert.match(cleaned, /on the left/i);
    assert.match(cleaned, /on the right/i);
  });

  it("picks discipline-specific helmet labels", () => {
    assert.match(
      appendCyclingHelmetToSummary("white cycling kit", "gravel cyclist"),
      /gravel cycling helmet/i,
    );
    assert.match(
      appendCyclingHelmetToSummary("white cycling kit", "mountain biker"),
      /mountain bike helmet/i,
    );
  });
});

describe("buildClothingGuardrailLines", () => {
  it("includes athletic guardrails when activity is detected", () => {
    const lines = buildClothingGuardrailLines({
      gender: "any",
      contexts: ["athletic"],
      athleticActivity: true,
    });
    assert.ok(lines.some((line) => line.includes("Athletic activity")));
  });

  it("includes fantasy guardrails when fantasy wardrobe is active", () => {
    const lines = buildClothingGuardrailLines({
      gender: "any",
      contexts: ["costume"],
      fantasyWardrobe: true,
    });
    assert.ok(lines.some((line) => line.includes("Fantasy setting")));
  });
});

describe("fantasy wardrobe", () => {
  it("detects fantasy hints for wardrobe mode", () => {
    assert.equal(hintsFantasyWardrobe("an elven ranger in an enchanted forest"), true);
    assert.equal(hintsFantasyWardrobe("neon alley, rain, black cat"), false);
  });

  it("builds costume filters for fantasy scenes", () => {
    const filters = buildClothingPickFilters({
      hints: "a fantasy knight in ornate armor, ancient ruin",
      fantasyWardrobe: true,
    });
    assert.equal(filters.fantasyWardrobe, true);
    assert.equal(filters.explicitCostume, true);
    assert.ok(filters.contexts.includes("costume"));
    assert.equal(filters.contexts.includes("casual"), false);
  });

  it("picks fantasy garments instead of modern streetwear", () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const outfit = pickRandomCharacterOutfit(
        buildClothingPickFilters({
          hints: "an elven ranger with elegant gear in an enchanted forest",
          fantasyWardrobe: true,
        }),
      );
      if (!outfit.summary.trim()) {
        continue;
      }
      assert.match(
        outfit.summary,
        /\b(?:wizard|knight|armor|armour|robe|robes|cuirass|elven|elf|ranger|leather|cloak|enchanted|druid|paladin|witch|oracle|mail|tabard|bracers|greaves|boot|fantasy|vestments|sorcer|warlock|dwarven|barbarian|necromancer|cleric|dragonscale|heraldic|travel cloak)\b/i,
        `expected fantasy garment, got: ${outfit.summary}`,
      );
      assert.doesNotMatch(
        outfit.summary,
        /\b(?:jeans|t-shirt|graphic tee|sneaker|hoodie|chinos|loafer|cargo pants|skater outfit)\b/i,
        `modern streetwear leaked: ${outfit.summary}`,
      );
      return;
    }
    assert.fail("failed to pick a fantasy outfit after 12 attempts");
  });

  it("assigns fantasy wardrobe through generate helper", () => {
    const assignments = buildGenerateWardrobeAssignments(
      "an elven ranger with elegant gear, enchanted forest, legendary wonder",
      { ...DEFAULT_GENERATION_SETTINGS, alwaysIncludeClothing: true },
      { assumePeople: true, fantasyWardrobe: true },
    );
    assert.ok(assignments?.length);
    assert.equal(assignments?.[0]?.filters.fantasyWardrobe, true);
    assert.match(
      assignments?.[0]?.summary ?? "",
      /\b(?:elven|elf|ranger|leather|cloak|armor|robe|enchanted|wizard|knight|fantasy|vestments|boot|bracers|cuirass|mail|tabard)\b/i,
    );
  });
});
