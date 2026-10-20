import type { PromptTemplate } from '../prompt/templates';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export const USER_TEMPLATES_KEY = 'comfy-prompt-user-templates-v1';

export type UserPromptTemplate = PromptTemplate & {
  createdAt: number;
};

export function loadUserTemplates(): UserPromptTemplate[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    return readBrowserValue<UserPromptTemplate[]>(USER_TEMPLATES_KEY) ?? [];
  } catch {
    return [];
  }
}

export function saveUserTemplates(templates: UserPromptTemplate[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(USER_TEMPLATES_KEY, templates.slice(0, 40));
}

export function createUserTemplate(input: {
  name: string;
  template: string;
  defaultPortraitStyle?: PromptTemplate['defaultPortraitStyle'];
}): UserPromptTemplate {
  const slug = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    id: `user-${slug || 'template'}-${crypto.randomUUID().slice(0, 8)}`,
    label: input.name.trim(),
    template: input.template.trim(),
    defaultPortraitStyle: input.defaultPortraitStyle,
    createdAt: Date.now(),
  };
}

export function upsertUserTemplate(template: UserPromptTemplate): void {
  const templates = loadUserTemplates();
  const index = templates.findIndex(entry => entry.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.unshift(template);
  }
  saveUserTemplates(templates);
}

export function deleteUserTemplate(id: string): void {
  saveUserTemplates(loadUserTemplates().filter(entry => entry.id !== id));
}

export function templateFromPrompt(name: string, prompt: string): UserPromptTemplate {
  return createUserTemplate({
    name,
    template: prompt.trim(),
    defaultPortraitStyle: 'action',
  });
}
