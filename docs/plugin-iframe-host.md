# Plugin iframe host protocol

Same-origin (or allowlisted) plugin tools render inside `/plugins/[id]` and talk to Castcut via `postMessage`.

Channel string (required on every message):

```txt
comfyui-prompt-studio-plugin-host
```

Source of truth: `src/lib/plugin-iframe-host.ts`. Host page: `src/app/plugins/[id]/page.tsx`.

## Origin security (default-deny)

- Messages are accepted only when `event.origin` matches the iframe URL origin, **or** an origin listed under Plugins → Iframe origin allowlist.
- Unresolvable / wildcard iframe targets are **denied** unless the posting origin is explicitly allowlisted.
- Same-origin relative `iframeUrl` values (starting with `/`) use the Studio page origin.

Recommended remote plugin host headers:

```http
Content-Security-Policy: frame-ancestors 'self' https://your-studio.example
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

The host iframe uses:

```html
sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
referrerPolicy="strict-origin-when-cross-origin"
allow="clipboard-write"
```

Do **not** add `allow-top-navigation` unless you fully trust the plugin. Prefer `plugin:navigate` for in-app routes.

## Host → plugin

| `type` | Purpose |
| --- | --- |
| `host:ready` | Iframe loaded; safe to send plugin messages |
| `host:context` | Snapshot: plugin id, model, tool, prompt, quality profile, **engine**, active LoRA ids, selected workflow id |
| `host:queue-result` | Outcome of a `plugin:queue` request (`ok`, `message`, optional `promptId`) |
| `host:apply-result` | Outcome of apply-* / patch / tag requests |

## Plugin → host

| `type` | Purpose |
| --- | --- |
| `plugin:resize` | `{ height }` — grow the host frame |
| `plugin:navigate` | `{ href }` — in-app navigation (same origin paths) |
| `plugin:toast` | `{ message }` — tray toast |
| `plugin:apply-prompt` | `{ prompt, negativePrompt? }` — push text into Studio without queueing |
| `plugin:apply-model` | `{ model }` — set shared target model |
| `plugin:apply-quality` | `{ qualityProfile: draft\|final\|max\|followSettings }` |
| `plugin:apply-engine` | `{ engine }` — switch inference engine (`comfyui`, `fal`, `replicate`, …) |
| `plugin:apply-lora-stack` | `{ loraIds: string[], model? }` — set session LoRA stack for the active (or named) model |
| `plugin:patch-workflow-tokens` | `{ tokens: [{ token, value }] }` — merge into Comfy custom workflow tokens |
| `plugin:write-gallery-tag` | `{ tag, entryIds?, mode?: add\|replace\|remove }` — tag gallery entries (defaults to latest) |
| `plugin:pick-gallery` | `{ target? }` — open Gallery pick mode for compose/refine/controlnet/… |
| `plugin:queue` | `{ prompt, negativePrompt?, model?, denoise?, cfg?, qualityProfile? }` — run host queue path |

## Minimal example

Serve any HTML from this app (same origin) and point a plugin tool `iframeUrl` at it, e.g. `/plugin-examples/hello-iframe.html`.

```js
const CHANNEL = 'comfyui-prompt-studio-plugin-host';

window.addEventListener('message', event => {
  const data = event.data;
  if (!data || data.channel !== CHANNEL) return;
  if (data.type === 'host:ready') {
    // Prefer posting back to event.origin instead of '*'.
    // window.parent.postMessage({ channel: CHANNEL, type: 'plugin:resize', height: 420 }, event.origin);
  }
  if (data.type === 'host:queue-result') {
    console.log(data.ok ? 'queued' : 'failed', data.message, data.promptId);
  }
});

window.parent.postMessage(
  {
    channel: CHANNEL,
    type: 'plugin:queue',
    prompt: 'a cat sitting on a windowsill, soft daylight',
  },
  window.location.origin
);

// Richer host controls
window.parent.postMessage(
  { channel: CHANNEL, type: 'plugin:apply-lora-stack', loraIds: ['skin', 'pose'] },
  window.location.origin
);
window.parent.postMessage(
  {
    channel: CHANNEL,
    type: 'plugin:patch-workflow-tokens',
    tokens: [{ token: 'MY_TOKEN', value: 'hello' }],
  },
  window.location.origin
);
window.parent.postMessage(
  { channel: CHANNEL, type: 'plugin:write-gallery-tag', tag: 'from-plugin' },
  window.location.origin
);
window.parent.postMessage(
  { channel: CHANNEL, type: 'plugin:apply-engine', engine: 'comfyui' },
  window.location.origin
);
```

Queue requests still run Studio preflight, **browser** plugin queue hooks, and gallery registration on the host side. When `PROMPT_DATA_DIR` is set, **server** plugins under `{PROMPT_DATA_DIR}/plugins` also run privileged `queue-preflight` / `queue-post` hooks inside the Comfy `/api/comfyui` path (allowlisted prompt / params / workflow JSON rewrite). See [architecture.md](architecture.md#plugins) and `GET`/`POST /api/plugins/server`.

## Server plugin registry (brief)

| Item | Detail |
| --- | --- |
| Path | `{PROMPT_DATA_DIR}/plugins/{id}/manifest.json` |
| Install | `POST /api/plugins/server` with `{ url }` / `{ manifest }` or multipart ZIP/JSON |
| HMAC | Optional `PROMPT_PLUGIN_HMAC_SECRET` — require `X-Prompt-Plugin-Signature` (hex HMAC-SHA256 of body) |
| ACL | Feature `plugins`; install/remove requires **admin** when auth is on |
| Bookmarks | Unchanged — `tool-plugin-registry` stays href-only and separate |

Example hook: `POST /api/plugin-hooks/denoise-rewrite` (shipped with `examples/queue-rewrite-plugin.json`).
