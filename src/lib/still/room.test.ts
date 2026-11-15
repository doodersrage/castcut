import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRoomReply } from './room';

describe('same room? (the reply)', () => {
  it('reads the model’s line as it answered on s19’s finals', () => {
    assert.deepEqual(
      parseRoomReply(
        'same: no Different window views and furniture layouts; left has white cabinetry and couch'
      ),
      {
        same: false,
        note: 'Different window views and furniture layouts; left has white cabinetry and couch',
      }
    );
    assert.deepEqual(parseRoomReply('same: yes — identical canal view, bridge railing'), {
      same: true,
      note: 'identical canal view, bridge railing',
    });
    assert.equal(parseRoomReply('Yes.')?.same, true);
    assert.equal(parseRoomReply('<think>hm</think> same: NO — another kitchen')?.same, false);
  });

  it('an answer it can’t read is no verdict', () => {
    assert.equal(parseRoomReply('Both photos show people.'), null);
    assert.equal(parseRoomReply(''), null);
    assert.equal(parseRoomReply(null), null);
  });
});
