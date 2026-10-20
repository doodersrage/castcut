export type PromptTemplate = {
  id: string;
  label: string;
  template: string;
  defaultPortraitStyle?: 'portrait' | 'full-body' | 'action';
};

export const BUILTIN_PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  {
    id: 'duo-sport-race',
    label: 'Duo sport race',
    template: 'two {{gender}} {{sport}} athletes in a fierce {{competition}} on {{location}}',
    defaultPortraitStyle: 'action',
  },
  {
    id: 'solo-cyclist',
    label: 'Solo cyclist',
    template: '{{discipline}} cyclist {{action}} on {{location}}',
    defaultPortraitStyle: 'action',
  },
  {
    id: 'character-portrait',
    label: 'Character portrait',
    template: '{{age}} {{gender}} with {{hair}}, {{expression}}; {{location}}',
    defaultPortraitStyle: 'portrait',
  },
];

export function applyPromptTemplate(template: string, slots: Record<string, string>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const value = slots[key]?.trim();
      return value && value.length > 0 ? value : '';
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return getAllPromptTemplates().find(entry => entry.id === id);
}

export function getAllPromptTemplates(userTemplates: PromptTemplate[] = []): PromptTemplate[] {
  return [...BUILTIN_PROMPT_TEMPLATES, ...userTemplates];
}
