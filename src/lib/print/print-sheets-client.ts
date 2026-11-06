/**
 * Open a printable sheet (print-sheets.ts) in a new tab — its own Print button saves it as PDF —
 * or download a text file (a Fountain script). Client only.
 */

/** Open the page in a new tab (from a click, so it isn't blocked). */
export function openPrintSheet(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  // The tab has loaded it by then; the blob is freed after a while.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Download text as a file. */
export function downloadText(text: string, filename: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A file name from a title: "Rae's day" → "raes-day". */
export function sheetFilename(title: string, suffix: string): string {
  const slug = title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'castcut'}-${suffix}`;
}

/**
 * A tab opened now (from the click — opened later, after renders, it would be blocked), filled
 * with a sheet when it is ready, or closed.
 */
export function openPrintSheetLater(): { show: (html: string) => void; close: () => void } {
  const tab = window.open('', '_blank');
  tab?.document.write(
    '<!DOCTYPE html><title>Rendering…</title><p style="font:14px sans-serif;padding:24px">Rendering — this tab fills in when it is done.</p>'
  );
  return {
    show: html => {
      if (!tab || tab.closed) {
        openPrintSheet(html);
        return;
      }
      tab.document.open();
      tab.document.write(html);
      tab.document.close();
    },
    close: () => tab?.close(),
  };
}
