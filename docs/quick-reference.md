# Quick reference

Routes, workspace modes, keyboard shortcuts, and common npm commands. For narrative guides see [operator](operator.md) and [Play guide](play-guide.md).

---

## Workspace modes

| Mode | Sidebar | Advanced UI |
| --- | --- | --- |
| **Simple** (default) | Essentials + More tools | Collapsed |
| **Play** | Campaign, Moodboard, Fitting, Day, Roleplay, Gallery, Queue | Lean Roleplay rail |
| **Studio** | Edit / Media / Library groups | Collapsed sections |
| **Full** | Same as Studio, expanded | Quality sections open |

Toggle: sidebar footer or **Profile → Appearance**.

---

## Play funnel routes

| Step | Route | Deep link |
| --- | --- | --- |
| Campaign | `/play` | `?character=` · `#lookpack=` |
| Moodboard | `/moodboard` | `?character=` |
| Fitting | `/fitting` | `?character=&wardrobe=` |
| Day | `/day` | `?character=` · `?from=look` |
| Roleplay | `/roleplay` | `?character=` · `?from=look` |
| Cast films | `/characters/<id>` | `?media=films` |

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
