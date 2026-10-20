import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ATHLETIC_SPORT_PROFILES,
  getAthleticSportGuardrail,
  getAthleticSportProfile,
  hintsDescribeCyclingActivity,
  inferAthleticSport,
  labelMatchesAnyPattern,
  labelMatchesExcludePatterns,
  promptContainsSportWardrobeConflict,
  summaryMatchesSportWardrobe,
} from './athletic-sport-profiles';

describe('ATHLETIC_SPORT_PROFILES data integrity', () => {
  it('is a non-empty array', () => {
    assert.ok(ATHLETIC_SPORT_PROFILES.length > 0);
  });

  it('has no duplicate sport ids', () => {
    const ids = ATHLETIC_SPORT_PROFILES.map(profile => profile.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('every profile has the required fields with the right shapes', () => {
    for (const profile of ATHLETIC_SPORT_PROFILES) {
      assert.equal(typeof profile.id, 'string');
      assert.ok(profile.hint instanceof RegExp);
      assert.ok(Array.isArray(profile.outfitLabels));
      assert.ok(Array.isArray(profile.footwearLabels));
      assert.ok(Array.isArray(profile.excludeLabels));
      assert.equal(typeof profile.guardrail, 'string');
      assert.ok(profile.guardrail.length > 0);
      if (profile.topLabels) {
        assert.ok(Array.isArray(profile.topLabels));
      }
      if (profile.bottomLabels) {
        assert.ok(Array.isArray(profile.bottomLabels));
      }
      if (profile.outerwearLabels) {
        assert.ok(Array.isArray(profile.outerwearLabels));
      }
      if (profile.outfitPickRate !== undefined) {
        assert.equal(typeof profile.outfitPickRate, 'number');
      }
    }
  });
});

describe('inferAthleticSport', () => {
  it('infers cycling from a direct cycling hint', () => {
    assert.equal(inferAthleticSport('a gritty cyclist in the rain'), 'cycling');
  });

  it('infers track_field from a javelin hint', () => {
    assert.equal(inferAthleticSport('an athlete mid javelin throw'), 'track_field');
  });

  it('infers running from a marathon hint', () => {
    assert.equal(inferAthleticSport('a marathon runner pushing through mile 20'), 'running');
    assert.equal(inferAthleticSport('exploding off the starting block into a streamline dive'), 'swimming');
    assert.equal(inferAthleticSport('spiking the ball at the volleyball net'), 'volleyball');
    assert.equal(inferAthleticSport('working the heavy bag in the boxing gym'), 'boxing');
    assert.equal(inferAthleticSport('paddling out hard over a whitewater set'), 'surfing');
  });

  it('infers triathlon before cycling when both hints appear', () => {
    // triathlon profile is earlier in the list than cycling
    assert.equal(inferAthleticSport('a triathlete on the bike leg'), 'triathlon');
  });

  it('infers yoga from a downward dog hint', () => {
    assert.equal(inferAthleticSport('holding a downward dog pose'), 'yoga');
  });

  it('falls back to cycling when hints mention a bike without matching any explicit sport hint', () => {
    assert.equal(inferAthleticSport('a person riding a bike through the park'), 'cycling');
  });

  it('does not infer cycling from a motorbike mention', () => {
    assert.equal(inferAthleticSport('a rider on a motorbike'), null);
  });

  it('returns null for an unmatched hint', () => {
    assert.equal(inferAthleticSport('a person reading a book in a cafe'), null);
  });

  it('returns null for undefined input', () => {
    assert.equal(inferAthleticSport(undefined), null);
  });

  it('returns null for empty or whitespace-only input', () => {
    assert.equal(inferAthleticSport(''), null);
    assert.equal(inferAthleticSport('   '), null);
  });
});

describe('getAthleticSportProfile', () => {
  it('returns the matching profile for a known sport', () => {
    const profile = getAthleticSportProfile('soccer');
    assert.ok(profile);
    assert.equal(profile?.id, 'soccer');
    assert.ok(profile?.hint.test('soccer match'));
    assert.ok(Array.isArray(profile?.footwearLabels));
  });

  it('returns null for a null or undefined sport', () => {
    assert.equal(getAthleticSportProfile(null), null);
    assert.equal(getAthleticSportProfile(undefined), null);
  });
});

describe('getAthleticSportGuardrail', () => {
  it('returns the guardrail text with the shared single-sport suffix', () => {
    const guardrail = getAthleticSportGuardrail('cycling');
    assert.match(guardrail, /^Cycling activity—use a cycling jersey/);
    assert.match(guardrail, /Use exactly one sport and one outfit/);
  });

  it('returns an empty string for a sport with no known profile', () => {
    assert.equal(getAthleticSportGuardrail('not-a-real-sport' as never), '');
  });
});

describe('hintsDescribeCyclingActivity', () => {
  it('returns true for hints describing cycling', () => {
    assert.equal(hintsDescribeCyclingActivity('a gravel bike ride at dawn'), true);
  });

  it('returns false for hints describing a different sport', () => {
    assert.equal(hintsDescribeCyclingActivity('a tennis match at wimbledon'), false);
  });

  it('returns false for undefined hints', () => {
    assert.equal(hintsDescribeCyclingActivity(undefined), false);
  });
});

describe('labelMatchesAnyPattern', () => {
  it('returns true when a label matches one of the patterns', () => {
    assert.equal(labelMatchesAnyPattern('cycling jersey', [/\bjersey\b/i, /\bshorts\b/i]), true);
  });

  it('returns false when a label matches none of the patterns', () => {
    assert.equal(labelMatchesAnyPattern('golf shoes', [/\bjersey\b/i, /\bshorts\b/i]), false);
  });

  it('returns false for an empty patterns array', () => {
    assert.equal(labelMatchesAnyPattern('anything', []), false);
  });
});

describe('labelMatchesExcludePatterns', () => {
  it('returns true when a label matches an exclude pattern', () => {
    assert.equal(labelMatchesExcludePatterns('wearing track pants', [/\btrack pants\b/i]), true);
  });

  it('returns false when a label matches no exclude pattern', () => {
    assert.equal(labelMatchesExcludePatterns('wearing a cycling kit', [/\btrack pants\b/i]), false);
  });

  it('returns false for an empty patterns array', () => {
    assert.equal(labelMatchesExcludePatterns('anything', []), false);
  });
});

describe('summaryMatchesSportWardrobe', () => {
  it('returns true when every chunk matches the sport wardrobe', () => {
    assert.equal(summaryMatchesSportWardrobe('cycling', 'cycling jersey, bib shorts, cycling shoes'), true);
  });

  it('treats any helmet mention as a match for cycling', () => {
    assert.equal(summaryMatchesSportWardrobe('cycling', 'cycling jersey, bib shorts, aero helmet'), true);
  });

  it('returns false when a chunk matches an exclude pattern', () => {
    assert.equal(
      summaryMatchesSportWardrobe('cycling', 'cycling jersey, bib shorts, track pants'),
      false
    );
  });

  it('returns false when a chunk matches no wardrobe pattern at all', () => {
    assert.equal(summaryMatchesSportWardrobe('cycling', 'cycling jersey, a top hat'), false);
  });

  it('returns false for an empty summary', () => {
    assert.equal(summaryMatchesSportWardrobe('cycling', ''), false);
    assert.equal(summaryMatchesSportWardrobe('cycling', '   '), false);
  });

  it('returns false for a sport with no known profile', () => {
    assert.equal(summaryMatchesSportWardrobe('not-a-real-sport' as never, 'cycling jersey'), false);
  });
});

describe('promptContainsSportWardrobeConflict', () => {
  it('returns true when the prompt itself contains an excluded wardrobe item', () => {
    assert.equal(
      promptContainsSportWardrobeConflict(
        'A cyclist wearing track pants speeds down the road.',
        'cycling',
        ''
      ),
      true
    );
  });

  it('returns false when the prompt and assigned summary are both sport-consistent', () => {
    assert.equal(
      promptContainsSportWardrobeConflict(
        'A cyclist sprints down the road.',
        'cycling',
        'cycling jersey, bib shorts, cycling shoes'
      ),
      false
    );
  });

  it('returns true when the assigned summary does not match the sport wardrobe', () => {
    assert.equal(
      promptContainsSportWardrobeConflict(
        'A cyclist sprints down the road.',
        'cycling',
        'a business suit'
      ),
      true
    );
  });

  it('returns false when the assigned summary is empty and the prompt has no conflict', () => {
    assert.equal(
      promptContainsSportWardrobeConflict('A cyclist sprints down the road.', 'cycling', ''),
      false
    );
  });

  it('returns false for a sport with no known profile', () => {
    assert.equal(
      promptContainsSportWardrobeConflict('anything at all', 'not-a-real-sport' as never, ''),
      false
    );
  });
});
