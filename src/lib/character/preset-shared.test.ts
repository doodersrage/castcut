import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scriptFor,
  scriptForKey,
  withArticle,
  enrichPoseTarget,
  pickOption,
  textFieldIsActive,
  countCharacterPresetSelections,
  hasCharacterPresetOptions,
  hasPoseAnchor,
  buildPoseAnchorLine,
  buildPoseAnchorClause,
  normalizePresetMatchText,
  poseAnchorPresent,
  stripConflictingPoseLanguage,
  cleanPoseRemainder,
  integratePoseAnchorIntoPrompt,
  buildPoseAnchorUserDirective,
  CHARACTER_HEADCOUNT_OPTIONS,
  CHARACTER_PRESET_FIELD_KEYS,
  type CharacterPresetOptions,
} from "./preset-shared";

const POSED: CharacterPresetOptions = { poseAction: "perched", poseTarget: "low stone wall" };
const POSE_CLAUSE =
  "is perched casually on the exact edge of a low stone wall featuring visible surface texture, tactile material detail, and believable wear";

describe("scriptFor / scriptForKey", () => {
  it("returns the script for a matching value", () => {
    assert.equal(
      scriptFor(CHARACTER_HEADCOUNT_OPTIONS, "solo"),
      "A crisp, medium-wide photograph focusing strictly on one solitary human body,",
    );
  });

  it("returns null for undefined or an unmatched value", () => {
    assert.equal(scriptFor(CHARACTER_HEADCOUNT_OPTIONS, undefined), null);
    assert.equal(scriptFor(CHARACTER_HEADCOUNT_OPTIONS, "" as never), null);
  });

  it("scriptForKey looks up by registry key", () => {
    assert.equal(
      scriptForKey("headcount", "solo"),
      "A crisp, medium-wide photograph focusing strictly on one solitary human body,",
    );
    assert.equal(scriptForKey("headcount", undefined), null);
  });
});

describe("withArticle / enrichPoseTarget", () => {
  it("adds an article when the value has none", () => {
    assert.equal(withArticle("low stone wall"), "a low stone wall");
  });

  it("leaves a value that already starts with an article unchanged", () => {
    assert.equal(withArticle("an old bench"), "an old bench");
  });

  it("returns the trimmed (blank) value for blank input", () => {
    assert.equal(withArticle("   "), "");
  });

  it("enrichPoseTarget adds an article and appends the surface-texture clause", () => {
    assert.equal(
      enrichPoseTarget("low stone wall"),
      "a low stone wall featuring visible surface texture, tactile material detail, and believable wear",
    );
  });
});

describe("pickOption", () => {
  it("keeps a value present in the allowed set", () => {
    assert.equal(pickOption("solo", new Set(["solo", "duo"])), "solo");
  });

  it("drops a value not in the allowed set", () => {
    assert.equal(pickOption("bogus", new Set(["solo", "duo"])), "");
  });

  it("drops undefined", () => {
    assert.equal(pickOption(undefined, new Set(["solo"])), "");
  });
});

describe("textFieldIsActive", () => {
  it("poseTarget requires both poseAction and poseTarget to be set", () => {
    assert.equal(
      textFieldIsActive("poseTarget", { poseAction: "perched", poseTarget: "wall" }),
      true,
    );
    assert.equal(textFieldIsActive("poseTarget", { poseTarget: "wall" }), false);
  });

  it("other text fields are active whenever they have a value", () => {
    assert.equal(textFieldIsActive("wardrobe", { wardrobe: "denim jacket" }), true);
    assert.equal(textFieldIsActive("wardrobe", {}), false);
  });
});

describe("countCharacterPresetSelections / hasCharacterPresetOptions", () => {
  it("is 0 / false for empty options", () => {
    assert.equal(countCharacterPresetSelections({}), 0);
    assert.equal(hasCharacterPresetOptions({}), false);
  });

  it("counts select fields, the pose anchor as one unit, text fields, and clothing-catalog fields", () => {
    const opts: CharacterPresetOptions = {
      headcount: "solo",
      bodyType: "athletic",
      poseAction: "perched",
      poseTarget: "low stone wall",
      hairColor: "auburn",
      wardrobe: "denim jacket",
      wardrobeCatalog: "some-id",
    };
    // headcount(1) + bodyType(1) + poseAction&poseTarget-as-one(1) + hairColor(1)
    // + wardrobe(1) + wardrobeCatalog(1) = 6
    assert.equal(countCharacterPresetSelections(opts), 6);
    assert.equal(hasCharacterPresetOptions(opts), true);
  });

  it("poseAction alone (no poseTarget) does not count, and the poseAction key itself is skipped in the select-field loop", () => {
    assert.equal(countCharacterPresetSelections({ poseAction: "perched" }), 0);
  });
});

describe("hasPoseAnchor / buildPoseAnchorLine / buildPoseAnchorClause", () => {
  it("requires both poseAction and a non-blank poseTarget", () => {
    assert.equal(hasPoseAnchor(POSED), true);
    assert.equal(hasPoseAnchor({ poseAction: "perched", poseTarget: "   " }), false);
    assert.equal(hasPoseAnchor({ poseAction: "perched" }), false);
    assert.equal(hasPoseAnchor({ poseTarget: "wall" }), false);
  });

  it("builds the line (with trailing comma) and clause (without) from the pose action script and enriched target", () => {
    assert.equal(buildPoseAnchorLine(POSED), `${POSE_CLAUSE},`);
    assert.equal(buildPoseAnchorClause(POSED), POSE_CLAUSE);
  });

  it("returns null for both when there is no pose anchor", () => {
    assert.equal(buildPoseAnchorLine({}), null);
    assert.equal(buildPoseAnchorClause({}), null);
  });
});

describe("normalizePresetMatchText", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    assert.equal(
      normalizePresetMatchText("A Low, Stone-Wall!! near   here"),
      "a low stone wall near here",
    );
  });
});

describe("poseAnchorPresent", () => {
  it("is true when the prompt contains both a pose keyword and most target words", () => {
    assert.equal(
      poseAnchorPresent("a woman is perched casually on the edge of a low stone wall", POSED),
      true,
    );
  });

  it("is false when the pose keyword is missing", () => {
    assert.equal(poseAnchorPresent("a woman stands near a low stone wall", POSED), false);
  });

  it("is false when the target words are missing", () => {
    assert.equal(
      poseAnchorPresent("a woman is perched on the edge of something else entirely", POSED),
      false,
    );
  });

  it("is false when there is no pose anchor configured at all", () => {
    assert.equal(poseAnchorPresent("anything", {}), false);
  });
});

describe("stripConflictingPoseLanguage", () => {
  it("removes conflicting framing/standing phrases", () => {
    assert.equal(
      stripConflictingPoseLanguage(
        "A woman stands in a tight portrait framing under soft light, shoulders and clothing edge into frame, full body visible from head to worn shoes.",
      ),
      "A woman in a .",
    );
  });

  it("leaves an unrelated sentence unchanged", () => {
    assert.equal(stripConflictingPoseLanguage("a plain sentence"), "a plain sentence");
  });
});

describe("cleanPoseRemainder", () => {
  it("strips a leading relative clause and removes a target-word mention from the remainder", () => {
    // Note: the target-word removal regex has an alternation-precedence quirk
    // (it matches a bare occurrence of the last target word rather than the
    // full "near <target>" phrase), which is why "wall," is removed but
    // "low stone" is left behind with a double space -- this asserts the
    // real, current behavior rather than the presumably-intended one.
    assert.equal(
      cleanPoseRemainder(", who is near a low stone wall, smiling softly", {
        poseTarget: "low stone wall",
      }),
      "near a low stone  smiling softly",
    );
  });

  it("leaves the remainder alone when the target isn't mentioned", () => {
    assert.equal(
      cleanPoseRemainder(", smiling softly", { poseTarget: "low stone wall" }),
      "smiling softly",
    );
  });

  it("leaves the remainder alone when there is no poseTarget", () => {
    assert.equal(cleanPoseRemainder(", smiling softly", {}), "smiling softly");
  });
});

describe("integratePoseAnchorIntoPrompt", () => {
  it("returns the trimmed prompt unchanged when there is no pose anchor", () => {
    assert.equal(integratePoseAnchorIntoPrompt("  a plain prompt  ", {}), "a plain prompt");
  });

  it("leaves the prompt unchanged when the anchor is already present", () => {
    const prompt = "A woman is perched casually on the edge of a low stone wall, smiling.";
    assert.equal(integratePoseAnchorIntoPrompt(prompt, POSED), prompt);
  });

  it("splices the clause after a matched subject and cleans the remainder", () => {
    assert.equal(
      integratePoseAnchorIntoPrompt("A woman in a red dress smiling warmly at the camera", POSED),
      `A woman ${POSE_CLAUSE}, red dress smiling warmly at the camera`,
    );
  });

  it("falls back to a clause-first prefix when no subject pattern matches (short prompt)", () => {
    // "A woman" alone doesn't satisfy either subject regex (no following
    // keyword for the lookahead form, and no extra word for the fallback
    // form), so this takes the same no-match path as an unrelated prompt.
    assert.equal(
      integratePoseAnchorIntoPrompt("A woman", POSED),
      `${POSE_CLAUSE}. A woman`,
    );
  });

  it("falls back to a clause-first prefix when the prompt doesn't start with an article", () => {
    assert.equal(
      integratePoseAnchorIntoPrompt("Photo of someone smiling", POSED),
      `${POSE_CLAUSE}. Photo of someone smiling`,
    );
  });

  it("returns just the clause, period-terminated, when merging into an empty prompt", () => {
    assert.equal(integratePoseAnchorIntoPrompt("", POSED), `${POSE_CLAUSE}.`);
  });
});

describe("buildPoseAnchorUserDirective", () => {
  it("is null when there is no pose anchor", () => {
    assert.equal(buildPoseAnchorUserDirective({}), null);
  });

  it("builds the mandatory-directive text around the clause", () => {
    assert.equal(
      buildPoseAnchorUserDirective(POSED),
      `POSE ANCHOR (mandatory — overrides default framing): ${POSE_CLAUSE}. ` +
        "Show enough body and object surface to read limb placement. " +
        "Do not replace with standing, walking, close-up portrait cropping, or a generic static pose.",
    );
  });
});

describe("CHARACTER_PRESET_FIELD_KEYS", () => {
  it("lists select keys, then poseTarget, then clothing-catalog keys, then the remaining text keys", () => {
    assert.deepEqual(CHARACTER_PRESET_FIELD_KEYS, [
      "headcount",
      "shotFraming",
      "cameraAngle",
      "depthOfField",
      "lighting",
      "atmosphere",
      "colorPalette",
      "aesthetic",
      "filmStock",
      "bodyType",
      "posture",
      "energy",
      "expression",
      "gaze",
      "makeup",
      "realism",
      "hairStyle",
      "handPose",
      "poseAction",
      "duoDynamic",
      "poseTarget",
      "wardrobeCatalog",
      "footwearCatalog",
      "accessoriesCatalog",
      "hairColor",
      "wardrobe",
      "footwear",
      "accessories",
      "prop",
    ]);
  });
});
