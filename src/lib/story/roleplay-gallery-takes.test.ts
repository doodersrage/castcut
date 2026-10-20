import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  roleplayStillTakes,
  roleplayStillTakeIndex,
  shownRoleplayStillTake,
  lastCompletedRoleplayStillUrl,
  roleplayBeatPromptIds,
  roleplayStoryPromptIds,
  roleplayStillHasInFlightTake,
  canRetryRoleplayStill,
  selectRoleplayStillTakePatch,
  beginRoleplayStillRetryPatch,
  roleplayClipTakes,
  roleplayClipTakeIndex,
  canRetryRoleplayClip,
  selectRoleplayClipTakePatch,
  beginRoleplayClipRetryPatch,
  roleplayClipQueueResultPatch,
  roleplayStillQueueResultPatch,
  mergeRoleplayStoryStills,
} from "./roleplay-gallery-takes";
import type { RoleplayStoryBeat } from "./roleplay";

function beat(overrides: Partial<RoleplayStoryBeat> = {}): RoleplayStoryBeat {
  return {
    id: "b1",
    title: "Beat",
    blurb: "blurb",
    at: 0,
    ...overrides,
  } as RoleplayStoryBeat;
}

describe("roleplayStillTakes", () => {
  it("returns [] when there is no stored history and no current still", () => {
    assert.deepEqual(roleplayStillTakes(beat()), []);
  });

  it("returns just the current still when there is no stored history", () => {
    assert.deepEqual(roleplayStillTakes(beat({ promptId: "p1", imageUrl: "u1" })), [
      { promptId: "p1", imageUrl: "u1", stillStatus: undefined },
    ]);
  });

  it("returns stored takes unchanged when the current fields are all empty", () => {
    const stored = [
      { promptId: "s1", imageUrl: "su1", stillStatus: "completed" as const },
      { promptId: "s2", imageUrl: "su2", stillStatus: "error" as const },
    ];
    assert.deepEqual(roleplayStillTakes(beat({ stillTakes: stored })), stored);
  });

  it("overlays the current fields onto the stored take whose promptId matches", () => {
    const result = roleplayStillTakes(
      beat({
        stillTakes: [
          { promptId: "s1", imageUrl: "su1", stillStatus: "completed" },
          { promptId: "s2", imageUrl: "su2", stillStatus: "error" },
        ],
        promptId: "s2",
        imageUrl: "newUrl",
        stillStatus: "running",
      })
    );
    assert.deepEqual(result, [
      { promptId: "s1", imageUrl: "su1", stillStatus: "completed" },
      { promptId: "s2", imageUrl: "newUrl", stillStatus: "running" },
    ]);
  });

  it("appends the current still as a new entry when its promptId matches nothing stored", () => {
    const result = roleplayStillTakes(
      beat({
        stillTakes: [{ promptId: "s1", imageUrl: "su1", stillStatus: "completed" }],
        promptId: "s3",
        imageUrl: "u3",
        stillStatus: "queued",
      })
    );
    assert.deepEqual(result, [
      { promptId: "s1", imageUrl: "su1", stillStatus: "completed" },
      { promptId: "s3", imageUrl: "u3", stillStatus: "queued" },
    ]);
  });

  it("with no current promptId, overlays at stillTakeIndex when it is valid", () => {
    const result = roleplayStillTakes(
      beat({
        stillTakes: [
          { promptId: "s1", imageUrl: "su1", stillStatus: "completed" },
          { promptId: "s2", imageUrl: "su2", stillStatus: "error" },
        ],
        stillTakeIndex: 0,
        stillStatus: "running",
      })
    );
    assert.deepEqual(result, [
      { promptId: "s1", imageUrl: "su1", stillStatus: "running" },
      { promptId: "s2", imageUrl: "su2", stillStatus: "error" },
    ]);
  });

  it("with no current promptId, falls back to the last stored entry when stillTakeIndex is out of bounds", () => {
    const result = roleplayStillTakes(
      beat({
        stillTakes: [
          { promptId: "s1", imageUrl: "su1", stillStatus: "completed" },
          { promptId: "s2", imageUrl: "su2", stillStatus: "error" },
        ],
        stillTakeIndex: 99,
        stillStatus: "running",
      })
    );
    assert.deepEqual(result, [
      { promptId: "s1", imageUrl: "su1", stillStatus: "completed" },
      { promptId: "s2", imageUrl: "su2", stillStatus: "running" },
    ]);
  });

  it("caps the history at MAX_ROLEPLAY_STILL_TAKES (8), dropping the oldest entry", () => {
    const stored = Array.from({ length: 8 }, (_, i) => ({
      promptId: `s${i}`,
      imageUrl: `u${i}`,
      stillStatus: "completed" as const,
    }));
    const result = roleplayStillTakes(
      beat({ stillTakes: stored, promptId: "new", imageUrl: "newU", stillStatus: "queued" })
    );
    assert.equal(result.length, 8);
    assert.equal(result[0]!.promptId, "s1"); // s0 dropped
    assert.equal(result[result.length - 1]!.promptId, "new");
  });
});

describe("roleplayStillTakeIndex", () => {
  it("uses a valid stillTakeIndex directly", () => {
    assert.equal(
      roleplayStillTakeIndex(
        beat({ stillTakes: [{ promptId: "s1" }, { promptId: "s2" }], stillTakeIndex: 1 })
      ),
      1
    );
  });

  it("falls back to matching the current promptId when stillTakeIndex is invalid", () => {
    assert.equal(
      roleplayStillTakeIndex(
        beat({
          stillTakes: [{ promptId: "s1" }, { promptId: "s2" }],
          stillTakeIndex: 99,
          promptId: "s2",
        })
      ),
      1
    );
  });

  it("falls back to the last take when there is no valid index or matching promptId", () => {
    assert.equal(
      roleplayStillTakeIndex(beat({ stillTakes: [{ promptId: "s1" }, { promptId: "s2" }] })),
      1
    );
  });
});

describe("shownRoleplayStillTake and lastCompletedRoleplayStillUrl", () => {
  it("shownRoleplayStillTake returns the take at the computed index", () => {
    assert.deepEqual(
      shownRoleplayStillTake(
        beat({ stillTakes: [{ promptId: "s1" }, { promptId: "s2" }], stillTakeIndex: 1 })
      ),
      { promptId: "s2" }
    );
  });

  it("lastCompletedRoleplayStillUrl scans backward, skipping completed takes with a blank url", () => {
    const b = beat({
      stillTakes: [
        { promptId: "s1", imageUrl: "u1", stillStatus: "completed" },
        { promptId: "s2", imageUrl: "u2", stillStatus: "error" },
        { promptId: "s3", imageUrl: "", stillStatus: "completed" },
      ],
    });
    assert.equal(lastCompletedRoleplayStillUrl(b), "u1");
  });

  it("falls back to the beat-level fields only when the beat itself is completed", () => {
    assert.equal(
      lastCompletedRoleplayStillUrl(beat({ stillStatus: "completed", imageUrl: "beatUrl" })),
      "beatUrl"
    );
    assert.equal(
      lastCompletedRoleplayStillUrl(beat({ stillStatus: "error", imageUrl: "beatUrl" })),
      null
    );
  });
});

describe("roleplayBeatPromptIds and roleplayStoryPromptIds", () => {
  it("collects still-take ids, the beat's own promptId, clip-take ids, then clipPromptId, deduped in order", () => {
    const b = beat({
      stillTakes: [{ promptId: "s1" }, { promptId: "s2" }],
      promptId: "s2",
      clipTakes: [{ clipPromptId: "c1" }],
      clipPromptId: "c2",
    });
    assert.deepEqual(roleplayBeatPromptIds(b), ["s1", "s2", "c1", "c2"]);
  });

  it("roleplayStoryPromptIds dedupes ids across beats, and handles undefined story", () => {
    const story = [
      beat({ id: "b1", stillTakes: [{ promptId: "s1" }] }),
      beat({ id: "b2", stillTakes: [{ promptId: "s1" }, { promptId: "s2" }] }),
    ];
    assert.deepEqual(roleplayStoryPromptIds(story), ["s1", "s2"]);
    assert.deepEqual(roleplayStoryPromptIds(undefined), []);
  });
});

describe("roleplayStillHasInFlightTake and canRetryRoleplayStill", () => {
  it("detects an in-flight (writing/queued/running) take", () => {
    assert.equal(
      roleplayStillHasInFlightTake(beat({ stillTakes: [{ promptId: "s1", stillStatus: "running" }] })),
      true
    );
    assert.equal(
      roleplayStillHasInFlightTake(
        beat({ stillTakes: [{ promptId: "s1", stillStatus: "completed" }] })
      ),
      false
    );
  });

  it("cannot retry without a beat prompt, even with a completed take", () => {
    assert.equal(
      canRetryRoleplayStill(beat({ stillTakes: [{ promptId: "s1", stillStatus: "completed" }] })),
      false
    );
  });

  it("can retry with a prompt and a completed/error/populated take", () => {
    assert.equal(
      canRetryRoleplayStill(
        beat({ prompt: "hi", stillTakes: [{ promptId: "s1", stillStatus: "completed" }] })
      ),
      true
    );
  });

  it("cannot retry while a take is in flight, even with a prompt", () => {
    assert.equal(
      canRetryRoleplayStill(
        beat({ prompt: "hi", stillTakes: [{ promptId: "s1", stillStatus: "running" }] })
      ),
      false
    );
  });

  it("cannot retry with a prompt but no takes at all", () => {
    assert.equal(canRetryRoleplayStill(beat({ prompt: "hi" })), false);
  });
});

describe("selectRoleplayStillTakePatch", () => {
  const stored = [
    { promptId: "s1", imageUrl: "u1", stillStatus: "completed" as const },
    { promptId: "s2", imageUrl: "u2", stillStatus: "error" as const },
  ];

  it("clamps an out-of-range index to the last take", () => {
    const patch = selectRoleplayStillTakePatch(beat({ stillTakes: stored }), 5);
    assert.equal(patch.stillTakeIndex, 1);
    assert.equal(patch.promptId, "s2");
    assert.equal(patch.imageUrl, "u2");
    assert.equal(patch.stillStatus, "error");
  });

  it("clamps a negative index to the first take", () => {
    const patch = selectRoleplayStillTakePatch(beat({ stillTakes: stored }), -3);
    assert.equal(patch.stillTakeIndex, 0);
    assert.equal(patch.promptId, "s1");
  });

  it("returns {} when there are no takes to select", () => {
    assert.deepEqual(selectRoleplayStillTakePatch(beat(), 0), {});
  });
});

describe("beginRoleplayStillRetryPatch", () => {
  it("appends a 'writing' take and clears the active promptId/imageUrl", () => {
    const patch = beginRoleplayStillRetryPatch(
      beat({
        stillTakes: [{ promptId: "s1", imageUrl: "u1", stillStatus: "completed" }],
        promptId: "s1",
        imageUrl: "u1",
        stillStatus: "completed",
      })
    );
    assert.deepEqual(patch.stillTakes, [
      { promptId: "s1", imageUrl: "u1", stillStatus: "completed" },
      { stillStatus: "writing" },
    ]);
    assert.equal(patch.stillTakeIndex, 1);
    assert.equal(patch.promptId, undefined);
    assert.equal(patch.imageUrl, undefined);
    assert.equal(patch.stillStatus, "writing");
  });
});

describe("roleplayClipTakes and roleplayClipTakeIndex (mirror of the still-side logic)", () => {
  it("overlays current clip fields onto the matching stored clip take", () => {
    const result = roleplayClipTakes(
      beat({
        clipTakes: [{ clipPromptId: "c1", clipUrl: "cu1", clipStatus: "completed" }],
        clipPromptId: "c1",
        clipUrl: "newClipUrl",
        clipStatus: "running",
      })
    );
    assert.deepEqual(result, [{ clipPromptId: "c1", clipUrl: "newClipUrl", clipStatus: "running" }]);
  });

  it("roleplayClipTakeIndex uses a valid clipTakeIndex directly", () => {
    assert.equal(
      roleplayClipTakeIndex(
        beat({ clipTakes: [{ clipPromptId: "c1" }, { clipPromptId: "c2" }], clipTakeIndex: 1 })
      ),
      1
    );
  });

  it("roleplayClipTakeIndex returns 0 when there are no clip takes", () => {
    assert.equal(roleplayClipTakeIndex(beat()), 0);
  });

  it("roleplayClipTakeIndex falls back to matching clipPromptId when clipTakeIndex is invalid", () => {
    assert.equal(
      roleplayClipTakeIndex(
        beat({
          clipTakes: [{ clipPromptId: "c1" }, { clipPromptId: "c2" }],
          clipTakeIndex: 99,
          clipPromptId: "c2",
        })
      ),
      1
    );
  });

  it("roleplayClipTakeIndex falls back to the last take when there is no valid index or match", () => {
    assert.equal(
      roleplayClipTakeIndex(beat({ clipTakes: [{ clipPromptId: "c1" }, { clipPromptId: "c2" }] })),
      1
    );
  });
});

describe("canRetryRoleplayClip", () => {
  it("cannot retry with neither a prompt/blurb nor a completed still, even with a usable clip take", () => {
    assert.equal(
      canRetryRoleplayClip(
        beat({
          blurb: "",
          clipTakes: [{ clipPromptId: "c1", clipStatus: "completed" }],
        })
      ),
      false
    );
  });

  it("can retry with a prompt and a completed clip take", () => {
    assert.equal(
      canRetryRoleplayClip(
        beat({ prompt: "hi", clipTakes: [{ clipPromptId: "c1", clipStatus: "completed" }] })
      ),
      true
    );
  });

  it("can retry from a completed still even without a prompt (blurb only doesn't count once cleared)", () => {
    assert.equal(
      canRetryRoleplayClip(
        beat({
          blurb: "",
          stillStatus: "completed",
          imageUrl: "u1",
          clipTakes: [{ clipPromptId: "c1", clipStatus: "completed" }],
        })
      ),
      true
    );
  });
});

describe("selectRoleplayClipTakePatch and beginRoleplayClipRetryPatch", () => {
  it("selectRoleplayClipTakePatch selects the requested index", () => {
    const patch = selectRoleplayClipTakePatch(
      beat({ clipTakes: [{ clipPromptId: "c1" }, { clipPromptId: "c2" }] }),
      1
    );
    assert.equal(patch.clipTakeIndex, 1);
    assert.equal(patch.clipPromptId, "c2");
  });

  it("beginRoleplayClipRetryPatch appends a 'writing' clip take", () => {
    const patch = beginRoleplayClipRetryPatch(
      beat({ clipTakes: [{ clipPromptId: "c1" }, { clipPromptId: "c2" }] })
    );
    assert.deepEqual(patch.clipTakes, [
      { clipPromptId: "c1" },
      { clipPromptId: "c2" },
      { clipStatus: "writing" },
    ]);
    assert.equal(patch.clipTakeIndex, 2);
    assert.equal(patch.clipPromptId, undefined);
    assert.equal(patch.clipStatus, "writing");
  });
});

describe("roleplayStillQueueResultPatch and roleplayClipQueueResultPatch", () => {
  it("still: with no prior takes, seeds a single take — 'queued' when a promptId is given, 'error' otherwise", () => {
    const withId = roleplayStillQueueResultPatch(beat(), "newPid");
    assert.deepEqual(withId.stillTakes, [{ promptId: "newPid", stillStatus: "queued" }]);
    assert.equal(withId.stillTakeIndex, 0);
    assert.equal(withId.promptId, "newPid");
    assert.equal(withId.stillStatus, "queued");

    const noId = roleplayStillQueueResultPatch(beat(), undefined);
    assert.deepEqual(noId.stillTakes, [{ promptId: undefined, stillStatus: "error" }]);
    assert.equal(noId.stillStatus, "error");
  });

  it("still: with existing takes, overlays the promptId/status at the current take index", () => {
    const patch = roleplayStillQueueResultPatch(
      beat({ stillTakes: [{ promptId: "s1" }], stillTakeIndex: 0 }),
      "newPid2"
    );
    assert.deepEqual(patch.stillTakes, [{ promptId: "newPid2", stillStatus: "queued" }]);
    assert.equal(patch.stillTakeIndex, 0);
    assert.equal(patch.promptId, "newPid2");
  });

  it("clip: with no prior takes, seeds a single take the same way as the still variant", () => {
    const patch = roleplayClipQueueResultPatch(beat(), "newPid");
    assert.deepEqual(patch.clipTakes, [{ clipPromptId: "newPid", clipStatus: "queued" }]);
    assert.equal(patch.clipTakeIndex, 0);
    assert.equal(patch.clipPromptId, "newPid");
  });

  it("clip: with existing takes, overlays the promptId/status at the current take index", () => {
    const patch = roleplayClipQueueResultPatch(
      beat({ clipTakes: [{ clipPromptId: "c1" }], clipTakeIndex: 0 }),
      "newPid2"
    );
    assert.deepEqual(patch.clipTakes, [{ clipPromptId: "newPid2", clipStatus: "queued" }]);
    assert.equal(patch.clipTakeIndex, 0);
    assert.equal(patch.clipPromptId, "newPid2");
  });
});

describe("mergeRoleplayStoryStills", () => {
  it("updates only the beats whose take promptId matches a gallery entry, and reports changed", () => {
    const story = [
      beat({ id: "b1", stillTakes: [{ promptId: "s1", stillStatus: "queued" }] }),
      beat({ id: "b2", stillTakes: [{ promptId: "s2", stillStatus: "queued" }] }),
    ];
    const result = mergeRoleplayStoryStills(story, [
      { promptId: "s1", status: "completed", imageUrl: "final1.png" },
    ]);
    assert.equal(result.changed, true);
    assert.deepEqual(result.story[0]!.stillTakes, [
      { promptId: "s1", stillStatus: "completed", imageUrl: "final1.png" },
    ]);
    assert.equal(result.story[0]!.imageUrl, "final1.png");
    assert.equal(result.story[0]!.stillStatus, "completed");
    // Unmatched beat is returned by the same object reference (no unnecessary copy).
    assert.equal(result.story[1], story[1]);
  });

  it("reports changed: false and returns every beat by reference when nothing matches", () => {
    const story = [beat({ id: "b1", stillTakes: [{ promptId: "s1", stillStatus: "queued" }] })];
    const result = mergeRoleplayStoryStills(story, [
      { promptId: "unrelated", status: "completed", imageUrl: "x.png" },
    ]);
    assert.equal(result.changed, false);
    assert.equal(result.story[0], story[0]);
  });

  it("maps gallery status 'pending' to still status 'queued', and tolerates a null imageUrl", () => {
    const story = [beat({ id: "b1", stillTakes: [{ promptId: "s1", stillStatus: "writing" }] })];
    const result = mergeRoleplayStoryStills(story, [
      { promptId: "s1", status: "pending", imageUrl: null },
    ]);
    assert.equal(result.story[0]!.stillTakes![0]!.stillStatus, "queued");
    assert.equal(result.changed, true);
  });

  it("also matches and updates clip takes by promptId, leaving a non-matching clip take untouched", () => {
    const story = [
      beat({
        id: "b1",
        clipTakes: [
          { clipPromptId: "c1", clipStatus: "queued" },
          { clipPromptId: "unrelated-clip", clipStatus: "queued" },
        ],
        clipTakeIndex: 0,
      }),
    ];
    const result = mergeRoleplayStoryStills(story, [
      { promptId: "c1", status: "completed", imageUrl: "clipFinal.png" },
    ]);
    assert.equal(result.changed, true);
    assert.deepEqual(result.story[0]!.clipTakes, [
      { clipPromptId: "c1", clipStatus: "completed", clipUrl: "clipFinal.png" },
      { clipPromptId: "unrelated-clip", clipStatus: "queued" },
    ]);
    assert.equal(result.story[0]!.clipUrl, "clipFinal.png");
    assert.equal(result.story[0]!.clipStatus, "completed");
  });
});
