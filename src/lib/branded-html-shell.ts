/** Shared Castcut header for HTML exports (compare, portfolio, etc.). */

const SECTION_CARD =
  'margin-bottom:24px;padding:16px 18px;border:1px solid rgba(91,127,196,0.28);border-radius:14px;background:rgba(20,27,36,0.92);box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);';

export function brandedHtmlSection(innerHtml: string): string {
  return `<section style="${SECTION_CARD}">${innerHtml}</section>`;
}

export function brandedHtmlDocument(input: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  metaLine?: string;
}): string {
  const subtitle = input.subtitle
    ? `<div style="font-family:system-ui,sans-serif;font-size:12px;color:#9eb6e0;margin-top:2px;">${escapeBrandedHtml(input.subtitle)}</div>`
    : '';
  const meta = input.metaLine
    ? `<p style="font-family:system-ui,sans-serif;color:#71717a;margin:0 0 28px;">${escapeBrandedHtml(input.metaLine)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeBrandedHtml(input.title)} · Castcut</title>
</head>
<body style="font-family:Georgia,'Times New Roman',serif;background:#0b0f14;color:#ececef;padding:32px 24px;max-width:960px;margin:0 auto;">
  <header style="display:flex;align-items:center;gap:14px;margin-bottom:8px;">
    <div style="width:40px;height:40px;border-radius:10px;border:1.5px solid #5eead4;background:#141b24;display:flex;flex-direction:column;justify-content:center;padding:8px 9px;gap:4px;box-sizing:border-box;">
      <div style="height:3px;width:18px;background:#5eead4;border-radius:2px;"></div>
      <div style="height:3px;width:13px;background:#38bdf8;border-radius:2px;"></div>
      <div style="height:3px;width:16px;background:#f0ab7c;border-radius:2px;"></div>
    </div>
    <div>
      <div style="font-size:22px;font-weight:600;letter-spacing:-0.03em;">Castcut</div>
      ${subtitle}
    </div>
  </header>
  <div style="margin:12px 0 28px;">
    <span style="display:inline-block;height:3px;width:28px;background:#5eead4;border-radius:2px;"></span>
    <span style="display:inline-block;height:3px;width:20px;background:#38bdf8;border-radius:2px;margin-left:4px;"></span>
    <span style="display:inline-block;height:3px;width:24px;background:#f0ab7c;border-radius:2px;margin-left:4px;"></span>
  </div>
  <h1 style="font-size:28px;margin:0 0 8px;letter-spacing:-0.03em;">${escapeBrandedHtml(input.title)}</h1>
  ${meta}
  ${input.bodyHtml}
</body>
</html>`;
}

export function escapeBrandedHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
