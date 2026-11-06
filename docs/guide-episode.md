# Make an episode

A whole episode — a half hour, 40 scenes, a few hundred shots — from one idea to a cut film. It is
the [Scene](guide-scene.md) page's Script and Runs and [Cut](guide-film.md), used in order; this
page is the order. **Make the whole episode for me** does all of it in one go (see
[Autopilot](#autopilot)); the steps below are what it does, and what to do by hand when you want a
say in each.

## Before you start

- **The LLM on** (Settings → LLM, e.g. LM Studio with a local 8B model or better): it writes the
  episode, casts the new parts and plans the shots.
- **ComfyUI** with the still engine (Qwen Image 2.1 is the default) — and, to animate, the clip
  engine; for music by scene, ACE-Step.
- **The lead** — the Cast member the episode is about — with a plate, and a **kept voice** (Cast →
  Voice) so their lines sound the same all the way through. A partner who is already in the Cast
  should have one too. A Cast member who speaks without one is given one the first time the film
  is cut, which you may want to audition first.
- **Time.** About a minute a still on a desktop GPU: a 480-shot episode is eight hours or so with a
  redo now and then — overnight. Animating every shot is many times that; **only the shots with a
  line** is the middle way.

## By hand

1. **Write it.** Scene → More → Script → **Write an episode…**: what it's about, about how many
   minutes (a scene for every 45 seconds: 40 for a half hour) — or **In scenes**, a count (2–40)
   for a short — and a tone. From [Day](guide-day.md), **Make it a short →** opens it on the Day's
   idea, its mood as the tone and a scene per moment. **Write the outline**, change
   what you like, **Write the screenplay**, then **Put it in the script box** and **Keep this
   script**. ([Script](guide-scene.md#script))
2. **Who's who.** **Confirm** each part the page suggests. A part that comes back and isn't in the
   Cast is listed: **Make … Cast** casts them from their lines and renders their plate, one at a
   time, so their shots show them instead of the lead.
3. **Plan the shots.** Under each scene, **Draft with the LLM** (or **Draft shots**, by the rules).
   Change, split, merge or reorder what you want; the **Storyboard** shows the lot.
4. **Prepare the run.** **Prepare a run…** makes every planned shot a Scene and lists the run.
   Under the limits, **Episode**: **Keep the best take by its checks**, **Redo a failing take**
   (once is a good start), and **Animate** if you want clips. **Start the run** — and keep the
   page open. ([Episode runs](guide-scene.md#episode-runs))
5. **Look at _To check_.** When it's done, the run lists the Scenes whose best take still missed a
   check: open each, keep another take or make one. Everything else is kept already.
6. **Cut it.** Cut → Scenes. Under Options: **Read the lines on stills** (a cut of stills then
   talks), **Widen stills to 16:9** for a wide film, **Music by scene**, and **Content
   Credentials** left on. **Cut film** — a film this long renders in pieces.
   ([Cut a film](guide-film.md))

## Autopilot

In **Write an episode…**, once the screenplay is written, tick **Make the whole episode for me**
and the button becomes **Make the episode**. Its choices:

| Choice                             | Default | What it does                                                                                                |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| **Make the recurring parts Cast**  | on      | Step 2's **Make … Cast** for every part listed (never a child, a numbered extra or a bare role)             |
| **Redo a failing take**            | 1×      | 0–3 redos when even the best take missed a check                                                             |
| **Animate**                        | nothing | Nothing (a talking animatic of stills), **the shots with a line**, or **every shot**                         |
| **Cut the film when it's done**    | on      | Opens Cut when the run ends and cuts it (step 6)                                                            |

**Make the episode** then, with nobody at the page:

1. keeps the script;
2. confirms Who's who where a name matches one Cast member (a part with two possible matches, or
   none, stays a stranger unless it's cast in the next step);
3. makes the recurring parts Cast — each plate is rendered and waited for in turn;
4. plans every scene's shots with the LLM, by the rules for a scene the LLM can't plan;
5. prepares the run as an episode run — the best take kept, your redos, your animation, its limits
   fitted to the script (a take per Scene and its redos, up to a day) — and starts it;
6. when the run is done, opens Cut and cuts the film: the lines read, the stills widened for a wide
   film, music by scene, then **Cut film**. Shots the pre-cut check would ask about are cut anyway:
   they are on the run's _To check_ list.

The line under the script says where it is (_Planning the shots: scene 12 of 40…_, _Running…_), and
on Cut the line above the status does. The film lands in **Your films** like any other.

### What it can't do for you

- **Keep the page open.** The run renders one Scene at a time on the Scene page, because the checks
  run on the card. Closing the tab pauses it; open the page again and **Resume** carries on. A run
  that pauses — by itself, when a take fails, or by you — doesn't cut: resume it, and the cut
  follows when it's done.
- **Choose voices.** Give the lead (and anyone you care about) a kept voice first; the autopilot
  gives the others one the first time they speak.
- **Judge the takes.** It keeps the best by the checks. _To check_ is the list of Scenes worth a
  look; after fixing some, cut again by hand.
- **Only the episode in the cut.** Cut's Scenes are all of the Cast's kept Scenes, in the order they
  were made — the episode's in its own order. Scenes you made by hand for the same Cast are in it
  too: leave them out in Cut's shot list, or cut a Cast that only has the episode.

If a step fails — the LLM is down, the run can't be prepared — it stops there and says so, with
what it did kept: carry on by hand from that step.
