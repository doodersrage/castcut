import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { continuityReportSections, filmPropList } from './continuity-report';
import { tableSheetHtml } from '../print/print-sheets';

const shots = [
  {
    key: 'a',
    title: 'Morning',
    state: {
      castName: 'Rae',
      others: ['Tom'],
      outfit: 'Linen dress',
      place: 'kitchen',
      time: 'morning' as const,
      props: ['mug'],
      carries: [{ text: 'the red umbrella' }],
      emotion: 'sleepy',
    },
  },
  {
    key: 'b',
    title: 'Noon',
    state: { castName: 'Rae', others: [], props: ['Mug'], changes: [{ text: 'wet hair' }] },
  },
  { key: 'c', title: 'No state' },
];

describe('continuity report', () => {
  it('lists each prop once with the shots it is in', () => {
    assert.deepEqual(filmPropList(shots), [
      { prop: 'mug', shots: ['1. Morning', '2. Noon'] },
      { prop: 'the red umbrella', shots: ['1. Morning'] },
    ]);
  });

  it('builds shot, findings and prop sections and a printable page', () => {
    const sections = continuityReportSections({
      shots,
      findings: [{ shotTitle: 'Noon', label: 'Cut: outfit jump', evidence: 'dress → jeans', suggestion: 'Wear the same' }],
    });
    assert.deepEqual(sections[0]!.rows[0], [
      '1',
      'Morning',
      'Rae, Tom',
      'Linen dress',
      'kitchen · morning',
      'the red umbrella',
      '',
      'sleepy',
    ]);
    assert.equal(sections[0]!.rows[2]![2], '');
    assert.equal(sections[1]!.rows.length, 1);
    const html = tableSheetHtml({ title: 'Continuity report', sections });
    assert.match(html, /<h2>Open findings<\/h2>/);
    assert.match(html, /dress → jeans/);
    const empty = tableSheetHtml({ title: 'x', sections: continuityReportSections({ shots: [], findings: [] }) });
    assert.match(empty, /Nothing open — the shots agree\./);
  });
});
