import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clarifyIntimateImageLanguage,
  promptHasIntimateEuphemisms,
  reinforceIntimateStillPrompt,
} from './intimate-prompt-clarify';

describe('intimate-prompt-clarify', () => {
  it('covers core / folds / entrance variants across adjectives and acts', () => {
    const cases: Array<[string, RegExp]> = [
      ['fingers into her slick core', /fingers penetrating her vagina/i],
      ['fingers into her wet core', /fingers penetrating her vagina/i],
      ['fingers inside their dripping core', /fingers penetrating their vagina/i],
      ['fingers into her slick wet core', /fingers penetrating her vagina/i],
      ['buried in her warm core', /penetrating her vagina/i],
      ['plunged into her needy core', /penetrating her vagina/i],
      ['cock into her molten core', /cock penetrating her vagina/i],
      ['tongue into her slick folds', /tongue on her vagina/i],
      ['filling her tight channel', /filling her vagina/i],
      ['her wet core', /her vagina/i],
      ['her slick wet core', /her vagina/i],
      ['her quivering folds', /her vagina/i],
      ['her honey pot', /her vagina/i],
      ['her love canal', /her vagina/i],
      ['her womanhood', /her vagina/i],
      ['her center', /her vagina/i],
      ['her depths', /her vagina/i],
      ['the slick core', /the vagina/i],
      ['that molten core', /the vagina/i],
      ['a dripping entrance', /the vagina/i],
      ['wet core', /wet vagina/i],
      ['slick folds', /wet vagina/i],
      ['hot wet channel', /wet vagina/i],
      ['rain-slick asphalt', /rain-slick asphalt/i],
    ];
    for (const [input, expect] of cases) {
      const out = clarifyIntimateImageLanguage(input);
      assert.match(out, expect, `${input} → ${out}`);
      if (!/rain-slick/i.test(input)) {
        assert.doesNotMatch(
          out,
          /\b(?:wet|slick|molten|dripping|needy|warm|quivering|hot)\s+(?:wet\s+)?core\b/i,
          input
        );
      }
    }
  });

  it('covers manhood, breasts, clit, ass, nipples, balls, cum', () => {
    const out = clarifyIntimateImageLanguage(
      [
        'His manhood pressed against her mounds;',
        'he rubbed her pearl and sucked her peaked buds;',
        'hands on her rear and his heavy balls;',
        'spilling his seed — his release on skin.',
        'Rain-slick asphalt gleamed.',
      ].join(' ')
    );
    assert.match(out, /erect penis/i);
    assert.match(out, /breasts/i);
    assert.match(out, /clit/i);
    assert.match(out, /nipples/i);
    assert.match(out, /ass/i);
    assert.match(out, /balls/i);
    assert.match(out, /cum/i);
    assert.match(out, /rain-slick asphalt/i);
  });

  it('covers oral, lovemaking, straddle, and finish euphemisms', () => {
    const out = clarifyIntimateImageLanguage(
      'He was tasting her while they were making love; she straddled him and finished inside her.'
    );
    assert.match(out, /oral sex/i);
    assert.match(out, /having sex/i);
    assert.match(out, /straddling him in sex/i);
    assert.match(out, /cumming inside her/i);
  });

  it('rewrites legacy adult-fork meta phrasing into a concrete pose', () => {
    const out = reinforceIntimateStillPrompt(
      'Amber Office bent over after velvet lullaby, taken from behind — doggy or bent-over sex, explicit and readable.'
    );
    assert.match(out, /^Behind:\s*rear-entry sex/i);
    assert.match(out, /office|desk/i);
    assert.match(out, /bent OVER the desk|desk edge/i);
    assert.match(out, /Exactly TWO adults|exactly two faces|four hands only|never a dog|humans only|hips only/i);
    assert.match(out, /Mouths closed|closed|pelvis clearly connected|Real human skin|never a black mannequin/i);
    assert.match(out, /rear-entry/i);
    assert.doesNotMatch(out, /explicit and readable/i);
    assert.doesNotMatch(out, /doggy|doggystyle/i);
    assert.doesNotMatch(out, /velvet lullaby/i);
    assert.doesNotMatch(out, /taken from behind/i);
    assert.doesNotMatch(out, /Amber Office|Match the named pose|standing wall press|on hands and knees/i);
    assert.equal(reinforceIntimateStillPrompt(out), out);
    assert.ok(out.length < 900, `behind recipe still too long (${out.length})`);
  });

  it('maps archive ledger curl-over to desk bent with throat + vagina hands, never a dog', () => {
    const out = reinforceIntimateStillPrompt(
      "She's curled over a stack of ledgers in the dim archive room, back arched as he fucks her from behind—his hand cups her throat while the other sinks deep into her vagina under flickering bulb light."
    );
    assert.match(out, /^Behind:\s*rear-entry sex/i);
    assert.match(out, /archive|ledger/i);
    assert.match(out, /OVER the ledger|curled or bent OVER|desk surface/i);
    assert.match(out, /cups her throat|sinks into her vagina/i);
    assert.match(out, /never a dog|puppy|canine/i);
    assert.match(out, /not sex on the carpet/i);
    assert.doesNotMatch(out, /doggy|doggystyle|hands and knees/i);
    assert.equal(reinforceIntimateStillPrompt(out), out);
  });

  it('rewrites chair-hunch beats as standing furniture sex, keeping pajama wardrobe', () => {
    const out = reinforceIntimateStillPrompt(
      "She's hunched over the ergonomic chair, arms locked around his neck as he thrusts from behind—her thighs clamp tight, fingers digging into his shoulders while his hand slides down to stroke her clit through damp silk pajama bottoms."
    );
    assert.match(out, /^Chair bent:\s*rear-entry sex/i);
    assert.match(out, /STANDS|feet flat|NOT sitting|hands on the chair|NOT kneeling/i);
    assert.match(out, /four hands only|clit|silk pajama|office interior/i);
    assert.doesNotMatch(out, /^Behind:|^Doggy:|Fully nude —|hands and knees|Match the named pose|reach back around|doggy|doggystyle/i);
    assert.match(out, /do not wrap her arms around his neck/i);
    assert.match(out, /not a blank gray studio/i);
    assert.equal(reinforceIntimateStillPrompt(out), out);
    assert.ok(out.length < 1000, `chair recipe still too long (${out.length})`);
  });

  it('clarifies tongue/clit oral blurbs and locks the act over a standing portrait', () => {
    const out = reinforceIntimateStillPrompt(
      "She's kneeling on a lacquered piano bench, barefoot and back bent as he kneels beside her—his tongue laps at her inner thigh while his fingers curl around her clit, hands trembling under the glow of a single crystal lamp."
    );
    assert.match(out, /^Piano oral:/i);
    assert.match(out, /kneeling ON the piano bench|kneels BESIDE|oral sex|clit/i);
    assert.match(out, /four hands only|Exactly TWO adults/i);
    assert.match(out, /NOT draped over the piano|NOT bent over|NOT rear-entry/i);
    assert.match(out, /Fully nude|nothing worn|Nude/i);
    assert.doesNotMatch(out, /laps at her inner thigh|Match the named pose/i);
    assert.equal(reinforceIntimateStillPrompt(out), out);
    assert.ok(out.length < 1000, `piano oral recipe still too long (${out.length})`);
  });

  it('keeps cabinet-drawer behind beats off the desk recipe', () => {
    const out = reinforceIntimateStillPrompt(
      "She's slumped sideways in the steel cabinet’s open drawer, thighs parted as he thrusts from behind—his hand grips her waist while the other sinks deep into her vagina, office lights casting long shadows over her bare calves and his sweat-slicked back."
    );
    assert.match(out, /^Cabinet drawer:/i);
    assert.match(out, /open drawer|filing cabinet/i);
    assert.match(out, /sinks into her vagina|four hands only/i);
    assert.doesNotMatch(out, /bent OVER the desk|^Behind:/i);
    assert.equal(reinforceIntimateStillPrompt(out), out);
  });

  it('locks elevator wall-press beats as standing sex with partner-owned hands', () => {
    const out = reinforceIntimateStillPrompt(
      'She leans against the mirrored elevator wall as he presses her back, tongue sliding slow across her collarbone while one hand cups her throat and the other sinks into her wet core—glass doors reflect their sweat-drenched bodies as the city’s neon bleeds through.'
    );
    assert.match(out, /FULL BODY|Rear wall press|glass elevator/i);
    assert.match(out, /exactly two adults|clean anatomy/i);
    assert.match(out, /neon|head to mid-calf|do not crop at the waist/i);
    assert.match(out, /mouth on her neck|front of her throat|front crotch/i);
    assert.doesNotMatch(out, /tongue sliding|wet core|sweat-drenched|CONTACT \(mandatory|handrail/i);
    assert.match(out, /never on her butt|no glasses/i);
    assert.doesNotMatch(out, /no twins\/mirrors|Match the named pose|between the lead's thighs/i);
    assert.ok(out.length < 800, `wall recipe still too long (${out.length})`);
  });

  it('rewrites chaise-lower beats away from mirror frames and armchair lap-sits', () => {
    const blurb =
      "She hangs suspended in the ballroom’s shadowed alcove, arms wrapped tight around his neck as he lowers her slowly into a velvet chaise—his thumb circles her clit while one hand grips her hip to keep her pinned, candlelight flickering over the gilded frame of her bare legs.";
    const out = reinforceIntimateStillPrompt(blurb);
    assert.match(out, /Chaise lower:|velvet chaise|ballroom/i);
    assert.match(out, /STANDS on the floor|not sitting|lowers her|side profile|same facing/i);
    assert.match(out, /Mouths apart|no kiss|cheek at his shoulder/i);
    assert.match(out, /four legs total|no flesh blob|thigh and hip only/i);
    assert.doesNotMatch(out, /gilded frame of her bare legs|STANDING upright sex against the wall|between her thighs/i);
    assert.ok(out.length < 700, `chaise recipe still too long (${out.length})`);
  });

  it('keeps wardrobe when the beat names lingerie instead of forcing nude', () => {
    const out = reinforceIntimateStillPrompt(
      'She straddles him in black lingerie, riding cowgirl on the couch.'
    );
    assert.match(out, /lingerie/i);
    assert.doesNotMatch(out, /Fully nude — nothing worn/i);
  });

  it('is idempotent on already-direct language', () => {
    const direct =
      'Fingers penetrating her vagina, erect penis, breasts, ass, cum on skin.';
    assert.equal(clarifyIntimateImageLanguage(direct), direct);
    assert.equal(promptHasIntimateEuphemisms(direct), false);
  });

  it('detects euphemisms before clarify', () => {
    assert.equal(promptHasIntimateEuphemisms('fingers into her slick core'), true);
    assert.equal(promptHasIntimateEuphemisms('her wet core'), true);
    assert.equal(promptHasIntimateEuphemisms('standing in a doorway'), false);
  });
});
