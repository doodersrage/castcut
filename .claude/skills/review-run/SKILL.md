---
name: review-run
description: Find out why a Scene run (an episode, a Make the short run) kept or flagged its takes, from an install's stored data — tally the flags by reason, scene and shot type, and read the shot text behind them. Use after an overnight or long run, or when many takes are flagged.
---

# Reviewing a run's flags

A run's state is in the install's server store: `<PROMPT_DATA_DIR>/studio.sqlite`, table
`kv (scope, key, json, updated_at)`, row `key = 'settings-cache'`. In its JSON,
`tools.scene` holds:
- `run`: `items` (Scene ids), `outcomes`, `flagged` (`{ sceneId: "reason, reason" }`),
  `attempts`, `state`, `log`;
- `scenes`: each Scene's `name` (e.g. `"20F SALT & SEA CAFÉ · Dialogue"`) and `slot`
  (`sceneHints` is the shot text the render and the checks read; `location`, `poseCamera`, `line`).

**Never open a live install's database in place.** Copy `studio.sqlite*` (with `-wal` and `-shm`)
to a scratch folder and read the copy. The user's own data folder is read-only to you.

```python
import sqlite3, json, collections, re
c = sqlite3.connect('<scratch>/studio.sqlite')
scene = json.loads(c.execute("select json from kv where key='settings-cache'").fetchone()[0])['tools']['scene']
run, byid = scene['run'], {s['id']: s for s in scene['scenes']}
reasons = collections.Counter(re.sub(r'\s*\(.*', '', part).strip()
                              for v in run['flagged'].values() for part in re.split(r',\s*(?=the )', v))
per_scene = collections.Counter(re.match(r'\d+', byid[i]['name']).group() for i in run['flagged'] if i in byid)
kinds = collections.Counter(byid[i]['name'].split('·')[-1].strip() for i in run['flagged'] if i in byid)
```

## Reading it

- Group by **reason**, then by **scene number**. A scene where nearly every shot fails the same
  way is a cause upstream, not bad luck.
- Print a few failing shots' `slot.sceneHints` with their reason. On 2026-11-07, 40 "arms
  crossed" flags were the partner's action in the lead's shot text, and 10 place misses came
  from a background sign in a beach scene's text.
- Split by whether the partner is in frame ("the two of them together" in the hints) when the
  reason is a pose or action.
- Report the counts with where they came from. A fix belongs in what writes the text
  (`src/lib/day/script-shots.ts`) or in the check (`src/lib/pose/`), each with a test using the
  real failing sentence.
