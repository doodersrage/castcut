export const GITHUB_REPO_URL = 'https://github.com/doodersrage/castcut';

/** owner/repo slug, e.g. for the GitHub REST API. */
export const GITHUB_REPO_SLUG = GITHUB_REPO_URL.replace(/^https:\/\/github\.com\//, '');

export function githubBugReportUrl(input?: { pathname?: string }): string {
  const url = new URL(`${GITHUB_REPO_URL}/issues/new`);
  const path = input?.pathname?.trim();
  const lines = ['**What happened**', '', '**Steps to reproduce**', ''];
  if (path) {
    lines.push(`**Page:** \`${path}\``);
  }
  url.searchParams.set('body', lines.join('\n'));
  return url.toString();
}

export function openGitHubBugReport(): void {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : undefined;
  window.open(githubBugReportUrl({ pathname }), '_blank', 'noopener,noreferrer');
}
