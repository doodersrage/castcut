import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CASTCUT_PACK } from "./comfyui-custom-node-registry";
import {
  installComfyUiMissingNodePacks,
  managerInstallTargetForPack,
} from "./comfyui-manager-install";

type Route = {
  match: (url: string, method: string) => boolean;
  respond: () => { status: number; body?: unknown };
};

function makeFetchImpl(routes: Route[]) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    for (const route of routes) {
      if (route.match(url, method)) {
        const { status, body } = route.respond();
        return new Response(typeof body === "string" ? body : JSON.stringify(body ?? null), {
          status,
        });
      }
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const MANAGER_V3: Route = {
  match: url => url.endsWith("/api/manager/version"),
  respond: () => ({ status: 200, body: "V3.41" }),
};
const IDLE: Route = {
  match: url => url.includes("/queue/status"),
  respond: () => ({ status: 200, body: { is_processing: false, total_count: 1, done_count: 1 } }),
};
const MAPPINGS: Route = {
  match: url => url.includes("/getmappings"),
  respond: () => ({ status: 200, body: { "pack-a": [["MyCustomNode"], {}] } }),
};

describe("managerInstallTargetForPack", () => {
  it("registry packs by id, Git-only Manager-list packs as listed, Castcut by Git URL", () => {
    assert.deepEqual(
      managerInstallTargetForPack({ name: "comfyui-impact-pack", files: ["https://g/i"], install_type: "git-clone" }),
      { kind: "registry", id: "comfyui-impact-pack" },
    );
    assert.deepEqual(
      managerInstallTargetForPack({
        name: "Foo",
        id: "Foo",
        version: "unknown",
        files: ["https://g/Foo"],
        install_type: "git-clone",
      }),
      { kind: "listed", id: "Foo", files: ["https://g/Foo"] },
    );
    assert.deepEqual(managerInstallTargetForPack(CASTCUT_PACK), {
      kind: "git-url",
      url: "https://github.com/doodersrage/castcut",
    });
  });
});

describe("installComfyUiMissingNodePacks", () => {
  it("returns ok immediately for an empty/blank class type list, without any request", async () => {
    const { fetchImpl, calls } = makeFetchImpl([]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["  ", ""],
      fetchImpl,
    });
    assert.deepEqual(result, { ok: true, installed: [], unresolved: [], restartNeeded: false });
    assert.equal(calls.length, 0);
  });

  it("reports ComfyUI-Manager as missing when no Manager answers", async () => {
    const { fetchImpl } = makeFetchImpl([]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["MyCustomNode"],
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.equal(result.missingManager, true);
    assert.match(result.error ?? "", /ComfyUI-Manager is not available/);
  });

  it("reports unresolved class types when no Manager pack maps to them", async () => {
    const { fetchImpl } = makeFetchImpl([
      MANAGER_V3,
      { match: url => url.includes("/getmappings"), respond: () => ({ status: 200, body: {} }) },
      { match: url => url.includes("/getlist"), respond: () => ({ status: 200, body: { node_packs: {} } }) },
    ]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["TotallyUnknownNode"],
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.unresolved, ["TotallyUnknownNode"]);
    assert.match(result.error ?? "", /No Manager pack found for: TotallyUnknownNode/);
  });

  it("installs a registry pack from V3's node_packs map with version/channel/mode, then waits", async () => {
    const { fetchImpl, calls } = makeFetchImpl([
      MANAGER_V3,
      MAPPINGS,
      {
        match: url => url.includes("/getlist"),
        respond: () => ({
          status: 200,
          body: {
            channel: "default",
            node_packs: {
              "pack-a": { title: "Pack A", files: ["https://example.com/pack-a"], version: "1.2.0" },
            },
          },
        }),
      },
      { match: (url, method) => url.includes("/queue/install") && method === "POST", respond: () => ({ status: 200 }) },
      { match: (url, method) => url.includes("/queue/start") && method === "POST", respond: () => ({ status: 200 }) },
      IDLE,
    ]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host/",
      classTypes: ["MyCustomNode"],
      fetchImpl,
      waitOptions: { intervalMs: 1 },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.installed, ["Pack A"]);
    assert.equal(result.restartNeeded, true);
    const install = calls.find(c => c.url === "http://host/api/manager/queue/install");
    const body = JSON.parse(install?.body ?? "{}") as Record<string, unknown>;
    assert.equal(body.id, "pack-a");
    assert.equal(body.version, "latest");
    assert.equal(body.selected_version, "latest");
    assert.equal(body.channel, "default");
    assert.equal(body.mode, "cache");
  });

  it("passes the Manager's refusal on in plain words", async () => {
    const { fetchImpl } = makeFetchImpl([
      MANAGER_V3,
      MAPPINGS,
      {
        match: url => url.includes("/getlist"),
        respond: () => ({
          status: 200,
          body: { node_packs: { "pack-a": { files: ["https://example.com/pack-a"], version: "1.0.0" } } },
        }),
      },
      {
        match: url => url.includes("/queue/install"),
        respond: () => ({ status: 403, body: "A security error has occurred. Please check the terminal logs" }),
      },
    ]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["MyCustomNode"],
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /security_level = normal/);
  });
});
