import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  tagSoupToProse,
  splitTags,
  joinTags,
  trimTagsToMaxChars,
  expandTagsToMinChars,
  proseToTagSoup,
  promptHasSceneDensity,
  trimProseClauseToMaxChars,
  trimCompleteSentencesToMaxChars,
  trimSentencesByPriority,
  trimSentencesForDistinctPeople,
  trimDistinctPeopleProseToMaxChars,
  findDistinctPeopleSentenceIndexes,
  stripIncompleteDistinctPeopleBridges,
  enforcePromptShapeForProfile,
  buildVisionFormatRules,
  expansionBeatsForSanitize,
  SD15_EXPANSION_TAG_BEATS,
  SOLO_SUBJECT_TAG_BEATS,
} from "./prompt-shape";
import { expansionBeatsForProfile } from "./comfy-models/prompt-profiles";

// prompt-shape.ts is a core, widely-reused text-manipulation module in the
// prompt pipeline (imported by prompt-formatter, clothing-catalog,
// qwen-clarity, distinct-people, sparse-prompt-expand, prompt-compact,
// single-person). Despite that reach, only 3 test files anywhere in the repo
// happen to touch it indirectly, leaving it at 53.65%/72.17%/58.43%
// (line/branch/func) - most of the tag-soup/prose conversion, character
// trimming, and per-profile shaping logic (everything from trimTagsToMaxChars
// onward) had never been directly exercised.

describe("tagSoupToProse", () => {
  it("returns the input unchanged when there is nothing to split", () => {
    assert.equal(tagSoupToProse(""), "");
  });

  it("wraps a single tag into a standalone sentence", () => {
    assert.equal(
      tagSoupToProse("red jacket"),
      "Red jacket under clear directional light in a unified scene."
    );
  });

  it("joins exactly two tags with a supporting clause", () => {
    assert.equal(
      tagSoupToProse("red jacket, blue jeans"),
      "Red jacket, with blue jeans, under clear directional light."
    );
  });

  it("joins three or more tags into a featuring/and clause", () => {
    assert.equal(
      tagSoupToProse("red jacket, blue jeans, black boots"),
      "Red jacket, featuring blue jeans, and black boots, in one cohesive scene with readable lighting."
    );
  });
});

describe("splitTags / joinTags", () => {
  it("splits on commas, semicolons, and pipes and dedupes case-insensitively", () => {
    assert.deepEqual(
      splitTags("red jacket, blue jeans; black boots | red jacket"),
      ["red jacket", "blue jeans", "black boots"]
    );
  });

  it("joins tags with normalized whitespace and dedupes", () => {
    assert.equal(joinTags(["a", "b", "a", "  c  "]), "a, b, c");
  });
});

describe("trimTagsToMaxChars", () => {
  const tags = [
    "woman",
    "red jacket",
    "highly detailed",
    "cinematic lighting",
    "sharp focus",
    "8k",
    "detailed textures",
    "masterpiece",
    "best quality",
  ];

  it("returns the full joined list when it already fits", () => {
    assert.equal(
      trimTagsToMaxChars(tags, 500),
      "woman, red jacket, highly detailed, cinematic lighting, sharp focus, 8k, detailed textures, masterpiece, best quality"
    );
  });

  it("drops low-priority tags first to fit a moderate budget", () => {
    assert.equal(trimTagsToMaxChars(tags, 40), "woman, red jacket, cinematic lighting");
  });

  it("falls back to only the protected lead tag under a tight budget", () => {
    assert.equal(trimTagsToMaxChars(tags, 15), "woman");
  });

  it("returns an empty string for an empty tag list", () => {
    assert.equal(trimTagsToMaxChars([], 50), "");
  });
});

describe("expandTagsToMinChars", () => {
  it("skips padding entirely for a profile with no minChars (sd15_weighted)", () => {
    assert.equal(expandTagsToMinChars("red jacket", "balanced", "sd15", false), "red jacket");
  });

  it("pads with the generic SD15 expansion beats when under minChars, soloSubject=false", () => {
    assert.equal(
      expandTagsToMinChars("red jacket", "balanced", "qwen-rapid-aio-sfw", false),
      "red jacket, sharp focus, detailed textures, cinematic lighting, depth of field, atmospheric perspective, highly detailed"
    );
  });

  it("pads with the solo-subject beats when under minChars, soloSubject=true", () => {
    assert.equal(
      expandTagsToMinChars("red jacket", "balanced", "qwen-rapid-aio-sfw", true),
      "red jacket, solo, empty background, no crowd, single subject"
    );
  });

  it("skips padding when the text is already at or above minChars", () => {
    const longText = "A".repeat(400);
    assert.equal(
      expandTagsToMinChars(longText, "balanced", "qwen-rapid-aio-sfw", false),
      longText
    );
  });
});

describe("proseToTagSoup", () => {
  it("splits a simple sentence into clause-based tags", () => {
    assert.equal(
      proseToTagSoup("A woman in a red jacket, standing on a rooftop at sunset."),
      "woman in a red jacket, standing on a rooftop at sunset"
    );
  });

  it("strips solo-subject language along with its trailing clause", () => {
    assert.equal(
      proseToTagSoup("A woman stands alone in the frame, wearing a red jacket."),
      "woman stands"
    );
  });

  it("returns an empty string for empty input", () => {
    assert.equal(proseToTagSoup(""), "");
  });

  it("caps the tag count at maxTags", () => {
    assert.equal(
      proseToTagSoup(
        "A woman in a red jacket, blue jeans, black boots, silver necklace, leather gloves.",
        2
      ),
      "woman in a red jacket, blue jeans"
    );
  });
});

describe("promptHasSceneDensity", () => {
  it("returns false for empty input", () => {
    assert.equal(promptHasSceneDensity(""), false);
  });

  it("returns true when the prompt has both a subject and specific visual detail", () => {
    assert.equal(promptHasSceneDensity("A woman in a red silk jacket."), true);
  });

  it("returns false for a short prompt with no subject and no specifics", () => {
    assert.equal(promptHasSceneDensity("A beautiful sunset over the ocean today."), false);
  });

  it("returns true for a subject-only prompt once it is long enough (>=180 chars)", () => {
    const text =
      "A woman stands quietly near the edge of the old stone terrace as the afternoon light shifts slowly across the weathered ground and the wind moves gently through the tall grass nearby.";
    assert.ok(text.length >= 180);
    assert.equal(promptHasSceneDensity(text), true);
  });

  it("returns true for a subject-less, multi-sentence prompt once it is long enough (>=220 chars)", () => {
    const text =
      "The morning light spreads slowly across the quiet valley below, catching every ridge and hollow spot. Distant hills fade into a soft haze as gentle wind moves through the tall grass beside the winding path near the old wall.";
    assert.ok(text.length >= 220);
    assert.equal(promptHasSceneDensity(text), true);
  });
});

describe("trimProseClauseToMaxChars", () => {
  const text =
    "The woman stands on a rooftop at sunset. She wears a red jacket and blue jeans. The city lights glow behind her.";

  it("returns the text unchanged when it already fits", () => {
    assert.equal(trimProseClauseToMaxChars(text, 200), text);
  });

  it("trims to the last full sentence when a sentence break is within budget", () => {
    assert.equal(
      trimProseClauseToMaxChars(text, 60),
      "The woman stands on a rooftop at sunset."
    );
  });

  it("still prefers a sentence break over a mid-sentence word break when in range", () => {
    assert.equal(
      trimProseClauseToMaxChars(text, 45),
      "The woman stands on a rooftop at sunset."
    );
  });

  it("hard-trims and appends a period when no good break point exists", () => {
    assert.equal(trimProseClauseToMaxChars(text, 15), "The woman stand.");
  });
});

describe("trimCompleteSentencesToMaxChars", () => {
  const sentences = [
    "A woman stands on a rooftop at sunset.",
    "The lighting mixes a warm key from camera-left.",
    "She wears a red silk jacket and leather boots.",
    "The city skyline glows in the distance.",
  ];

  it("returns all sentences joined when they already fit", () => {
    assert.equal(
      trimCompleteSentencesToMaxChars(sentences, 300),
      sentences.join(" ")
    );
  });

  it("drops the lowest-scoring sentences first (expansion-beat and generic filler)", () => {
    assert.equal(
      trimCompleteSentencesToMaxChars(sentences, 90),
      "A woman stands on a rooftop at sunset. She wears a red silk jacket and leather boots."
    );
  });

  it("returns an empty string for an empty sentence list", () => {
    assert.equal(trimCompleteSentencesToMaxChars([], 50), "");
  });
});

describe("trimSentencesByPriority", () => {
  const sentences = [
    "A woman stands on a rooftop.",
    "The lighting mixes a warm key from camera-left.",
    "She wears a red silk jacket.",
    "The environment recedes through soft atmospheric depth without introducing anything.",
  ];

  it("returns all sentences when the list already fits maxSentences", () => {
    assert.deepEqual(trimSentencesByPriority(sentences, 10), sentences);
  });

  it("always keeps the lead sentence and ranks the rest by score", () => {
    assert.deepEqual(trimSentencesByPriority(sentences, 2), [
      "A woman stands on a rooftop.",
      "She wears a red silk jacket.",
    ]);
  });
});

describe("trimSentencesForDistinctPeople", () => {
  const withLR = [
    "Two women stand in a garden.",
    "On the left, a woman in a red dress smiles.",
    "On the right, a woman in a blue coat looks away.",
    "The lighting mixes a warm key from camera-left.",
  ];

  it("returns all sentences when they already fit", () => {
    assert.deepEqual(trimSentencesForDistinctPeople(withLR, 10), withLR);
  });

  it("keeps the scene lead plus both left/right sentences when there is room for 3", () => {
    assert.deepEqual(trimSentencesForDistinctPeople(withLR, 3), [
      "Two women stand in a garden.",
      "On the left, a woman in a red dress smiles.",
      "On the right, a woman in a blue coat looks away.",
    ]);
  });

  it("drops the scene lead in favor of both people when only 2 slots are available", () => {
    assert.deepEqual(trimSentencesForDistinctPeople(withLR, 2), [
      "On the left, a woman in a red dress smiles.",
      "On the right, a woman in a blue coat looks away.",
    ]);
  });

  it("falls back to trimSentencesByPriority when no left/right structure is present", () => {
    const noLR = [
      "A woman stands on a rooftop.",
      "The lighting mixes a warm key from camera-left.",
      "She wears a red silk jacket.",
    ];
    assert.deepEqual(trimSentencesForDistinctPeople(noLR, 1), [
      "A woman stands on a rooftop.",
    ]);
  });
});

describe("findDistinctPeopleSentenceIndexes / stripIncompleteDistinctPeopleBridges", () => {
  const sentences = [
    "Two women stand in a garden.",
    "On the left, a woman in a red dress smiles.",
    "In stark yet complementing contrast,",
    "On the right, a woman in a blue coat looks away.",
  ];

  it("locates the left- and right-placement sentences by index", () => {
    assert.deepEqual(findDistinctPeopleSentenceIndexes(sentences), {
      leftIdx: 1,
      rightIdx: 3,
    });
  });

  it("drops a trailing contrast lead-in that never introduces the second person", () => {
    assert.deepEqual(stripIncompleteDistinctPeopleBridges(sentences), [
      "Two women stand in a garden.",
      "On the left, a woman in a red dress smiles.",
      "On the right, a woman in a blue coat looks away.",
    ]);
  });
});

describe("trimDistinctPeopleProseToMaxChars", () => {
  const withLR = [
    "Two women stand together in a moody garden at dusk.",
    "On the left, a woman in a flowing red silk dress smiles warmly at the camera under soft light.",
    "On the right, a woman in a sharp tailored blue coat looks away thoughtfully into the distance.",
  ];

  it("returns the joined sentences unchanged when they already fit", () => {
    assert.equal(trimDistinctPeopleProseToMaxChars(withLR, 500), withLR.join(" "));
  });

  it("preserves both people in full via generous per-person budget floors, even under a tighter maxChars", () => {
    // The left/right budget floors (peopleBudget >= 160, leftBudget >= 140,
    // rightBudget >= 100) win out over ordinarily-sized single-sentence
    // descriptions, so this stays untrimmed even well below the joined
    // length - by design, this function avoids mangling either person's
    // description down to an unreadable fragment.
    assert.equal(trimDistinctPeopleProseToMaxChars(withLR, 140), withLR.join(" "));
  });

  it("does trim both people once their descriptions are long enough to exceed the budget floors", () => {
    const scene = "Two women stand together in a moody garden at dusk.";
    const left =
      "On the left, a woman in a flowing red silk dress with intricate hand-embroidered floral patterns smiles warmly at the camera while golden hour light rakes across her shoulders and catches the fine texture of the fabric in soft, directional highlights.";
    const right =
      "On the right, a woman in a sharp tailored navy blue coat with polished brass buttons looks away thoughtfully into the misty distance, her posture relaxed but deliberate against the darkening tree line and the last traces of amber sky overhead.";
    assert.equal(
      trimDistinctPeopleProseToMaxChars([scene, left, right], 200),
      "Two women stand together in a moody garden at dusk. On the left, a woman in a flowing red silk dress with intricate hand-embroidered floral patterns smiles warmly at the camera while golden. On the right, a woman in a sharp tailored navy blue coat with polished brass buttons looks away."
    );
  });

  it("trims the shared sentence when left and right point at the same index", () => {
    const sameSentence = [
      "Two women stand together in a moody garden at dusk.",
      "On the left and on the right, twin sisters in matching flowing red silk dresses smile warmly at the camera under soft directional light from above the frame.",
    ];
    assert.equal(
      trimDistinctPeopleProseToMaxChars(sameSentence, 120),
      "Two women stand together in a moody garden at dusk. On the left and on the right, twin sisters in matching flowing red silk dresses smile warmly at the camera under soft."
    );
  });

  it("keeps the scene and trims a left-only sentence when there is no right placement", () => {
    const leftOnly = [
      "A woman stands in a moody garden at dusk.",
      "On the left, a woman in a flowing red silk dress smiles warmly at the camera under soft directional light from above.",
    ];
    assert.equal(
      trimDistinctPeopleProseToMaxChars(leftOnly, 90),
      "A woman stands in a moody garden at dusk. On the left, a woman in a flowing red silk."
    );
  });

  it("keeps the scene and drops a right-only sentence that is too long to fit, via trimCompleteSentencesToMaxChars", () => {
    const rightOnly = [
      "A woman stands in a moody garden at dusk.",
      "On the right, a woman in a flowing red silk dress smiles warmly at the camera under soft directional light from above.",
    ];
    assert.equal(
      trimDistinctPeopleProseToMaxChars(rightOnly, 90),
      "A woman stands in a moody garden at dusk."
    );
  });

  it("falls back to greedily appending sentences when neither left nor right placement is found", () => {
    const neither = [
      "A woman stands in a moody garden at dusk.",
      "She wears a flowing red silk dress and smiles warmly.",
      "The lighting mixes a warm key from camera-left.",
      "The city skyline glows in the distance behind her.",
    ];
    assert.equal(
      trimDistinctPeopleProseToMaxChars(neither, 80),
      "A woman stands in a moody garden at dusk."
    );
  });

  it("returns an empty string for an empty sentence list", () => {
    assert.equal(trimDistinctPeopleProseToMaxChars([], 50), "");
  });
});

describe("enforcePromptShapeForProfile", () => {
  it("returns an empty prompt unchanged", () => {
    assert.equal(enforcePromptShapeForProfile("", "flux_prose", "positive"), "");
  });

  it("negative mode: rewrites negation language into positive phrasing for flux profiles", () => {
    assert.equal(
      enforcePromptShapeForProfile(
        "do not blur the face, avoid distortion",
        "flux_klein",
        "negative"
      ),
      "Stable composition with unchanged identity and proportions. Blur the face, distortion."
    );
  });

  it("negative mode: leaves negative prompts unchanged for non-flux profiles", () => {
    assert.equal(
      enforcePromptShapeForProfile("do not blur the face", "qwen_t2i_factual", "negative"),
      "do not blur the face"
    );
  });

  it("sd15_weighted: leaves an already tag-soup prompt unchanged", () => {
    assert.equal(
      enforcePromptShapeForProfile(
        "red jacket, blue jeans, black boots",
        "sd15_weighted",
        "positive"
      ),
      "red jacket, blue jeans, black boots"
    );
  });

  it("sd15_weighted: converts prose into tag soup", () => {
    assert.equal(
      enforcePromptShapeForProfile(
        "A woman in a red jacket stands on a rooftop at sunset watching the city lights.",
        "sd15_weighted",
        "positive"
      ),
      "woman in a red jacket stands on a rooftop at sunset watching the city lights"
    );
  });

  it("qwen_edit_instruction: leaves text referencing Figure 1/2 unchanged", () => {
    const text = "Keep Figure 1 unchanged, replace Figure 2's jacket.";
    assert.equal(enforcePromptShapeForProfile(text, "qwen_edit_instruction", "positive"), text);
  });

  it("qwen_edit_instruction: leaves text with an explicit edit pattern unchanged", () => {
    const text = "keep the background, change the jacket color";
    assert.equal(enforcePromptShapeForProfile(text, "qwen_edit_instruction", "positive"), text);
  });

  it("qwen_edit_instruction: wraps tag soup into a Replace-the-scene instruction", () => {
    assert.equal(
      enforcePromptShapeForProfile(
        "red jacket, blue jeans, black boots",
        "qwen_edit_instruction",
        "positive"
      ),
      "Replace the scene with red jacket, featuring blue jeans, and black boots, in one cohesive scene with readable lighting."
    );
  });

  it("qwen_edit_instruction: wraps a scene description into a Replace-the-scene instruction", () => {
    assert.equal(
      enforcePromptShapeForProfile(
        "A woman stands on a rooftop. She wears a red jacket.",
        "qwen_edit_instruction",
        "positive"
      ),
      "Replace the scene with a woman stands on a rooftop. She wears a red jacket."
    );
  });

  it("qwen_edit_instruction: keeps a named subject capitalized in the Replace-the-scene lead", () => {
    assert.equal(
      enforcePromptShapeForProfile(
        "Lana kneels in the garden planting tulips.",
        "qwen_edit_instruction",
        "positive"
      ),
      "Replace the scene with Lana kneels in the garden planting tulips."
    );
    assert.match(
      enforcePromptShapeForProfile("Red jacket, blue jeans, black boots", "qwen_edit_instruction", "positive"),
      /^Replace the scene with red jacket/
    );
  });

  it("qwen_edit_instruction: wraps plain non-instructional text into a Replace-the-scene instruction", () => {
    assert.equal(
      enforcePromptShapeForProfile("a red jacket on a mannequin", "qwen_edit_instruction", "positive"),
      "Replace the scene with a red jacket on a mannequin"
    );
  });

  it("instruct_pix2pix: leaves an already-imperative command unchanged", () => {
    const text = "make the sky more dramatic";
    assert.equal(enforcePromptShapeForProfile(text, "instruct_pix2pix", "positive"), text);
  });

  it("instruct_pix2pix: wraps tag soup into a Transform instruction", () => {
    assert.equal(
      enforcePromptShapeForProfile("red jacket, blue jeans", "instruct_pix2pix", "positive"),
      "Transform the image to show red jacket, blue jeans"
    );
  });

  it("instruct_pix2pix: wraps plain text into a Transform instruction", () => {
    assert.equal(
      enforcePromptShapeForProfile("a red jacket on a mannequin", "instruct_pix2pix", "positive"),
      "Transform the image to show a red jacket on a mannequin"
    );
  });

  it("instruct_pix2pix: leaves an already Transform-the-image prompt unchanged", () => {
    const text = "Transform the image to show a sunset";
    assert.equal(enforcePromptShapeForProfile(text, "instruct_pix2pix", "positive"), text);
  });

  it("omnigen_instruction: leaves text with an explicit edit pattern unchanged", () => {
    const text = "keep the pose, replace the background";
    assert.equal(enforcePromptShapeForProfile(text, "omnigen_instruction", "positive"), text);
  });

  it("omnigen_instruction: a 2-clause comma list falls below the tag-soup threshold and stays unchanged", () => {
    const text = "red jacket, blue jeans";
    assert.equal(enforcePromptShapeForProfile(text, "omnigen_instruction", "positive"), text);
  });

  it("omnigen_instruction: wraps genuine tag soup (3+ clauses) into a Generate-an-image instruction", () => {
    assert.equal(
      enforcePromptShapeForProfile(
        "red jacket, blue jeans, black boots",
        "omnigen_instruction",
        "positive"
      ),
      "Generate an image showing red jacket, featuring blue jeans, and black boots, in one cohesive scene with readable lighting."
    );
  });

  it("omnigen_instruction: leaves plain non-tag-soup text unchanged", () => {
    const text = "a red jacket on a mannequin";
    assert.equal(enforcePromptShapeForProfile(text, "omnigen_instruction", "positive"), text);
  });

  it("flux profiles: convert tag soup into prose", () => {
    assert.equal(
      enforcePromptShapeForProfile(
        "red jacket, blue jeans, black boots",
        "flux_klein",
        "positive"
      ),
      "Red jacket, featuring blue jeans, and black boots, in one cohesive scene with readable lighting."
    );
  });

  it("flux profiles: leave prose unchanged", () => {
    const text = "A woman in a red jacket stands on a rooftop.";
    assert.equal(enforcePromptShapeForProfile(text, "flux_klein", "positive"), text);
  });

  it("generic prose profiles fall through and return the text unchanged", () => {
    const text = "A woman in a red jacket stands on a rooftop.";
    assert.equal(enforcePromptShapeForProfile(text, "qwen_t2i_factual", "positive"), text);
  });
});

describe("buildVisionFormatRules", () => {
  const limits = { minSentences: 3, maxSentences: 4, maxChars: 780 };

  it("tag-format profiles get tag-writing rules with a tag-count hint from detail level", () => {
    assert.equal(
      buildVisionFormatRules("sd15_weighted", limits, "rich"),
      `- Output comma-separated tags or brief weighted phrases—not full sentences.
- Front-load subject and style tokens. Optional weight syntax: (keyword:1.2).
- Keep the prompt compact (~780 characters max, 6–8 tags).
- Do NOT write paragraph prose or multi-sentence descriptions.`
    );
  });

  it("qwen_edit_instruction gets edit-instruction rules", () => {
    assert.equal(
      buildVisionFormatRules("qwen_edit_instruction", limits, "balanced"),
      `- Write a short edit instruction, not a scene essay.
- Prefer "Replace the scene with …" or "Keep … unchanged. Replace …".
- 3–4 short sentences (~780 characters max).`
    );
  });

  it("instruct_pix2pix gets direct-command rules", () => {
    assert.equal(
      buildVisionFormatRules("instruct_pix2pix", limits, "balanced"),
      `- Write a direct edit command: "Transform the image to show …" or "Make …".
- 3–4 short sentences (~780 characters max).`
    );
  });

  it("omnigen_instruction gets generation-instruction rules", () => {
    assert.equal(
      buildVisionFormatRules("omnigen_instruction", limits, "balanced"),
      `- Write a concise generation instruction with explicit keep/replace language when needed.
- 3–4 sentences (~780 characters max).`
    );
  });

  it("qwen_t2i_factual gets factual-sentence rules", () => {
    assert.equal(
      buildVisionFormatRules("qwen_t2i_factual", limits, "balanced"),
      `- Write 3–4 factual sentences (~780 characters max).
- Describe spatial layers, readable color, and visible text if any. Avoid poetic filler.`
    );
  });

  it("flux prose profiles get photographic-prose rules", () => {
    assert.equal(
      buildVisionFormatRules("flux_klein", limits, "balanced"),
      `- Write 3–4 sentences of photographic prose (~780 characters max).
- Front-load the subject. Name materials, light direction, and camera feel—not bare quality tags.`
    );
  });

  it("falls back to generic plain-prose rules for any other profile", () => {
    assert.equal(
      buildVisionFormatRules("sdxl_nlp", limits, "balanced"),
      `- Write 3–4 sentences of plain factual prose (~780 characters max).
- Use natural language suited to the target model—not tag soup.`
    );
  });
});

describe("expansionBeatsForSanitize", () => {
  it("solo subject + tag-format profile returns SOLO_SUBJECT_TAG_BEATS", () => {
    assert.deepEqual(expansionBeatsForSanitize("sd15_weighted", true), SOLO_SUBJECT_TAG_BEATS);
  });

  it("solo subject + prose profile returns the solo-subject prose beats", () => {
    assert.deepEqual(expansionBeatsForSanitize("qwen_t2i_factual", true), [
      "The surrounding space stays empty of other figures, with layered depth and no distant people or silhouettes.",
      "Directional light sculpts one face, posture, and clothing texture while the background remains unoccupied.",
      "Surface textures read clearly on the sole subject, with no second face, reflection, or background figure anywhere.",
      "The environment recedes through soft atmospheric depth without introducing additional people or crowd energy.",
    ]);
  });

  it("non-solo + tag-format profile returns SD15_EXPANSION_TAG_BEATS", () => {
    assert.deepEqual(expansionBeatsForSanitize("sd15_weighted", false), SD15_EXPANSION_TAG_BEATS);
  });

  it("non-solo + prose profile delegates to expansionBeatsForProfile", () => {
    assert.deepEqual(
      expansionBeatsForSanitize("qwen_t2i_factual", false),
      expansionBeatsForProfile("qwen_t2i_factual")
    );
    assert.deepEqual(
      expansionBeatsForSanitize("flux_prose", false),
      expansionBeatsForProfile("flux_prose")
    );
  });
});
