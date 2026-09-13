/**
 * Shared branded HTML shell for transactional email.
 * Uses inline styles + table layout for client compatibility.
 */

import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';

const BRAND_MARK_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40"><rect width="64" height="64" rx="16" fill="#0b0f14"/><rect x="14" y="14" width="36" height="36" rx="9" fill="#141b24" stroke="#5eead4" stroke-width="1.75"/><rect x="21" y="24" width="18" height="3.2" rx="1.6" fill="#5eead4"/><rect x="21" y="30.5" width="13" height="3.2" rx="1.6" fill="#38bdf8" opacity="0.85"/><rect x="21" y="37" width="16" height="3.2" rx="1.6" fill="#f0ab7c" opacity="0.75"/></svg>`
);

export function brandedEmailHtml(input: {
  title: string;
  bodyHtml: string;
  footerUrl?: string;
  preheader?: string;
}): string {
  const origin = input.footerUrl ?? process.env.PROMPT_API_URL?.trim() ?? 'http://127.0.0.1:47832';
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeEmailHtml(input.preheader)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>${escapeEmailHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#0c0c10;color:#ececef;font-family:Georgia,'Iowan Old Style','Palatino Linotype',serif;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c10;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#14141a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
      <tr><td style="padding:28px 28px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:12px;">
            <img src="data:image/svg+xml,${BRAND_MARK_SVG}" width="40" height="40" alt="" style="display:block;border-radius:10px;border:1px solid rgba(255,255,255,0.08);" />
          </td>
          <td style="vertical-align:middle;">
            <div style="font-family:Georgia,'Iowan Old Style','Palatino Linotype',serif;font-size:22px;font-weight:600;letter-spacing:-0.03em;color:#ececef;">${PRODUCT_NAME}</div>
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#9eb6e0;margin-top:2px;">${escapeEmailHtml(PRODUCT_TAGLINE)}</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:8px 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <div style="height:3px;width:28px;background:#5eead4;border-radius:2px;display:inline-block;"></div>
        <div style="height:3px;width:20px;background:#38bdf8;border-radius:2px;display:inline-block;margin-left:4px;"></div>
        <div style="height:3px;width:24px;background:#f0ab7c;border-radius:2px;display:inline-block;margin-left:4px;"></div>
      </td></tr>
      <tr><td style="padding:20px 28px 8px;">
        <h1 style="margin:0;font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.03em;color:#ececef;">${escapeEmailHtml(input.title)}</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#a1a4ad;">
        ${input.bodyHtml}
      </td></tr>
      <tr><td style="padding:16px 28px 24px;border-top:1px solid rgba(255,255,255,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#6b6f7a;">
        <a href="${escapeEmailHtml(origin)}" style="color:#9eb6e0;text-decoration:none;">Open ${PRODUCT_NAME}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function emailParagraphs(lines: string[]): string {
  return lines
    .filter(line => line.trim().length > 0)
    .map(line => {
      if (/^https?:\/\//i.test(line.trim())) {
        const url = escapeEmailHtml(line.trim());
        return `<p style="margin:0 0 12px;"><a href="${url}" style="color:#9eb6e0;">${url}</a></p>`;
      }
      return `<p style="margin:0 0 12px;color:#a1a4ad;">${escapeEmailHtml(line)}</p>`;
    })
    .join('');
}

function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
