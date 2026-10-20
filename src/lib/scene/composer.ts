export type ComposeSceneStyle = 'layered' | 'inline';

export function composeScenePrompt(input: {
  backgroundPrompt: string;
  subjectPrompt: string;
  style?: ComposeSceneStyle;
}): string {
  const background = input.backgroundPrompt.trim();
  const subject = input.subjectPrompt.trim();

  if (!background) {
    return subject;
  }
  if (!subject) {
    return background;
  }

  if (input.style === 'inline') {
    return `${subject} ${background.charAt(0).toLowerCase()}${background.slice(1)}`.replace(
      /\s+/g,
      ' '
    );
  }

  return `${subject}\n\nSetting and atmosphere: ${background}`;
}
