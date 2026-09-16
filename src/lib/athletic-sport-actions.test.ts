import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendCyclingHelmetToSummary,
  cyclingHelmetLabel,
  ensureAthleticBottomInPrompt,
  ensureCyclingHelmetInPrompt,
  formatSportActionInstructions,
  getSportActionBundle,
  getSportActionInstructions,
  inferCyclingDiscipline,
  promptMissingAthleticBottom,
  stripIncompatibleCyclingVenuesFromPrompt,
  summaryIncludesCyclingHelmet,
} from './athletic-sport-actions';

describe('inferCyclingDiscipline', () => {
  it('infers gravel from a gravel bike hint', () => {
    assert.equal(inferCyclingDiscipline('a muddy gravel bike ride at dawn'), 'gravel');
  });

  it('infers track from a velodrome hint', () => {
    assert.equal(inferCyclingDiscipline('sprinting on the velodrome'), 'track');
  });

  it('infers mountain from a mountain biker hint', () => {
    assert.equal(inferCyclingDiscipline('a mountain biker on singletrack'), 'mountain');
  });

  it('infers cyclocross from a cyclocross hint', () => {
    assert.equal(inferCyclingDiscipline('racing cyclocross in the mud'), 'cyclocross');
  });

  it('infers road from a road race or criterium hint', () => {
    assert.equal(inferCyclingDiscipline('lining up for a criterium'), 'road');
  });

  it('defaults to road for a generic cyclist hint with no discipline cue', () => {
    assert.equal(inferCyclingDiscipline('a cyclist smiling at the camera'), 'road');
  });

  it('defaults to road for undefined hints', () => {
    assert.equal(inferCyclingDiscipline(undefined), 'road');
  });
});

describe('cyclingHelmetLabel', () => {
  it('returns the gravel helmet label for gravel hints', () => {
    assert.equal(cyclingHelmetLabel('gravel bike ride'), 'gravel cycling helmet');
  });

  it('returns the mountain bike helmet label for mountain hints', () => {
    assert.equal(cyclingHelmetLabel('mountain biker on a trail'), 'mountain bike helmet');
  });

  it('returns the track cycling helmet label for track hints', () => {
    assert.equal(cyclingHelmetLabel('velodrome keirin race'), 'track cycling helmet');
  });

  it('returns the cyclocross helmet label for cyclocross hints', () => {
    assert.equal(cyclingHelmetLabel('cyclocross mud race'), 'cyclocross helmet');
  });

  it('returns the aero cycling helmet label for road or unmatched hints', () => {
    assert.equal(cyclingHelmetLabel('road race criterium'), 'aero cycling helmet');
    assert.equal(cyclingHelmetLabel(undefined), 'aero cycling helmet');
  });
});

describe('summaryIncludesCyclingHelmet', () => {
  it('returns true for a discipline-specific helmet mention', () => {
    assert.equal(summaryIncludesCyclingHelmet('cycling jersey, gravel helmet'), true);
  });

  it('returns true for any generic helmet mention', () => {
    assert.equal(summaryIncludesCyclingHelmet('ski jacket, helmet'), true);
  });

  it('returns false when no helmet is mentioned', () => {
    assert.equal(summaryIncludesCyclingHelmet('cycling jersey, bib shorts'), false);
  });
});

describe('appendCyclingHelmetToSummary', () => {
  it('appends the discipline-appropriate helmet when missing', () => {
    assert.equal(
      appendCyclingHelmetToSummary('cycling jersey, bib shorts', 'road race'),
      'cycling jersey, bib shorts, aero cycling helmet'
    );
  });

  it('is idempotent and does not double-add a helmet already present', () => {
    const once = appendCyclingHelmetToSummary('cycling jersey, aero cycling helmet');
    const twice = appendCyclingHelmetToSummary(once);
    assert.equal(once, 'cycling jersey, aero cycling helmet');
    assert.equal(twice, once);
  });

  it('returns an empty string unchanged for an empty summary', () => {
    assert.equal(appendCyclingHelmetToSummary(''), '');
    assert.equal(appendCyclingHelmetToSummary('   '), '');
  });
});

describe('ensureCyclingHelmetInPrompt', () => {
  it('leaves a prompt unchanged when it already mentions a helmet', () => {
    const prompt = 'A cyclist wearing a cycling helmet races down the road.';
    assert.equal(ensureCyclingHelmetInPrompt(prompt), prompt);
  });

  it('inserts the helmet into a "wearing" clause for a cyclist sentence', () => {
    const result = ensureCyclingHelmetInPrompt('A cyclist wearing a red jersey races down the road.');
    assert.equal(result, 'A cyclist wearing a aero cycling helmet and a red jersey races down the road.');
  });

  it('appends a helmet clause to a cyclist sentence with no "wearing"', () => {
    const result = ensureCyclingHelmetInPrompt('A cyclist speeds down the road.');
    assert.equal(result, 'A cyclist speeds down the road, wearing a aero cycling helmet.');
  });

  it('does not force a helmet onto kit-only or non-riding scenes', () => {
    assert.equal(
      ensureCyclingHelmetInPrompt('A person walks through a park.'),
      'A person walks through a park.'
    );
    assert.equal(
      ensureCyclingHelmetInPrompt('A woman in a cycling jersey and bib shorts poses in a studio.'),
      'A woman in a cycling jersey and bib shorts poses in a studio.'
    );
  });

  it('uses the discipline-specific helmet label from hints', () => {
    const result = ensureCyclingHelmetInPrompt('A cyclist speeds down the trail.', 'mountain biker');
    assert.equal(result, 'A cyclist speeds down the trail, wearing a mountain bike helmet.');
  });
});

describe('promptMissingAthleticBottom', () => {
  it('returns false for a sport that does not require a bottom check', () => {
    assert.equal(promptMissingAthleticBottom('A cyclist with no shorts mentioned.', 'cycling'), false);
  });

  it('returns false when a bottom layer is already present', () => {
    assert.equal(
      promptMissingAthleticBottom('A runner wearing running shorts sprints ahead.', 'running'),
      false
    );
  });

  it('returns true when a top-only athletic garment is mentioned with no bottom', () => {
    assert.equal(
      promptMissingAthleticBottom('A sprinter in a running singlet crosses the line.', 'running'),
      true
    );
  });

  it('returns true when an athlete word is mentioned with no bottom at all', () => {
    assert.equal(promptMissingAthleticBottom('A marathon runner pushes forward.', 'running'), true);
  });

  it('returns false when neither a bottom nor an athlete cue is present', () => {
    assert.equal(promptMissingAthleticBottom('The stadium lights flicker on.', 'running'), false);
  });
});

describe('ensureAthleticBottomInPrompt', () => {
  it('returns the prompt unchanged for a sport that does not require a bottom', () => {
    const prompt = 'A cyclist speeds down the road.';
    assert.equal(ensureAthleticBottomInPrompt(prompt, 'cycling'), prompt);
  });

  it('returns the prompt unchanged when a bottom is already present', () => {
    const prompt = 'A runner wearing running shorts sprints ahead.';
    assert.equal(ensureAthleticBottomInPrompt(prompt, 'running'), prompt);
  });

  it('inserts the default bottom for the sport when none is present', () => {
    const result = ensureAthleticBottomInPrompt('A marathon runner sprints through the rain.', 'running');
    assert.equal(result, 'A marathon runner sprints through the rain, wearing running shorts.');
  });

  it('prefers a bottom label pulled from the wardrobe summary over the sport default', () => {
    const result = ensureAthleticBottomInPrompt(
      'An athlete driving a forehand at the net.',
      'tennis',
      { wardrobeSummary: 'tennis whites, tennis skirt' }
    );
    assert.equal(result, 'An athlete driving a forehand at the net, wearing tennis skirt.');
  });

  it('inserts the bottom into a "wearing" clause when present', () => {
    const result = ensureAthleticBottomInPrompt('A sprinter wearing a running singlet crosses the line.', 'running');
    assert.equal(result, 'A sprinter wearing running shorts and a running singlet crosses the line.');
  });
});

describe('stripIncompatibleCyclingVenuesFromPrompt', () => {
  it('leaves the prompt untouched when the hints do not describe cycling', () => {
    const prompt = 'A hiker on a singletrack trail through the velodrome district.';
    assert.equal(stripIncompatibleCyclingVenuesFromPrompt(prompt, 'a hiker on a trail'), prompt);
  });

  it('rewrites a sentence with a venue incompatible with the inferred discipline (road)', () => {
    const result = stripIncompatibleCyclingVenuesFromPrompt(
      'A cyclist rides along the singletrack trail.',
      'cyclist'
    );
    assert.equal(result, 'sprinting on a road racing bicycle');
  });

  it('leaves a road-compatible venue untouched', () => {
    const prompt = 'A cyclist rides through a cobblestone race sector.';
    assert.equal(stripIncompatibleCyclingVenuesFromPrompt(prompt, 'cyclist'), prompt);
  });

  it('rewrites a velodrome mention when the discipline is gravel', () => {
    const result = stripIncompatibleCyclingVenuesFromPrompt(
      'Racing hard through a velodrome section.',
      'gravel bike ride'
    );
    assert.equal(result, 'powering through a loose gravel sector on a fire road');
  });
});

describe('getSportActionBundle', () => {
  it('returns the bundle for a known sport with poses, settings, and foreign tokens', () => {
    const bundle = getSportActionBundle('basketball');
    assert.ok(bundle);
    assert.ok(bundle?.poses.length);
    assert.ok(bundle?.settings.length);
    assert.ok(bundle?.foreignTokens.includes('cyclist'));
    assert.match(bundle!.instructions, /basketball/i);
  });

  it('returns null for a null or undefined sport', () => {
    assert.equal(getSportActionBundle(null), null);
    assert.equal(getSportActionBundle(undefined), null);
  });
});

describe('getSportActionInstructions', () => {
  it('returns discipline-specific instructions for cycling based on hints', () => {
    const road = getSportActionInstructions('cycling', 'road race criterium');
    const gravel = getSportActionInstructions('cycling', 'gravel bike ride');
    assert.match(road, /road racing bicycle/);
    assert.match(gravel, /gravel or adventure bike/);
    assert.notEqual(road, gravel);
  });

  it('returns the fixed bundle instructions for a non-cycling sport regardless of hints', () => {
    const instructions = getSportActionInstructions('golf', 'anything at all');
    assert.match(instructions, /golf action/i);
  });

  it('returns an empty string for a sport with no bundle', () => {
    assert.equal(getSportActionInstructions('not-a-real-sport' as never), '');
  });
});

describe('formatSportActionInstructions', () => {
  it('formats each sentence of the instructions as its own bullet line', () => {
    const formatted = formatSportActionInstructions('martial_arts');
    const expected = getSportActionInstructions('martial_arts')
      .split(/(?<=[.!?])\s+/)
      .map(sentence => `- ${sentence.trim()}`)
      .join('\n');
    assert.equal(formatted, expected);
    assert.ok(formatted.startsWith('- '));
    assert.ok(formatted.includes('\n- '));
  });

  it('returns an empty string when there are no instructions to format', () => {
    assert.equal(formatSportActionInstructions('not-a-real-sport' as never), '');
  });
});
