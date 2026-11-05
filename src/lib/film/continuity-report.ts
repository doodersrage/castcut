/**
 * The film's continuity report (print-sheets.ts tableSheetHtml): every shot in film order with
 * who is in it, what she wears, where and when, what she carries and how she has changed — the
 * page a continuity supervisor keeps — then the open findings (the Cut's continuity checks, the
 * ones not marked fine), and a prop list: each thing and the shots it appears in. Pure.
 */

import type { ShotState } from './shot-state';

export type ContinuityReportShot = { key: string; title: string; state?: ShotState };
export type ContinuityReportFinding = {
  shotTitle: string;
  label: string;
  evidence: string;
  suggestion?: string;
};

const items = (list?: ReadonlyArray<{ text: string }>) => (list ?? []).map(item => item.text);

/** Things the film's shots carry or name, each with the shots it is in (film order). */
export function filmPropList(
  shots: readonly ContinuityReportShot[]
): Array<{ prop: string; shots: string[] }> {
  const map = new Map<string, { prop: string; shots: string[] }>();
  shots.forEach((shot, index) => {
    const state = shot.state;
    if (!state) return;
    for (const prop of [...items(state.carries), ...state.props]) {
      const key = prop.trim().toLowerCase();
      if (!key) continue;
      const entry = map.get(key) ?? { prop: prop.trim(), shots: [] };
      const label = `${index + 1}. ${shot.title}`;
      if (!entry.shots.includes(label)) entry.shots.push(label);
      map.set(key, entry);
    }
  });
  return [...map.values()].sort((a, b) => a.prop.localeCompare(b.prop));
}

/** The report's sections (for tableSheetHtml). */
export function continuityReportSections(input: {
  shots: readonly ContinuityReportShot[];
  findings: readonly ContinuityReportFinding[];
}) {
  return [
    {
      heading: 'Shot by shot',
      note: 'What each shot says she wears, carries and has been through — read down a column for a jump.',
      columns: ['#', 'Shot', 'Who', 'Wearing', 'Where · when', 'Carries', 'Changed', 'Feels'],
      rows: input.shots.map((shot, index) => {
        const state = shot.state;
        return [
          String(index + 1),
          shot.title,
          [state?.castName, ...(state?.others ?? [])].filter(Boolean).join(', '),
          [state?.look, state?.outfit, state?.shoes].filter(Boolean).join(' · '),
          [state?.place, state?.time, state?.storyDay ? `day ${state.storyDay}` : '']
            .filter(Boolean)
            .join(' · '),
          items(state?.carries).join(', '),
          items(state?.changes).join(', '),
          state?.emotion ?? '',
        ];
      }),
    },
    {
      heading: 'Open findings',
      note: 'What the continuity checks flag and nobody has marked fine yet.',
      columns: ['Shot', 'Check', 'What', 'Do'],
      rows: input.findings.map(finding => [
        finding.shotTitle,
        finding.label,
        finding.evidence,
        finding.suggestion ?? '',
      ]),
      empty: 'Nothing open — the shots agree.',
    },
    {
      heading: 'Props',
      note: 'Each thing the shots carry or name, and where — so it is the same thing every time.',
      columns: ['Prop', 'In'],
      rows: filmPropList(input.shots).map(entry => [entry.prop, entry.shots.join('; ')]),
      empty: 'No props named.',
    },
  ];
}
