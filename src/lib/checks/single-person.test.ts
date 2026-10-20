import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSinglePersonSystemAddendum,
  buildSinglePersonUserDirective,
  buildSoloSubjectLockDirective,
  ensureSinglePersonPrompt,
  SOLO_SUBJECT_EXPANSION_BEATS,
} from "./single-person";

describe("buildSinglePersonSystemAddendum / buildSinglePersonUserDirective", () => {
  it("returns fixed, non-empty solo-subject directives", () => {
    const system = buildSinglePersonSystemAddendum();
    assert.match(system, /Exactly ONE person/);
    assert.match(system, /No "on the left\.\.\. on the right" split/);

    assert.equal(
      buildSinglePersonUserDirective(),
      "SOLO SUBJECT (mandatory): exactly one person in frame. No other people, faces, silhouettes, or crowd anywhere."
    );
  });

  it("exposes a non-empty list of solo-subject expansion beats", () => {
    assert.equal(SOLO_SUBJECT_EXPANSION_BEATS.length, 4);
    for (const beat of SOLO_SUBJECT_EXPANSION_BEATS) {
      assert.equal(typeof beat, "string");
      assert.ok(beat.length > 0);
    }
  });
});

describe("buildSoloSubjectLockDirective", () => {
  it("returns null for empty, whitespace-only, or missing hints", () => {
    assert.equal(buildSoloSubjectLockDirective(""), null);
    assert.equal(buildSoloSubjectLockDirective("   "), null);
    assert.equal(buildSoloSubjectLockDirective(undefined), null);
  });

  it("adds a woman-specific clause when hints mention a woman but not a man", () => {
    const result = buildSoloSubjectLockDirective("a young woman in a red dress");
    assert.match(
      result!,
      /The subject must be a woman as described in the brief—no men, no second person, no unrelated elderly faces\.$/
    );
  });

  it("adds a man-specific clause when hints mention a man but not a woman", () => {
    const result = buildSoloSubjectLockDirective("a tall man in a suit");
    assert.match(
      result!,
      /The subject must be a man as described in the brief—no women, no second person, no unrelated elderly faces\.$/
    );
  });

  it("adds neither gendered clause when hints mention both a man and a woman", () => {
    const result = buildSoloSubjectLockDirective("a man and a woman");
    assert.doesNotMatch(result!, /subject must be a (?:man|woman)/);
  });

  it("appends an age/identity clause when hints mention an age descriptor, alongside the gendered clause", () => {
    const result = buildSoloSubjectLockDirective("an elderly woman reading");
    assert.match(result!, /subject must be a woman/);
    assert.match(
      result!,
      /Keep the subject identity and age read from the brief—do not substitute a different person or add a second figure\.$/
    );
  });

  it("returns just the base directives when hints carry no gender or age signal", () => {
    const result = buildSoloSubjectLockDirective("a figure standing in fog");
    assert.equal(
      result,
      "SOLO SUBJECT (mandatory): exactly one person in frame. No other people, faces, silhouettes, or crowd anywhere. One unified photograph—no diptych, split screen, side-by-side panels, collage, or comparison layout."
    );
  });
});

describe("ensureSinglePersonPrompt: tag-format profile (sd15_weighted)", () => {
  it("drops tags that mention extra people and adds solo tags when none remain implied", () => {
    const prompt = "1girl, solo, couple, best quality, group of people, masterpiece";
    assert.equal(
      ensureSinglePersonPrompt(prompt, "sd15_weighted"),
      "1girl, solo, best quality, masterpiece"
    );
  });

  it("falls back to keeping the original tags (plus solo beats) when every tag mentions extra people", () => {
    const prompt = "couple walking, group of people, crowd";
    assert.equal(
      ensureSinglePersonPrompt(prompt, "sd15_weighted"),
      "couple walking, group of people, crowd, solo, empty background"
    );
  });
});

describe("ensureSinglePersonPrompt: prose profiles", () => {
  it("drops a sentence mentioning extra people and appends the no-other-people suffix to what remains", () => {
    const prompt =
      "A woman stands alone on a rooftop at sunset, wind in her hair. Two men walk past in the background talking loudly.";
    assert.equal(
      ensureSinglePersonPrompt(prompt),
      "A woman stands alone on a rooftop at sunset, wind in her hair. No other people, faces, silhouettes, or crowd appear anywhere in the frame."
    );
  });

  it("reconstructs a single subject from an 'on the left... on the right' split-frame sentence", () => {
    const prompt =
      "On the left, a woman in a blue dress laughs warmly; on the right, a man in a suit listens intently under warm light.";
    assert.equal(
      ensureSinglePersonPrompt(prompt),
      "a woman in a blue dress laughs warmly. No other people, faces, silhouettes, or crowd appear anywhere in the frame."
    );
  });

  it("returns the original prompt unchanged when the only sentence can't be salvaged, even after stripping inline multi-person phrases and trying the first clause", () => {
    const prompt = "A woman walks with another woman down the street while the crowd cheers nearby.";
    assert.equal(ensureSinglePersonPrompt(prompt), prompt);
  });

  it("returns the original prompt trimmed when nothing at all can be salvaged", () => {
    const prompt = "  Two people talking.  ";
    assert.equal(ensureSinglePersonPrompt(prompt), "Two people talking.");
  });

  it("appends the no-other-people suffix to an already single-person prompt", () => {
    const prompt =
      "A lone woman stands in an empty field under a wide sky, wind moving through tall grass.";
    assert.equal(
      ensureSinglePersonPrompt(prompt),
      "A lone woman stands in an empty field under a wide sky, wind moving through tall grass. No other people, faces, silhouettes, or crowd appear anywhere in the frame."
    );
  });

  it("does not duplicate the suffix when the prompt already contains an equivalent solo phrase", () => {
    const prompt =
      "A lone woman stands in an empty field under a wide sky. She is the only person, alone in the frame, wind moving through tall grass around her feet.";
    assert.equal(ensureSinglePersonPrompt(prompt), prompt);
  });
});
