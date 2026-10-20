import type { ServerEnvGroup } from './server-env-summary';

export function buildEnvSnippet(groups: ServerEnvGroup[]): string {
  const lines = [
    '# Castcut — copy to .env.local and fill in secrets',
    '# Restart the dev server or container after changes.',
    '',
  ];

  for (const group of groups) {
    lines.push(`# ${group.title}`);
    for (const field of group.fields) {
      if (field.hint) {
        lines.push(`# ${field.hint}`);
      }
      if (field.key.includes('KEY') || field.key.includes('TOKEN')) {
        lines.push(`${field.key}=`);
      } else if (field.configured && field.value && !field.value.includes('••••')) {
        lines.push(`${field.key}=${field.value}`);
      } else {
        lines.push(`${field.key}=`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
