import type { WebhookJobPayload } from './webhook-settings';

export type WebhookTemplate = 'generic' | 'discord' | 'slack';

export function formatWebhookPayload(
  payload: WebhookJobPayload,
  template: WebhookTemplate
): Record<string, unknown> {
  if (template === 'discord') {
    return formatDiscordPayload(payload);
  }
  if (template === 'slack') {
    return formatSlackPayload(payload);
  }
  return payload;
}

function formatDiscordPayload(payload: WebhookJobPayload): Record<string, unknown> {
  const title =
    payload.event === 'comfyui.job.completed'
      ? 'ComfyUI job completed'
      : payload.event === 'comfyui.job.error'
        ? 'ComfyUI job failed'
        : payload.event.replace(/\./g, ' ');

  const fields = [
    payload.model ? { name: 'Model', value: payload.model, inline: true } : null,
    payload.tool ? { name: 'Tool', value: payload.tool, inline: true } : null,
    payload.status ? { name: 'Status', value: payload.status, inline: true } : null,
    payload.imageCount != null
      ? { name: 'Images', value: String(payload.imageCount), inline: true }
      : null,
  ].filter(Boolean);

  return {
    embeds: [
      {
        title,
        description: payload.prompt?.slice(0, 1800) || payload.message || 'Castcut event',
        color: payload.event.includes('error') ? 0xef4444 : 0x8b5cf6,
        fields,
        footer: { text: 'Castcut' },
        timestamp: new Date(payload.completedAt).toISOString(),
      },
    ],
  };
}

function formatSlackPayload(payload: WebhookJobPayload): Record<string, unknown> {
  const text = `*${payload.event}*${payload.model ? ` · ${payload.model}` : ''}`;
  const blocks: Record<string, unknown>[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text,
      },
    },
  ];

  if (payload.prompt?.trim()) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: payload.prompt.slice(0, 2800),
      },
    });
  }

  if (payload.message) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: payload.message }],
    });
  }

  return { blocks };
}
