/**
 * Printable production sheets — a storyboard, a call sheet, a script — as one self-contained HTML
 * page each, laid out for paper (A4 / Letter) and the screen. Opened in a new tab, the browser's
 * Print saves them as PDF: no PDF library, nothing uploaded. Pure (the opener is in
 * print-sheets-client.ts).
 */

/** Text made safe for HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A picture's address made absolute (the sheet opens from a blob, where "/api/…" would not load). */
export function absoluteUrl(url: string | undefined, origin: string): string {
  const value = url?.trim() ?? '';
  if (!value) return '';
  if (/^(data:|blob:|https?:)/i.test(value)) return value;
  return `${origin.replace(/\/$/, '')}${value.startsWith('/') ? '' : '/'}${value}`;
}

const BASE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 11pt/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; background: #fff; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
  h1 { font-size: 18pt; margin: 0; }
  .meta { color: #555; font-size: 9.5pt; text-align: right; }
  .toolbar { position: sticky; top: 0; background: #f4f4f5; padding: 8px 24px; display: flex; gap: 8px; align-items: center; font-size: 10pt; border-bottom: 1px solid #ddd; }
  .toolbar button { font: inherit; padding: 4px 12px; border: 1px solid #888; border-radius: 6px; background: #fff; cursor: pointer; }
  @media print {
    .toolbar { display: none; }
    main { padding: 0; max-width: none; }
    @page { margin: 12mm; }
  }
`;

function page(title: string, css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${BASE_CSS}${css}</style></head>
<body><div class="toolbar"><button type="button" onclick="window.print()">Print / save as PDF</button><span>Made with Castcut</span></div>
<main>${body}</main></body></html>`;
}

export type StoryboardFrame = {
  /** "1", "2A"… */
  number: string;
  image?: string;
  heading: string;
  /** Label / text pairs under the picture (Beat, Line, Camera…); empty texts are left out. */
  notes: Array<[string, string | undefined]>;
};

/** A storyboard: numbered frames in a grid, each with its picture and notes. */
export function storyboardHtml(input: {
  title: string;
  subtitle?: string;
  frames: readonly StoryboardFrame[];
  origin: string;
  /** Frame shape (the film's): wide 16:9, vertical 9:16, square. */
  shape?: 'wide' | 'vertical' | 'square';
}): string {
  const ratio =
    input.shape === 'vertical' ? '9 / 16' : input.shape === 'square' ? '1 / 1' : '16 / 9';
  const css = `
    .grid { display: grid; grid-template-columns: repeat(${input.shape === 'vertical' ? 4 : 3}, 1fr); gap: 14px; }
    .frame { break-inside: avoid; border: 1px solid #ccc; border-radius: 6px; overflow: hidden; }
    .pic { aspect-ratio: ${ratio}; background: #eee; display: flex; align-items: center; justify-content: center; color: #888; font-size: 9pt; }
    .pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .body { padding: 6px 8px 8px; }
    .num { font-weight: 700; margin-right: 6px; }
    .heading { font-weight: 600; }
    dl { margin: 4px 0 0; font-size: 9pt; }
    dt { color: #666; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; margin-top: 3px; }
    dd { margin: 0; }
  `;
  const frames = input.frames
    .map(frame => {
      const src = absoluteUrl(frame.image, input.origin);
      const notes = frame.notes
        .filter(([, text]) => text?.trim())
        .map(([label, text]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text!.trim())}</dd>`)
        .join('');
      return `<article class="frame"><div class="pic">${
        src ? `<img src="${escapeHtml(src)}" alt="">` : 'No still yet'
      }</div><div class="body"><span class="num">${escapeHtml(frame.number)}</span><span class="heading">${escapeHtml(frame.heading)}</span>${
        notes ? `<dl>${notes}</dl>` : ''
      }</div></article>`;
    })
    .join('');
  return page(
    `${input.title} — storyboard`,
    css,
    `<header><h1>${escapeHtml(input.title)} — storyboard</h1><div class="meta">${escapeHtml(
      input.subtitle ?? ''
    )}<br>${input.frames.length} frame${input.frames.length === 1 ? '' : 's'}</div></header><section class="grid">${frames}</section>`
  );
}

export type CallSheetRow = {
  number: string;
  /** When in the story (Morning, 9:00…). */
  when?: string;
  place?: string;
  /** Who is in it. */
  cast?: string;
  beat?: string;
  line?: string;
  outfit?: string;
  camera?: string;
  /** Done, waiting, failed… */
  status?: string;
  thumb?: string;
};

/** A call sheet: the day's shots as a table, one row each, with a thumbnail. */
export function callSheetHtml(input: {
  title: string;
  subtitle?: string;
  /** Header facts: Cast, mood, engine… */
  facts: Array<[string, string | undefined]>;
  rows: readonly CallSheetRow[];
  origin: string;
}): string {
  const css = `
    .facts { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-bottom: 14px; font-size: 10pt; }
    .facts b { color: #555; font-weight: 600; margin-right: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1.5px solid #111; padding: 4px 6px; }
    td { border-bottom: 1px solid #ddd; padding: 6px; vertical-align: top; }
    tr { break-inside: avoid; }
    td.n { font-weight: 700; width: 2.5em; }
    td.t img { width: 72px; height: 48px; object-fit: cover; border-radius: 3px; display: block; background: #eee; }
    .line { font-style: italic; }
  `;
  const cell = (value?: string, cls = '') =>
    `<td${cls ? ` class="${cls}"` : ''}>${escapeHtml(value?.trim() ?? '')}</td>`;
  const rows = input.rows
    .map(row => {
      const src = absoluteUrl(row.thumb, input.origin);
      return `<tr>${cell(row.number, 'n')}<td class="t">${src ? `<img src="${escapeHtml(src)}" alt="">` : ''}</td>${cell(row.when)}${cell(row.place)}${cell(row.cast)}<td>${escapeHtml(row.beat?.trim() ?? '')}${
        row.line?.trim() ? `<div class="line">“${escapeHtml(row.line.trim())}”</div>` : ''
      }</td>${cell(row.outfit)}${cell(row.camera)}${cell(row.status)}</tr>`;
    })
    .join('');
  const facts = input.facts
    .filter(([, value]) => value?.trim())
    .map(([label, value]) => `<span><b>${escapeHtml(label)}</b>${escapeHtml(value!.trim())}</span>`)
    .join('');
  return page(
    `${input.title} — call sheet`,
    css,
    `<header><h1>${escapeHtml(input.title)} — call sheet</h1><div class="meta">${escapeHtml(
      input.subtitle ?? ''
    )}</div></header>${facts ? `<div class="facts">${facts}</div>` : ''}<table><thead><tr><th>#</th><th></th><th>When</th><th>Where</th><th>Who</th><th>What happens</th><th>Wearing</th><th>Camera</th><th>State</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

/** A screenplay block: a scene heading, action, a character's line (with an optional parenthetical). */
export type ScriptBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'action'; text: string }
  | { kind: 'dialogue'; character: string; text: string; parenthetical?: string }
  | { kind: 'transition'; text: string };

/** A script in screenplay layout (Courier, the usual indents), for print / PDF. */
export function scriptHtml(input: {
  title: string;
  author?: string;
  blocks: readonly ScriptBlock[];
}): string {
  const css = `
    main { max-width: 8.5in; font: 12pt/1.25 "Courier Prime", "Courier New", Courier, monospace; }
    .title { text-align: center; margin: 2in 0 1in; break-after: page; }
    .title h1 { font: inherit; font-weight: 700; text-transform: uppercase; margin-bottom: 1em; }
    .heading { font-weight: 700; text-transform: uppercase; margin: 1.5em 0 0.6em; }
    .action { margin: 0 0 1em; white-space: pre-wrap; }
    .dialogue { margin: 0 0 1em 1.5in; width: 3.5in; }
    .character { margin-left: 1in; text-transform: uppercase; }
    .paren { margin-left: 0.5in; }
    .transition { text-align: right; text-transform: uppercase; margin: 1em 0; }
    @media print { main { max-width: none; } @page { margin: 1in 1in 1in 1.5in; } }
  `;
  const blocks = input.blocks
    .map(block => {
      if (block.kind === 'heading') return `<p class="heading">${escapeHtml(block.text)}</p>`;
      if (block.kind === 'action') return `<p class="action">${escapeHtml(block.text)}</p>`;
      if (block.kind === 'transition') return `<p class="transition">${escapeHtml(block.text)}</p>`;
      return `<div class="dialogue"><div class="character">${escapeHtml(block.character)}</div>${
        block.parenthetical ? `<div class="paren">(${escapeHtml(block.parenthetical)})</div>` : ''
      }<div>${escapeHtml(block.text)}</div></div>`;
    })
    .join('');
  return page(
    `${input.title} — script`,
    css,
    `<section class="title"><h1>${escapeHtml(input.title)}</h1>${
      input.author ? `<p>Written by<br>${escapeHtml(input.author)}</p>` : ''
    }</section>${blocks}`
  );
}

/**
 * The same script in Fountain (plain-text screenplay markup) — opens in Highland, Fade In,
 * WriterSolo, Final Draft (import) and the like.
 */
export function scriptFountain(input: {
  title: string;
  author?: string;
  blocks: readonly ScriptBlock[];
}): string {
  const head = [`Title: ${input.title}`, ...(input.author ? [`Author: ${input.author}`] : []), ''];
  const body = input.blocks.map(block => {
    if (block.kind === 'heading') {
      // A forced heading (".") when it doesn't start INT. / EXT.
      const text = block.text.toUpperCase();
      return `${/^(INT|EXT|EST|INT\.\/EXT|I\/E)[ .]/.test(text) ? '' : '.'}${text}\n`;
    }
    if (block.kind === 'action') return `${block.text}\n`;
    if (block.kind === 'transition') return `> ${block.text.toUpperCase()}\n`;
    return `${block.character.toUpperCase()}\n${block.parenthetical ? `(${block.parenthetical})\n` : ''}${block.text}\n`;
  });
  return `${head.join('\n')}\n${body.join('\n')}`;
}
