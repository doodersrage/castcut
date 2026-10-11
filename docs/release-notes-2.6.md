# Castcut 2.6 — release notes

Castcut 2.6 is about trust and finishing. Before a film is cut, Castcut now checks the shots themselves and says what it would otherwise do quietly. Every still says whether it looks like your Cast. The cut became a small editor: trim clips, frame stills closer, pick the poster, cut square or 1080p, set the music and voice levels and hear them together. Nothing you make is a dead end any more: every film remembers how it was cut and can be re-cut in another shape, every Day episode can be opened again, the Day plan has undo, and restoring a backup shows what it holds before it replaces anything.

> ## Changed defaults & things to know
>
> - **Cut film checks the shots first.** Pressing *Cut film* now reads each shot's file ("Checking the shots…", a second or two) and lists problems with the face / pose / Auto-review misses: a missing file, a black still, a clip that goes black, or a talking clip with no sound. *Cut anyway* is still there.
> - **Plain "WAN Video" clips sample as Rapid AIO.** The clip graph has always loaded the Rapid AIO file for every WAN engine. *WAN Video* (and the WAN fallback when LTX-2.5 can't take a shot) used full-WAN sampling — Max meant 40 steps at CFG 5 on a CFG-1 model. Those clips now use Rapid AIO's sampling (Max = 8 steps, CFG 1): much faster, no overcooked frames.
> - **Re-cut needs films cut in 2.6.** Only films cut from now on carry the recipe *Re-cut* uses. Shots that lived only in the browser (demo stills, uploads) can't come back.
> - **Music and voice levels are a server-encode feature.** The browser fallback cuts picture only, as before.
> - **Closer framing is a crop.** Asking the image engine for a close-up doesn't work (Edit 2511 kept her thighs in frame on 4 of 4 tries), so *waist up* / *chest up* crop the finished still around her face — never under 420 px tall.

## What's new

### Checked before the cut

- **Files, black frames, sound.** Cut film fetches each shot the way the encode will and samples it: missing files, black stills, clips mostly black or black for over 1.5 s, talking clips with no sound track or a silent one ("its line won't be heard"). A shot ComfyUI can't be reached for says so instead of calling the file missing. Checked against real media: a black picture, a silent track (−91 dB), a clip with no audio and a 2.5 s black gap were caught; the night sample still and a normal talking clip were not flagged.
- **What the cut would quietly do.** Under *Ready to cut*, Day says when a slot will be left out (its still failed or is still rendering), when a failed clip is replaced by its still, and when a line has no talking clip.
- **Which checks ran.** Every Cut says *Checked: faces 3 of 4, auto-review · Not checked: pose*.

### Looks like the Cast

Each finished Day still shows a face mark — *Looks like Nora 72%*, *Face may drift 48%*, *Not Nora? 31%* — from its measured face match, and the Cut shot list shows it per shot (Day and Story, each with its own bars).

### A small film editor

The Cut shot list (Day, phone Day, Story, episodes) now has, per shot:

- **Trim** a clip — *from … to …*; its voice is trimmed with it, in both encoders.
- **Frame** a still — *as shot / waist up / chest up*.
- **Poster** — Save poster uses this shot; on a clip, *frame at … s*.

And for the whole cut:

- **Shape** — Widescreen 16:9, Vertical 9:16, or Square 1:1 (new) — and **Size**, 720p or 1080p.
- **Music / Lines** levels, with the music still ducking under every line.
- **▶ Preview the mix** — the music and every line, together, at those levels and where the encode will put them, before you spend an encode.

### Every film has a home

- **What's in it · Re-cut.** A cut film keeps its recipe — shots, trims, framing, captions, music, levels — on its Gallery entry. On the Cast page each film lists its shots and re-cuts at another shape and size as a new film beside it.
- **Every Day episode keeps its Day.** The Cast page's *Seasons* show what went into each episode (each slot's still or clip, place, beat, line) and **Open this Day again** puts it back on Day. The Day that was there is kept aside behind *Bring back the Day you had*.

### Undo, continuity, timing

- **Undo / Redo for the Day plan** — places, beats, outfits, lines, poses and slot count, up to 30 steps.
- **Held across the Day** — above the clothing row: face from the plate (+ face finish), the Day's clothes, the Cast's recurring places, the weather — and what each still is free to change.
- **How long a batch will take** — under Queue the rest / Animate all, from this machine's own recent renders, behind what is already queued.

### Backups you can check

Every *Import / Restore backup* now reads the file first and shows it beside what is here — Cast by name, films, renders, prompt history, workflows, when it was saved — marking anything the file has less of. The default restore downloads a copy of what is here before replacing it, and says how many renders in the file exist only in ComfyUI's output folder.
