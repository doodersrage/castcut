import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { resolveSpeakers } from './script-cast';
import {
  newCastPartMessages,
  parseNewCastPart,
  partCanBeCast,
  partDisplayName,
  recurringScriptParts,
  scriptPartExcerpt,
} from './script-new-cast';

const SOURCE = [
  'INT. CAFE - MORNING',
  '',
  'Tommy wipes the counter. Lena comes in.',
  '',
  'TOMMY',
  'You’re late.',
  '',
  'LENA',
  'I know.',
  '',
  'CUSTOMER #1',
  'Coffee, please.',
  '',
  'LITTLE GIRL',
  'Can I have a cookie?',
  '',
  'LITTLE GIRL',
  'Please?',
  '',
  'LITTLE GIRL',
  'Pretty please?',
  '',
  'INT. CAFE - NIGHT',
  '',
  'TOMMY',
  'Closing time.',
  '',
  'MRS. GABLE',
  'One more cup.',
  '',
  'WOMAN',
  'Me too.',
  '',
  'WOMAN',
  'And me.',
  '',
  'WOMAN',
  'Thanks.',
  '',
].join('\n');

const parsed = parseScript(SOURCE);
const cast = [{ id: 'lena', name: 'Lena' }];

describe('a script’s recurring parts as Cast', () => {
  it('offers the named parts that come back, never a child, an extra or a bare role', () => {
    const resolved = resolveSpeakers(
      parsed.scenes.flatMap(scene => scene.speakers),
      cast,
      undefined
    );
    // Tommy speaks in two scenes; Mrs. Gable once; the little girl three times; WOMAN three.
    assert.deepEqual(recurringScriptParts(parsed, resolved), [
      { speaker: 'TOMMY', lines: 2, scenes: 2 },
    ]);
    assert.equal(partCanBeCast('LITTLE GIRL'), false);
    assert.equal(partCanBeCast('TEENAGER #1'), false);
    assert.equal(partCanBeCast('CUSTOMER #2'), false);
    assert.equal(partCanBeCast('WOMAN'), false);
    assert.equal(partCanBeCast('A TOURIST #3'), false);
    assert.equal(partCanBeCast('MRS. GABLE'), true);
  });

  it('leaves a part you set to Not in the Cast alone', () => {
    const resolved = resolveSpeakers(
      parsed.scenes.flatMap(scene => scene.speakers),
      cast,
      { TOMMY: null }
    );
    assert.deepEqual(recurringScriptParts(parsed, resolved), []);
  });

  it('gives the LLM where they speak, and reads its casting note as a draft', () => {
    const excerpt = scriptPartExcerpt(parsed, 'TOMMY');
    assert.match(excerpt, /INT\. CAFE - MORNING\nTommy wipes the counter/);
    assert.match(excerpt, /TOMMY: Closing time\./);
    const [system, user] = newCastPartMessages({ speaker: 'Tommy', excerpt, title: 'Salt' });
    assert.match(system!.content, /Every character is an adult/);
    assert.match(user!.content, /The character: TOMMY\./);
    assert.deepEqual(
      parseNewCastPart(
        'Here:\n```json\n{"sex":"man","age":"40s","build":"Stocky","hairColor":"grey","hairLength":"teal"}\n```'
      ),
      {
        sex: 'man',
        ageBand: '40s',
        bodyBuild: 'stocky',
        hairColor: 'grey',
        hairLength: 'random',
        ethnicity: 'random',
        height: 'random',
      }
    );
    assert.equal(parseNewCastPart('{"sex":"robot"}'), null);
    assert.equal(parseNewCastPart('nothing'), null);
    assert.equal(partDisplayName('MRS. GABLE'), 'Mrs. Gable');
    assert.equal(partDisplayName("O'MALLEY"), "O'Malley");
  });
});
