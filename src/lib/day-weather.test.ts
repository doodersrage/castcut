import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayWeatherIsOutdoor, withDayWeather } from './day-weather';

describe('Day weather', () => {
  it('tells outdoor places from rooms', () => {
    for (const place of [
      'quiet city street under warm streetlights',
      'rooftop bar with city lights at dusk',
      'misty forest clearing at golden hour',
      'concrete city steps in bright sun',
    ]) {
      assert.equal(dayWeatherIsOutdoor(place), true, place);
    }
    for (const place of [
      'back seat of a taxi at night with city lights outside',
      'cozy wine bar with a small dance floor',
      'sunlit bedroom with rumpled white sheets',
      'busy convention hall with banners and booths',
    ]) {
      assert.equal(dayWeatherIsOutdoor(place), false, place);
    }
  });

  it('adds the weather to the setting, and nothing without one', () => {
    assert.match(withDayWeather('quiet city street', 'rain')!, /wet pavement/);
    assert.match(withDayWeather('sunlit bedroom', 'snow')!, /snow falling outside the windows/);
    assert.equal(withDayWeather('sunlit bedroom', ''), 'sunlit bedroom');
    assert.equal(withDayWeather('', 'rain'), undefined);
  });
});
