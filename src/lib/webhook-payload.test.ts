import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatWebhookPayload } from "./webhook-payload";
import type { WebhookJobPayload } from "./webhook-settings";

function payload(overrides: Partial<WebhookJobPayload> = {}): WebhookJobPayload {
  return {
    event: "comfyui.job.completed",
    completedAt: 1700000000000,
    ...overrides,
  };
}

describe("formatWebhookPayload - generic template", () => {
  it("passes the payload through unchanged", () => {
    const p = payload({ model: "flux", prompt: "hi" });
    assert.deepEqual(formatWebhookPayload(p, "generic"), p);
  });
});

describe("formatWebhookPayload - discord template", () => {
  it("builds a full embed with all optional fields present", () => {
    const p = payload({
      model: "flux",
      tool: "generate",
      status: "done",
      imageCount: 3,
      prompt: "a".repeat(2000),
    });
    const result = formatWebhookPayload(p, "discord") as {
      embeds: Array<Record<string, unknown>>;
    };
    const embed = result.embeds[0]!;
    assert.equal(embed.title, "ComfyUI job completed");
    assert.equal(embed.description, "a".repeat(1800));
    assert.equal(embed.color, 0x8b5cf6);
    assert.deepEqual(embed.fields, [
      { name: "Model", value: "flux", inline: true },
      { name: "Tool", value: "generate", inline: true },
      { name: "Status", value: "done", inline: true },
      { name: "Images", value: "3", inline: true },
    ]);
    assert.deepEqual(embed.footer, { text: "Castcut" });
    assert.equal(embed.timestamp, new Date(1700000000000).toISOString());
  });

  it("uses the failure title and error color for a job.error event", () => {
    const p = payload({ event: "comfyui.job.error", message: "boom" });
    const result = formatWebhookPayload(p, "discord") as {
      embeds: Array<Record<string, unknown>>;
    };
    const embed = result.embeds[0]!;
    assert.equal(embed.title, "ComfyUI job failed");
    assert.equal(embed.color, 0xef4444);
    assert.equal(embed.description, "boom");
  });

  it("falls back to a dot-to-space title for any other event", () => {
    const p = payload({ event: "prompt.history.saved" });
    const result = formatWebhookPayload(p, "discord") as {
      embeds: Array<Record<string, unknown>>;
    };
    assert.equal(result.embeds[0]!.title, "prompt history saved");
    assert.equal(result.embeds[0]!.color, 0x8b5cf6);
  });

  it("falls back to the default description when neither prompt nor message is set", () => {
    const p = payload({ event: "comfyui.job.queued" });
    const result = formatWebhookPayload(p, "discord") as {
      embeds: Array<Record<string, unknown>>;
    };
    assert.equal(result.embeds[0]!.description, "Castcut event");
  });

  it("falls back to message when prompt is absent", () => {
    const p = payload({ event: "comfyui.job.queued", message: "hi there" });
    const result = formatWebhookPayload(p, "discord") as {
      embeds: Array<Record<string, unknown>>;
    };
    assert.equal(result.embeds[0]!.description, "hi there");
  });

  it("omits all optional fields when none are set", () => {
    const p = payload();
    const result = formatWebhookPayload(p, "discord") as {
      embeds: Array<Record<string, unknown>>;
    };
    assert.deepEqual(result.embeds[0]!.fields, []);
  });

  it("includes an imageCount of 0 (uses a != null check, not truthiness)", () => {
    const p = payload({ imageCount: 0 });
    const result = formatWebhookPayload(p, "discord") as {
      embeds: Array<Record<string, unknown>>;
    };
    assert.deepEqual(result.embeds[0]!.fields, [
      { name: "Images", value: "0", inline: true },
    ]);
  });
});

describe("formatWebhookPayload - slack template", () => {
  it("builds header, prompt, and context blocks when all fields are present", () => {
    const p = payload({
      model: "flux",
      prompt: "b".repeat(3000),
      message: "extra context",
    });
    const result = formatWebhookPayload(p, "slack") as {
      blocks: Array<Record<string, unknown>>;
    };
    assert.equal(result.blocks.length, 3);
    assert.deepEqual(result.blocks[0], {
      type: "section",
      text: { type: "mrkdwn", text: "*comfyui.job.completed* · flux" },
    });
    assert.deepEqual(result.blocks[1], {
      type: "section",
      text: { type: "mrkdwn", text: "b".repeat(2800) },
    });
    assert.deepEqual(result.blocks[2], {
      type: "context",
      elements: [{ type: "mrkdwn", text: "extra context" }],
    });
  });

  it("omits the model suffix and optional blocks when nothing else is set", () => {
    const p = payload({ event: "comfyui.job.queued" });
    const result = formatWebhookPayload(p, "slack") as {
      blocks: Array<Record<string, unknown>>;
    };
    assert.equal(result.blocks.length, 1);
    assert.deepEqual(result.blocks[0], {
      type: "section",
      text: { type: "mrkdwn", text: "*comfyui.job.queued*" },
    });
  });

  it("does not add a prompt block for a whitespace-only prompt", () => {
    const p = payload({ event: "comfyui.job.queued", prompt: "   " });
    const result = formatWebhookPayload(p, "slack") as {
      blocks: Array<Record<string, unknown>>;
    };
    assert.equal(result.blocks.length, 1);
  });
});
