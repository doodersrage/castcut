# Castcut 2.7 — release notes

Castcut 2.7 is about films that hold together. A Day can now be one event — a quiet afternoon reading at the beach, coffee on a café terrace — planned as consecutive moments from one fixed camera and animated so the clips run into each other as one continuous video. Talking clips stopped freezing arms and legs mid-action, Day clips moved to LTX-2.5, and the Cast bible picture can be gender-swapped.

> ## Changed defaults & things to know
>
> - **Day clips run on LTX-2.5.** Day's clips used to follow Video → Model (WAN by default). They now run on LTX-2.5, except two-person adult clips (WAN unless *Use LTX-2.5 for two-person adult clips too*). *Day clips on → WAN* in the engine note under the cards switches Day back. Talking clips stay on LTX-2.5 either way; Story still follows Video → Model.
> - **A new picture on a Day card clears its line.** Rendering a new still over a finished one empties the card's spoken line, how it's said and the reply — they were written for the old picture. A card's first still keeps a line written ahead of time.
> - **One event is a first version.** It works across the events we tried, but rough moments happen — an occasional LTX glitter, a stray gesture. Re-roll that card's still or clip, or fix it in post.

## What's new

### One event (Day)

Switch Day's idea row from *Whole day* to *One event* and write one line. Every slot becomes a consecutive moment of that event, in one place, at one time of day:

- **Queue day** makes the first moment the usual Day way, then each later moment as a same-camera edit of the one before (Edit 2511) — the room, the light, the camera and her clothes carry over.
- **Animate** ends each clip on the next moment's still, so **Cut** plays them straight into each other with no crossfade. The last clip moves into the plan's ending.
- **The plan stays filmable.** The LLM keeps her on one spot and in one posture (no lying down, walking off or leaving the picture), names nobody else (a mentioned waiter, date, passer-by or cyclist got painted in), and has her hold one or two props from first to last with a fixed description — picking things up and putting them down was where props were invented, doubled or lost. Every move and the ending is something her hands do (a page, a sip, a stir, a stitch), so the clips don't stall.
- **Plans are fixed, not just retried.** A plan that falls short goes back to the LLM with what is wrong ("move 4 is only a look — make it something her hands do with the mug"): 19 of 20 varied events planned in about two tries.
- **Guarded edits.** Moment 1 is settled to its own beat (the Day still follows its pose drawing more than its words); scene words are cut from the ending edit, and an ending that rebuilt the place is dropped. Auto-review redos only flag on an event Day — a redone moment would break the chain.
- *Back to a whole day* restores the Day's own scenes. Needs the LLM (Settings → LLM); clothed moods only. Four moments give the cleanest film.

Tested end to end in the app on beach reading, painting at an easel, café coffee, cooking pasta, knitting, watering plants, wine on a rooftop and journal writing: the same place and props throughout, and in the last round the largest frame-to-frame step between clips was 0.9–1.1 grey levels.

### Talking clips keep moving

A still caught mid-action — arms overhead in a stretch, a jump shot, a golf follow-through, a lifted knee, a lunge, bent over picking something up, mid-stride — used to keep that pose frozen through the whole line. Which limbs are mid-action is now read from the still's pose, and the clip settles each one (lowers the raised arm, puts the lifted foot down, straightens up) while she stays on her spot and faces the same way. On 35 stills at the app's size: limbs left frozen in 40 of 105 clips → 5. A crouch now rises and stands; a standing, waving still is no longer sat down.

### Cast and Day

- **Gender swap on the Cast bible picture.** *Gender swap* beside *Picture this bible* edits the rendered picture into the Cast's other-gender version — same scene, pose, outfit and camera — shown beside the original.
- **End pose on WAN lands.** WAN clips with an end picture now run 65 frames (1 + 4n); at 64 the end frame was dropped and the clip cut hard to the next shot.
- **Re-pose this still** keeps the still's shape (a portrait still came back square).
- **No name painted into pictures.** Image briefs no longer name the Cast — an unusual name came out as a logo panel beside her.

### Docs

- The documentation site's broken links are fixed (the home page's paths, links to files outside the docs, dead photo-credit links), and the docs build now fails on a broken link or heading anchor.
