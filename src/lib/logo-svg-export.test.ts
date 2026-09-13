import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLogoSvg, logoSvgFilename } from './logo-svg-export';

describe('logo-svg-export', () => {
  it('builds a valid SVG with brand name escaped', () => {
    const svg = buildLogoSvg({
      brandName: 'Tom & Jerry',
      tagline: 'Studio <test>',
      motif: 'studio-bars',
      includeWordmark: true,
    });
    assert.match(svg, /^<\?xml version="1.0"/);
    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /Tom &amp; Jerry/);
    assert.match(svg, /Studio &lt;test&gt;/);
    assert.doesNotMatch(svg, /Tom & Jerry/);
  });

  it('slugifies download filenames', () => {
    assert.equal(logoSvgFilename('Castcut'), 'castcut-mark.svg');
    assert.equal(logoSvgFilename(''), 'logo-mark.svg');
  });
});
