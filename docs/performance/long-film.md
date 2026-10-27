# A long film end to end (2026-10-27)

M6 V8. A 10-minute film through Cut — encoded on the server, its loudness measured, packed with
all its media and the package imported in a fresh browser — measured by
`scripts/long-film.mts` on a production build.

## Method

- **Media:** 60 distinct clips of 10 s, 1280×720 with sound (ffmpeg test pattern and a tone
  each), 204 MB, uploaded to an empty data folder as Gallery originals and added to Cut as shots.
- **Build:** `npm run build`, `next start`, sign-in off. AMD Ryzen 9 9900X, 62 GB of RAM.
- **Measured:** each step's time, the server's peak resident memory (its process group, ffmpeg
  included) and the page's JS heap.

## Results

| Step                                                      |      Time | Server memory peak |
| --------------------------------------------------------- | --------: | -----------------: |
| Cut the film (server encode, 600 s, 1280×720, with sound) |      40 s |         2.8–4.2 GB |
| Measure loudness                                          | 1.3–1.9 s |         1.4–1.8 GB |
| Pack the cut with its 60 media files (204 MB)             |     6.1 s |         1.4–1.7 GB |
| Import the package in a fresh browser                     |     3.5 s |             1.2 GB |

Every step is one request well inside its time limit (loudness 240 s, the encode a background
job), so nothing needed moving to a background job. The page's JS heap stayed under 22 MB, the
package included: it is built in the browser from 60 fetched files without holding them twice.

## Defects found and fixed

- **D16 — a long film was never kept on the Cast.** The server encodes the film, the browser
  downloaded it and uploaded it back to keep it, and the upload route refuses video over 80 MB —
  this 10-minute 720p film was past it. The film was only downloaded, and Cut said _pick a Cast lead_
  with a Cast picked. Now the server keeps its own finished file (`keepFinishedFilm`, persist
  `kind: 'film-job'`; up to 220 MB, the server-encode cap), the upload remains for a browser
  encode or when the server no longer has the job, and Cut says why a film wasn't kept.
- **D17 — the encode held the whole film in memory.** Each clip's sound was read from the same
  ffmpeg input as its picture. The sounds are mixed in parallel (each delayed to its place), the
  pictures joined one after another, so ffmpeg read every clip from the start and kept its decoded
  frames until its turn: 26.7 GB for this film, on three runs out of four (2.3 GB on the fourth).
  Each clip now has its own sound-only input (`-vn`) and a picture-only one (`-an`): 2.8–4.2 GB,
  and 40 s instead of 55–67. The output is the same: the picture identical (PSNR ∞), the sound
  within rounding (PSNR 164 dB), the loudness the same.

## Not covered

- **The desktop app** (Tauri, Linux): its server is the same `next start` bundle measured here,
  but the window itself — WebKitGTK, the bundled Node, the installer — needs a person at it.
- A film over 220 MB (the server-encode cap) is still only downloaded, and Cut now says so.
- A film with music, narration, titles and transitions: this one is clips with their own sound,
  hard cuts.

## Re-run

```bash
npm run build
npx tsx scripts/long-film.mts --clips 60 --seconds 10 --json <file>
```
