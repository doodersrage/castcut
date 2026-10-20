import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMFYUI_ESSENTIAL_SECTION_IDS,
  comfyUiSectionRequiresFullSettings,
  comfyUiSectionsForEssentials,
  filterComfyUiSettingsSections,
  normalizeComfyUiSettingsSection,
  settingsComfyUiSectionHref,
} from "./comfyui-nav";

describe("settings-comfyui-nav", () => {
  it("normalizes known section ids", () => {
    assert.equal(normalizeComfyUiSettingsSection("vram-guard"), "vram-guard");
    assert.equal(normalizeComfyUiSettingsSection("nope"), null);
  });

  it("filters sections by keyword", () => {
    const hits = filterComfyUiSettingsSections("vram");
    assert.ok(hits.some((section) => section.id === "vram-guard"));
    assert.equal(filterComfyUiSettingsSections("zzzz").length, 0);
  });

  it("surfaces LoRA library from lora/trigger keywords", () => {
    const hits = filterComfyUiSettingsSections("lora");
    assert.ok(hits.some((section) => section.id === "lora-library"));
    assert.ok(hits.some((section) => section.id === "lora-train"));
    assert.ok(hits.some((section) => section.id === "model-assets"));
    assert.ok(
      filterComfyUiSettingsSections("civitai").some((section) => section.id === "lora-library"),
    );
    assert.equal(
      settingsComfyUiSectionHref("lora-library"),
      "/settings?tab=comfyui&section=lora-library",
    );
  });

  it("surfaces model assets from download/checkpoint keywords", () => {
    const hits = filterComfyUiSettingsSections("download");
    assert.ok(hits.some((section) => section.id === "model-assets"));
    assert.equal(
      settingsComfyUiSectionHref("model-assets"),
      "/settings?tab=comfyui&section=model-assets",
    );
  });

  it("deep-links LoRA train section", () => {
    assert.equal(
      settingsComfyUiSectionHref("lora-train"),
      "/settings?tab=comfyui&section=lora-train",
    );
  });

  it("builds deep-link hrefs", () => {
    assert.equal(
      settingsComfyUiSectionHref("auto-improve"),
      "/settings?tab=comfyui&section=auto-improve",
    );
  });

  it("surfaces Connection from pool/export/restart keywords", () => {
    const poolHits = filterComfyUiSettingsSections("cluster");
    assert.ok(poolHits.some((section) => section.id === "connection"));
    const exportHits = filterComfyUiSettingsSections("sidecar");
    assert.ok(exportHits.some((section) => section.id === "connection"));
    const restartHits = filterComfyUiSettingsSections("reboot");
    assert.ok(restartHits.some((section) => section.id === "connection"));
  });

  it("marks advanced ComfyUI deep links as requiring full settings", () => {
    assert.equal(comfyUiSectionRequiresFullSettings("workflow-patching"), true);
    assert.equal(comfyUiSectionRequiresFullSettings("lora-train"), true);
    assert.equal(comfyUiSectionRequiresFullSettings("workflow-library"), true);
    assert.equal(comfyUiSectionRequiresFullSettings("lora-library"), true);
    assert.equal(comfyUiSectionRequiresFullSettings("connection"), false);
    assert.equal(comfyUiSectionRequiresFullSettings(null), false);
  });

  it("lists inference engine before ComfyUI connection", () => {
    const full = comfyUiSectionsForEssentials(false);
    assert.equal(full[0]?.id, "inference-engine");
    assert.equal(full[1]?.id, "connection");
    const essentials = comfyUiSectionsForEssentials(true);
    assert.deepEqual(
      essentials.map((section) => section.id),
      COMFYUI_ESSENTIAL_SECTION_IDS,
    );
    assert.equal(COMFYUI_ESSENTIAL_SECTION_IDS[0], "inference-engine");
    assert.equal(COMFYUI_ESSENTIAL_SECTION_IDS[1], "connection");
  });

  it("limits jump-nav sections in essentials mode", () => {
    const essentials = comfyUiSectionsForEssentials(true);
    assert.equal(essentials.length, COMFYUI_ESSENTIAL_SECTION_IDS.length);
    assert.ok(essentials.every((section) => COMFYUI_ESSENTIAL_SECTION_IDS.includes(section.id)));
    assert.equal(
      filterComfyUiSettingsSections("kohya", { essentialsOnly: true }).length,
      0,
    );
    assert.ok(
      filterComfyUiSettingsSections("download", { essentialsOnly: true }).some(
        (section) => section.id === "model-assets",
      ),
    );
  });
});
