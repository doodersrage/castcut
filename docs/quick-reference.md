# Quick reference

Routes, workspace modes, keyboard shortcuts, and common npm commands. For narrative guides see [operator](operator.md) and [Play guide](play-guide.md).

---

## Workspace modes

Castcut has three levels:

| Level | What it is for | Where |
| --- | --- | --- |
| **Film** (default) | Everyday filmmaking — Cast, Look & Outfit, Day / Story, Gallery and Cut | Film dock: Film · Day · Outfit · Story, the rest under More (the same on a phone) |
| **Studio** | More control — prompts, references, model settings, every tool | Sidebar groups; the film in progress stays at the top of the sidebar with its next step and **Back to Film** |
| **More tools** (inside Studio) | Specialist tools, workflow graphs, integrations | Studio's *More tools* group, ⌘K, Settings → All settings |

Switch in **Profile → Appearance**. Older saved modes map over: Simple → Film, Full → Studio.

---

## Play funnel routes

| Step | Route | Deep link |
| --- | --- | --- |
| Film | `/play` | `?character=` · `#lookpack=` |
| Look | `/moodboard` | `?character=` |
| Outfit | `/fitting` | `?character=&wardrobe=` |
| Day | `/day` | `?character=` · `?from=look` |
| Story | `/story` | `?character=` · `?from=look` |
| Cast films | `/characters/<id>` | `?media=films` |
| Phone Film hub | `/m/film` | Same campaign as `/play` |

---

## Core tool routes

| Tool | Route |
| --- | --- |
| Dashboard | `/dashboard` |
| Generate | `/` |
| Gallery | `/gallery` |
| Queue | `/queue` |
| Video | `/video` |
| Studio | `/studio` |
| Settings | `/settings` |
| Workflow editor | `/workflow-editor` |
| Mobile companion | `/m` |

Legacy: `/duo` → Character · `/random-scene` → Generate.

Full table: [Tools (GitHub README)](https://github.com/doodersrage/castcut/blob/main/README.md#tools).

---

## Keyboard & palette

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` / `⌘K` | Command palette — tools, heal, recent gallery, continue |
| Gallery review | `1`–`5` rate (review mode) |
| Escape | Close modals / lightbox |

Command palette sections: **Continue**, **Tools**, **Settings**, **Heal & ready**.

---

## npm scripts (local dev)

```bash
npm install && cp .env.example .env.local
npm run dev              # http://localhost:47832
npm run build && npm start
npm test                 # unit + compose exposed validate
npm run test:e2e:ops     # auth, queue recovery, workflow, Play glue
npm run docs:serve       # this site at http://127.0.0.1:8000
npm run prompt:cli -- --help
```

CI runs lint, test, build, Playwright on push — see [performance guide](performance/guide.md).

Running Playwright against your own production server? Build and start with the **same**
`NEXT_PUBLIC_*` values (e.g. `NEXT_PUBLIC_PLAYWRIGHT=1` for both `npm run build` and `npm start`).
They're baked into the browser bundle at build time, so a mismatch renders differently on server
and client and shows up as React hydration error #418 on every page.

---

## Docker (production)

```bash
docker pull ghcr.io/doodersrage/castcut:latest
docker run -d --name castcut -p 127.0.0.1:47832:47832 \
  -e COMFYUI_API_URL=http://host.docker.internal:8188 \
  -e LLM_MODEL=… -e LLM_VISION_MODEL=… \
  ghcr.io/doodersrage/castcut:latest
```

Exposed profile + auth: [configuration — Docker](configuration.md#docker).

---

## Releases & desktop

| Channel | Link |
| --- | --- |
| Latest release | [GitHub Releases](https://github.com/doodersrage/castcut/releases/latest) |
| Container | `ghcr.io/doodersrage/castcut:latest` |
| Desktop | `.dmg` / `.exe` / `.deb` — [desktop.md](desktop.md) |

Cut a release: [releasing.md](releasing.md).
