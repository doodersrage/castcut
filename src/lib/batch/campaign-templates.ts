import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export type CampaignTemplate = {
  id: string;
  name: string;
  description?: string;
  target: 'random-scene' | 'topics';
  count: number;
  genre?: string;
  topics?: string[];
  queueToComfyUi: boolean;
  createdAt: number;
};

export const CAMPAIGN_TEMPLATES_KEY = 'prompt-campaign-templates-v1';

export function loadCampaignTemplates(): CampaignTemplate[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return readBrowserValue<CampaignTemplate[]>(CAMPAIGN_TEMPLATES_KEY) ?? [];
  } catch {
    return [];
  }
}

export function saveCampaignTemplates(templates: CampaignTemplate[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(CAMPAIGN_TEMPLATES_KEY, templates.slice(0, 24));
}

export function upsertCampaignTemplate(
  template: Omit<CampaignTemplate, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
): CampaignTemplate {
  const next: CampaignTemplate = {
    id: template.id ?? crypto.randomUUID(),
    createdAt: template.createdAt ?? Date.now(),
    name: template.name.trim(),
    description: template.description?.trim(),
    target: template.target,
    count: Math.min(12, Math.max(1, template.count)),
    genre: template.genre?.trim() || undefined,
    topics: template.topics?.filter(Boolean),
    queueToComfyUi: template.queueToComfyUi,
  };
  const templates = loadCampaignTemplates();
  const index = templates.findIndex(entry => entry.id === next.id);
  if (index >= 0) {
    templates[index] = next;
  } else {
    templates.unshift(next);
  }
  saveCampaignTemplates(templates);
  return next;
}

export function deleteCampaignTemplate(id: string): void {
  saveCampaignTemplates(loadCampaignTemplates().filter(entry => entry.id !== id));
}
