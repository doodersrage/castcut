import { APP_HAS_PLAY } from './app-profile';

/** This app's repository (issues, releases): Castcut, or the classic Prompt Studio. */
export const GITHUB_REPO_URL = APP_HAS_PLAY
  ? 'https://github.com/doodersrage/castcut'
  : 'https://github.com/doodersrage/prompt-studio';

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
