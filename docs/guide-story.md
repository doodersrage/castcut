# Story

Scene by scene: the LLM offers four next scenes, you pick one, and it becomes a still and a
clip. Open **Story** (`/story`) — it opens once you've cut your first Day.

## Play it

1. **Roll four scenes** — four cards, each with a small figure of its pose.
2. **Pick one**, or write your own under **Or write what happens next**.
3. The scene's still queues; **Animate** makes the clip.
4. Repeat. **Cut film →** opens [Cut](guide-film.md) with the Story's shots.

| Control | What it does |
| --- | --- |
| **Story settings** | Tone, rating, setting, notes (and Solo / Duo / Mixed on adult ratings) |
| **Take back the last scene** | Removes only the last scene |
| **Start the story over** | Clears the reel — keep the bible or write a new one |
| **Retry N flagged** | Redoes every failed still and every pose or face miss |

**Edit scene** also has **Narration** — a voice-over line for the film (*Suggest a narration*
writes one). A written narration is used even with Narrate off.

## Each scene's ⋯ menu

Edit scene · Pose… · Queue still · Animate · Play another still / clip · Make it 30 s ·
Copy prompt · Open in ComfyUI — and the [finishing tools](finishing-tools.md).

## It keeps track

- **Continuity** — the next still keeps the outfit, hair, place and light unless the scene changes them.
- **Pose variety** — the writer is told which poses the last scenes used.
- **Takes** — each re-render is a take; a clearly worse new take never replaces a better one.

!!! note "Ratings"
    Adult ratings need the server's adult setting. Every adult still states adult ages in the
    prompt and is checked by the vision model before it is shown — see
    [Adult safeguards](play-guide.md#adult-content-safeguards).
